import { cacheLife } from "next/cache"
import { connection } from "next/server"

import { sql, toEntry, type Entry } from "@/lib/db"

export const PAGE_SIZE = 24

// 방명록 한 쪽 (최신 글부터). 비밀번호 해시는 SELECT 에서 아예 뺀다.
export async function listEntries(page = 1) {
  // DB 조회는 요청마다 새로 해야 하므로 프리렌더에서 제외한다.
  await connection()
  const [{ total }] = await sql`SELECT count(*)::int AS total FROM guestbook`
  const pageCount = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE))
  const current = Math.min(Math.max(1, page), pageCount)
  const rows = await sql`
    SELECT id, nickname, message, created_at FROM guestbook
    ORDER BY id DESC
    LIMIT ${PAGE_SIZE} OFFSET ${(current - 1) * PAGE_SIZE}`
  const entries: Entry[] = rows.map(toEntry)
  return { entries, total: Number(total), page: current, pageCount }
}

export type EntranceGuest = { id: number; nickname: string; message: string }

// 하객 입장 애니메이션(/entrance)에 나올 하객: 최근 글 24개를 먼저 쓴 순서대로
export async function listEntrance(limit = 24) {
  await connection()
  return entranceGuests(limit)
}

// 글을 남긴 직후(Server Action)에도 쓰므로 connection() 없이 조회만 하는 부분
export async function entranceGuests(limit = 24): Promise<EntranceGuest[]> {
  const rows = await sql`
    SELECT id, nickname, message FROM (
      SELECT id, nickname, message FROM guestbook ORDER BY id DESC LIMIT ${limit}
    ) recent ORDER BY id`
  return rows.map((r) => ({ id: Number(r.id), nickname: String(r.nickname), message: String(r.message) }))
}

// 게임 말풍선에 쓸 글 수. 누구나 부를 수 있는 주소라, 글이 아무리 많아도 최근 것만 보낸다.
export const POSTS_FOR_GAME = 200

// 스카이 웨딩 게임(shooting.py)이 하객 말풍선에 쓰는 목록 (최근 POSTS_FOR_GAME 개, 먼저 쓴 순서대로).
// 게임이 읽는 모양({ id, title, author })은 그대로 두고, 축하 한마디를 title 로 보낸다.
// 이 주소를 마구 불러도 DB 를 매번 읽지 않도록 1분 정도 저장해 두고 재사용한다 ('minutes' = 1분마다 새로).
export async function listPostTitles() {
  "use cache"
  cacheLife("minutes")
  const rows = await sql`
    SELECT id, nickname, message FROM (
      SELECT id, nickname, message FROM guestbook ORDER BY id DESC LIMIT ${POSTS_FOR_GAME}
    ) recent ORDER BY id`
  return rows.map((r) => ({ id: Number(r.id), title: String(r.message), author: String(r.nickname) }))
}
