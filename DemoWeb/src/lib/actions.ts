"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { hashPassword, mutate, newCommentId, verifyPassword } from "@/lib/db"
import { parseCategory } from "@/lib/queries"

export type FormState = {
  error?: string
  fieldErrors?: Partial<Record<"category" | "title" | "content" | "author" | "password", string>>
  // React가 제출 뒤 폼을 비우므로, 오류가 나면 입력값을 돌려줘 다시 채운다.
  values?: Partial<Record<"category" | "title" | "content" | "author", string>>
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim()

// 글쓰기·수정 폼 공통 검사
function validatePost(formData: FormData, { needAuthor }: { needAuthor: boolean }) {
  const fieldErrors: FormState["fieldErrors"] = {}
  const category = parseCategory(text(formData, "category"))
  const title = text(formData, "title")
  const content = text(formData, "content")
  const author = text(formData, "author")
  const password = String(formData.get("password") ?? "")

  if (!category) fieldErrors.category = "분류를 골라 주세요."
  if (!title) fieldErrors.title = "제목을 입력해 주세요."
  else if (title.length > 100) fieldErrors.title = "제목은 100자 이내로 써 주세요."
  if (!content) fieldErrors.content = "내용을 입력해 주세요."
  else if (content.length > 10_000) fieldErrors.content = "내용은 10,000자 이내로 써 주세요."
  if (needAuthor) {
    if (!author) fieldErrors.author = "작성자를 입력해 주세요."
    else if (author.length > 20) fieldErrors.author = "작성자는 20자 이내로 써 주세요."
  }
  if (password.length < 4) fieldErrors.password = "비밀번호는 4자 이상이어야 합니다."

  const ok = Object.keys(fieldErrors).length === 0
  const values = { category: category ?? "", title, content, author }
  return { ok, fieldErrors, values, data: { category: category!, title, content, author, password } }
}

export async function createPost(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ok, fieldErrors, values, data } = validatePost(formData, { needAuthor: true })
  if (!ok) return { fieldErrors, values }

  const id = await mutate((db) => {
    const now = new Date().toISOString()
    const id = db.nextId++
    db.posts.push({
      id,
      category: data.category,
      title: data.title,
      content: data.content,
      author: data.author,
      passwordHash: hashPassword(data.password),
      views: 0,
      createdAt: now,
      updatedAt: now,
      comments: [],
    })
    return id
  })
  redirect(`/posts/${id}`)
}

export async function updatePost(
  id: number,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { ok, fieldErrors, values, data } = validatePost(formData, { needAuthor: false })
  if (!ok) return { fieldErrors, values }

  const result = await mutate((db) => {
    const post = db.posts.find((p) => p.id === id)
    if (!post) return "missing"
    if (!verifyPassword(data.password, post.passwordHash)) return "denied"
    post.category = data.category
    post.title = data.title
    post.content = data.content
    post.updatedAt = new Date().toISOString()
    return "ok"
  })
  if (result === "missing") return { error: "글을 찾을 수 없습니다.", values }
  if (result === "denied") return { fieldErrors: { password: "비밀번호가 맞지 않습니다." }, values }
  redirect(`/posts/${id}`)
}

export async function deletePost(
  id: number,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const password = String(formData.get("password") ?? "")
  const result = await mutate((db) => {
    const index = db.posts.findIndex((p) => p.id === id)
    if (index < 0) return "missing"
    if (!verifyPassword(password, db.posts[index].passwordHash)) return "denied"
    db.posts.splice(index, 1)
    return "ok"
  })
  if (result === "missing") return { error: "이미 삭제된 글입니다." }
  if (result === "denied") return { fieldErrors: { password: "비밀번호가 맞지 않습니다." } }
  redirect("/")
}

export async function addComment(
  postId: number,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const author = text(formData, "author")
  const content = text(formData, "content")
  const password = String(formData.get("password") ?? "")
  const fieldErrors: FormState["fieldErrors"] = {}
  if (!author) fieldErrors.author = "작성자를 입력해 주세요."
  else if (author.length > 20) fieldErrors.author = "20자 이내로 써 주세요."
  if (!content) fieldErrors.content = "댓글 내용을 입력해 주세요."
  else if (content.length > 1000) fieldErrors.content = "댓글은 1,000자 이내로 써 주세요."
  if (password.length < 4) fieldErrors.password = "4자 이상"
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: { author, content } }

  const found = await mutate((db) => {
    const post = db.posts.find((p) => p.id === postId)
    if (!post) return false
    post.comments.push({
      id: newCommentId(),
      author,
      content,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    })
    return true
  })
  if (!found) return { error: "글을 찾을 수 없습니다.", values: { author, content } }
  refresh()
  return {}
}

export async function deleteComment(
  postId: number,
  commentId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const password = String(formData.get("password") ?? "")
  const result = await mutate((db) => {
    const post = db.posts.find((p) => p.id === postId)
    const index = post?.comments.findIndex((c) => c.id === commentId) ?? -1
    if (!post || index < 0) return "missing"
    if (!verifyPassword(password, post.comments[index].passwordHash)) return "denied"
    post.comments.splice(index, 1)
    return "ok"
  })
  if (result === "missing") return { error: "이미 삭제된 댓글입니다." }
  if (result === "denied") return { fieldErrors: { password: "비밀번호가 맞지 않습니다." } }
  refresh()
  return {}
}

// 상세 화면에 들어올 때 클라이언트에서 한 번 호출한다(프리페치로 조회수가 오르지 않게).
export async function countView(id: number) {
  await mutate((db) => {
    const post = db.posts.find((p) => p.id === id)
    if (post) post.views++
  })
}
