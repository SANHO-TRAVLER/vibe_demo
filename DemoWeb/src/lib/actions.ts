"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { hashPassword, sql, verifyPassword } from "@/lib/db"
import { parseCategory } from "@/lib/queries"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 비밀번호 해시를 읽어 맞는지 본다. 없으면 "missing", 틀리면 "denied"
function check(rows: Record<string, unknown>[], password: string) {
  if (!rows[0]) return "missing" as const
  return verifyPassword(password, String(rows[0].password_hash)) ? ("ok" as const) : ("denied" as const)
}

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

  const [{ id }] = await sql`
    INSERT INTO posts (category, title, content, author, password_hash)
    VALUES (${data.category}, ${data.title}, ${data.content}, ${data.author}, ${hashPassword(data.password)})
    RETURNING id`
  redirect(`/posts/${id}`)
}

export async function updatePost(
  id: number,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { ok, fieldErrors, values, data } = validatePost(formData, { needAuthor: false })
  if (!ok) return { fieldErrors, values }

  const result = check(await sql`SELECT password_hash FROM posts WHERE id = ${id}`, data.password)
  if (result === "ok") {
    await sql`
      UPDATE posts
      SET category = ${data.category}, title = ${data.title}, content = ${data.content}, updated_at = now()
      WHERE id = ${id}`
  }
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
  const result = check(await sql`SELECT password_hash FROM posts WHERE id = ${id}`, password)
  // 댓글은 ON DELETE CASCADE 로 함께 지워진다.
  if (result === "ok") await sql`DELETE FROM posts WHERE id = ${id}`
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

  // 글이 이미 지워졌으면 아무 줄도 들어가지 않는다.
  const inserted = await sql`
    INSERT INTO comments (post_id, author, content, password_hash)
    SELECT id, ${author}, ${content}, ${hashPassword(password)} FROM posts WHERE id = ${postId}
    RETURNING id`
  if (!inserted.length) return { error: "글을 찾을 수 없습니다.", values: { author, content } }
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
  const rows = UUID.test(commentId)
    ? await sql`SELECT password_hash FROM comments WHERE id = ${commentId} AND post_id = ${postId}`
    : []
  const result = check(rows, password)
  if (result === "ok") await sql`DELETE FROM comments WHERE id = ${commentId}`
  if (result === "missing") return { error: "이미 삭제된 댓글입니다." }
  if (result === "denied") return { fieldErrors: { password: "비밀번호가 맞지 않습니다." } }
  refresh()
  return {}
}

// 상세 화면에 들어올 때 클라이언트에서 한 번 호출한다(프리페치로 조회수가 오르지 않게).
export async function countView(id: number) {
  await sql`UPDATE posts SET views = views + 1 WHERE id = ${id}`
}
