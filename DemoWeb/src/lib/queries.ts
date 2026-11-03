import { connection } from "next/server"

import { CATEGORIES, sql, toComment, toPost, type Category, type Comment, type Post } from "@/lib/db"

export const PAGE_SIZE = 10

// 화면에 내보내는 값에는 비밀번호 해시가 없다(SELECT 에서 아예 뺀다).
export type PublicComment = Comment
export type PublicPost = Post & { comments: PublicComment[] }
export type PostSummary = Omit<Post, "content"> & { commentCount: number }

export function parseCategory(value: unknown): Category | undefined {
  return CATEGORIES.find((c) => c === value)
}

// LIKE 검색어의 %, _ 는 글자 그대로 찾도록 이스케이프한다.
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

export async function listPosts(opts: { q?: string; category?: Category; page?: number }) {
  // DB 조회는 요청마다 새로 해야 하므로 프리렌더에서 제외한다.
  await connection()
  const q = opts.q?.trim() ? likePattern(opts.q.trim()) : null
  const category = opts.category ?? null

  const [{ total }] = await sql`
    SELECT count(*)::int AS total FROM posts
    WHERE (${category}::text IS NULL OR category = ${category})
      AND (${q}::text IS NULL OR title ILIKE ${q} OR content ILIKE ${q} OR author ILIKE ${q})`
  const pageCount = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE))
  const page = Math.min(Math.max(1, opts.page ?? 1), pageCount)

  // 공지는 맨 위, 나머지는 최신순
  const rows = await sql`
    SELECT p.id, p.category, p.title, p.author, p.views, p.created_at, p.updated_at,
           (SELECT count(*)::int FROM comments c WHERE c.post_id = p.id) AS comment_count
    FROM posts p
    WHERE (${category}::text IS NULL OR p.category = ${category})
      AND (${q}::text IS NULL OR p.title ILIKE ${q} OR p.content ILIKE ${q} OR p.author ILIKE ${q})
    ORDER BY (p.category = '공지') DESC, p.id DESC
    LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`
  const posts: PostSummary[] = rows.map((row) => {
    const p = toPost(row)
    return {
      id: p.id,
      category: p.category,
      title: p.title,
      author: p.author,
      views: p.views,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      commentCount: Number(row.comment_count),
    }
  })
  return { posts, total: Number(total), page, pageCount }
}

export async function getPost(id: number): Promise<PublicPost | null> {
  await connection()
  const [row] = await sql`
    SELECT id, category, title, content, author, views, created_at, updated_at
    FROM posts WHERE id = ${id}`
  if (!row) return null
  const comments = await sql`
    SELECT id, author, content, created_at FROM comments
    WHERE post_id = ${id} ORDER BY created_at, id`
  return { ...toPost(row), comments: comments.map(toComment) }
}

// 스카이 웨딩 게임(shooting.py)이 하객 말풍선에 쓰는 목록
export async function listPostTitles() {
  await connection()
  const rows = await sql`SELECT id, title, author FROM posts ORDER BY id`
  return rows.map((r) => ({ id: Number(r.id), title: String(r.title), author: String(r.author) }))
}
