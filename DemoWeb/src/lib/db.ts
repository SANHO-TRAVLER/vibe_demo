import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

import { neon } from "@neondatabase/serverless"

// 방명록 데이터는 Neon PostgreSQL의 guestbook 테이블에 저장한다. 연결 문자열은 DATABASE_URL
// (로컬은 .env.local, Vercel은 프로젝트 환경 변수).
// 빌드 중에는 모듈만 읽고 쿼리는 하지 않으므로, 값 확인은 첫 쿼리 때 한다.
// (예전 게시판 시절의 posts·comments 테이블은 더 쓰지 않지만 지우지 않고 그대로 둔다.)
let client: ReturnType<typeof neon> | null = null

function db() {
  if (client) return client
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL 이 없습니다. DemoWeb/.env.local 또는 Vercel 환경 변수를 확인하세요.")
  client = neon(url)
  return client
}

export const NICKNAME_MAX = 12
export const MESSAGE_MAX = 100
// 방명록 전체 글 수 상한. 넘으면 새 글을 받지 않는다 (자동 프로그램 도배로 DB 가 무한정 커지는 것을 막는다).
export const MAX_ENTRIES = 5000

export type Entry = {
  id: number
  nickname: string
  message: string
  createdAt: string
}

// 비밀번호는 salt를 붙인 scrypt 해시("salt:hash")로만 보관한다.
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 32).toString("hex")
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":")
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, "hex")
  const actual = scryptSync(password, salt, expected.length)
  return timingSafeEqual(expected, actual)
}

// 처음 쓸 때 한 번 테이블을 만들고, 글이 하나도 없으면 예시 축하글을 넣는다.
// 개발 서버는 여러 곳에서 동시에 이 함수를 부를 수 있으므로, 잠금을 건 한 트랜잭션 안에서 한다.
async function setup() {
  const samples: Array<[string, string]> = [
    ["신랑친구", "결혼 축하해!! 하늘에서 손잡은 것처럼 평생 꼭 붙어 다녀라 ♥"],
    ["신부동생", "언니 너무 예쁘다... 행복하게 잘 살아야 해!"],
    ["회사동기", "두 분의 앞날에 꽃길만 가득하길! 축하드립니다 ★"],
  ]
  const times = samples.map((_, i) => new Date(Date.now() - (samples.length - i) * 30 * 60_000).toISOString())
  const raw = db()

  await raw.transaction([
    raw`SELECT pg_advisory_xact_lock(20261103)`,
    raw`
      CREATE TABLE IF NOT EXISTS guestbook (
        id            serial PRIMARY KEY,
        nickname      text NOT NULL,
        message       text NOT NULL,
        password_hash text NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now()
      )`,
    raw`
      INSERT INTO guestbook (nickname, message, password_hash, created_at)
      SELECT s.nickname, s.message, ${hashPassword("1234")}, s.at
      FROM unnest(${samples.map((s) => s[0])}::text[], ${samples.map((s) => s[1])}::text[],
                  ${times}::timestamptz[]) WITH ORDINALITY AS s(nickname, message, at, n)
      WHERE NOT EXISTS (SELECT 1 FROM guestbook)
      ORDER BY s.n`,
  ])
}

let ready: Promise<void> | null = null

// 모든 쿼리는 이 함수로 한다. 테이블 준비가 끝난 뒤에 실행된다.
export async function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  ready ??= setup().catch((err) => {
    ready = null
    throw err
  })
  await ready
  return db()(strings, ...values) as Promise<Record<string, unknown>[]>
}

const iso = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).toISOString()

export function toEntry(row: Record<string, unknown>): Entry {
  return {
    id: Number(row.id),
    nickname: String(row.nickname),
    message: String(row.message),
    createdAt: iso(row.created_at),
  }
}
