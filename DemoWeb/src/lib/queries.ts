import { connection } from "next/server"

import { CATEGORIES, read, type Category, type Post } from "@/lib/db"

export const PAGE_SIZE = 10

// 화면에 내보낼 때는 비밀번호 해시를 뺀다.
export type PublicComment = Omit<Post["comments"][number], "passwordHash">
export type PublicPost = Omit<Post, "passwordHash" | "comments"> & {
  comments: PublicComment[]
}
export type PostSummary = Omit<PublicPost, "content" | "comments"> & {
  commentCount: number
}

function toPublic(post: Post): PublicPost {
  return {
    id: post.id,
    category: post.category,
    title: post.title,
    content: post.content,
    author: post.author,
    views: post.views,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    comments: post.comments.map((c) => ({
      id: c.id,
      author: c.author,
      content: c.content,
      createdAt: c.createdAt,
    })),
  }
}

export function parseCategory(value: unknown): Category | undefined {
  return CATEGORIES.find((c) => c === value)
}

export async function listPosts(opts: { q?: string; category?: Category; page?: number }) {
  // 파일 읽기는 요청마다 새로 해야 하므로 프리렌더에서 제외한다.
  await connection()
  const q = opts.q?.trim().toLowerCase() ?? ""
  return read((db) => {
    const filtered = db.posts
      .filter((p) => !opts.category || p.category === opts.category)
      .filter(
        (p) =>
          !q ||
          p.title.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q) ||
          p.author.toLowerCase().includes(q)
      )
      // 공지는 맨 위, 나머지는 최신순
      .sort((a, b) => {
        const notice = Number(b.category === "공지") - Number(a.category === "공지")
        return notice || b.id - a.id
      })

    const total = filtered.length
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const page = Math.min(Math.max(1, opts.page ?? 1), pageCount)
    const posts: PostSummary[] = filtered
      .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      .map((p) => ({
        id: p.id,
        category: p.category,
        title: p.title,
        author: p.author,
        views: p.views,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        commentCount: p.comments.length,
      }))
    return { posts, total, page, pageCount }
  })
}

export async function getPost(id: number) {
  await connection()
  return read((db) => {
    const post = db.posts.find((p) => p.id === id)
    return post ? toPublic(post) : null
  })
}
