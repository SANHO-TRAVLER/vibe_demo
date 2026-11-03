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

// 스카이 웨딩 게임(shooting.py)이 하객 말풍선에 쓰는 목록.
// 게임이 읽는 모양({ id, title, author })은 그대로 두고, 축하 한마디를 title 로 보낸다.
export async function listPostTitles() {
  await connection()
  const rows = await sql`SELECT id, nickname, message FROM guestbook ORDER BY id`
  return rows.map((r) => ({ id: Number(r.id), title: String(r.message), author: String(r.nickname) }))
}
