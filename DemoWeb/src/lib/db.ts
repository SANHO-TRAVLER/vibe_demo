import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

import { neon } from "@neondatabase/serverless"

import type { Category } from "@/lib/categories"

export { CATEGORIES, type Category } from "@/lib/categories"

// 게시판 데이터는 Neon PostgreSQL에 저장한다. 연결 문자열은 .env.local 의 DATABASE_URL.
const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL 이 없습니다. DemoWeb/.env.local 을 확인하세요.")
const raw = neon(url)

export type Comment = {
  id: string
  author: string
  content: string
  createdAt: string
}

export type Post = {
  id: number
  category: Category
  title: string
  content: string
  author: string
  views: number
  createdAt: string
  updatedAt: string
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

// 처음 쓸 때 한 번 테이블을 만들고, 글이 하나도 없으면 샘플 글을 넣는다.
// 개발 서버는 여러 곳에서 동시에 이 함수를 부를 수 있으므로, 잠금을 건 한 트랜잭션 안에서 한다.
async function setup() {
  const samples: Array<[Category, string, string, string]> = [
    ["공지", "게시판 이용 안내", "글을 쓸 때 정한 비밀번호로 수정·삭제할 수 있습니다.\n샘플 글의 비밀번호는 1234 입니다.", "운영자"],
    ["자유", "첫 글 남겨봅니다", "새 게시판이 열렸네요. 다들 반갑습니다!", "산호"],
    ["질문", "Next.js 16에서 캐시는 어떻게 동작하나요?", "cacheComponents 옵션을 켜면 무엇이 달라지는지 궁금합니다.", "궁금이"],
    ["정보", "shadcn/ui 컴포넌트 추가하는 법", "npx shadcn@latest add button 처럼 필요한 컴포넌트만 골라 넣으면 됩니다.", "개발자"],
  ]
  const col = (i: number) => samples.map((s) => s[i])
  const times = samples.map((_, i) => new Date(Date.now() - (samples.length - i) * 90 * 60_000).toISOString())

  await raw.transaction([
    raw`SELECT pg_advisory_xact_lock(20261103)`,
    raw`
      CREATE TABLE IF NOT EXISTS posts (
        id            serial PRIMARY KEY,
        category      text NOT NULL,
        title         text NOT NULL,
        content       text NOT NULL,
        author        text NOT NULL,
        password_hash text NOT NULL,
        views         integer NOT NULL DEFAULT 0,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )`,
    raw`
      CREATE TABLE IF NOT EXISTS comments (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id       integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        author        text NOT NULL,
        content       text NOT NULL,
        password_hash text NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now()
      )`,
    raw`CREATE INDEX IF NOT EXISTS comments_post_id_idx ON comments (post_id)`,
    raw`
      INSERT INTO posts (category, title, content, author, password_hash, created_at, updated_at)
      SELECT s.category, s.title, s.content, s.author, ${hashPassword("1234")}, s.at, s.at
      FROM unnest(${col(0)}::text[], ${col(1)}::text[], ${col(2)}::text[], ${col(3)}::text[],
                  ${times}::timestamptz[]) WITH ORDINALITY AS s(category, title, content, author, at, n)
      WHERE NOT EXISTS (SELECT 1 FROM posts)
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
  return raw(strings, ...values) as Promise<Record<string, unknown>[]>
}

const iso = (v: unknown) => (v instanceof Date ? v : new Date(String(v))).toISOString()

export function toPost(row: Record<string, unknown>): Post {
  return {
    id: Number(row.id),
    category: row.category as Category,
    title: String(row.title),
    content: String(row.content ?? ""),
    author: String(row.author),
    views: Number(row.views),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export function toComment(row: Record<string, unknown>): Comment {
  return {
    id: String(row.id),
    author: String(row.author),
    content: String(row.content),
    createdAt: iso(row.created_at),
  }
}
