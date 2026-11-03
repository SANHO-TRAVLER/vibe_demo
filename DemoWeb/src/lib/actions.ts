"use server"

import { refresh } from "next/cache"

import { hashPassword, MESSAGE_MAX, NICKNAME_MAX, sql, verifyPassword } from "@/lib/db"

export type FormState = {
  ok?: boolean
  error?: string
  fieldErrors?: Partial<Record<"nickname" | "message" | "password", string>>
  // React가 제출 뒤 폼을 비우므로, 오류가 나면 입력값을 돌려줘 다시 채운다.
  values?: Partial<Record<"nickname" | "message", string>>
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim()

export async function addEntry(_prev: FormState, formData: FormData): Promise<FormState> {
  const nickname = text(formData, "nickname")
  const message = text(formData, "message")
  const password = String(formData.get("password") ?? "")
  const fieldErrors: FormState["fieldErrors"] = {}

  if (!nickname) fieldErrors.nickname = "닉네임을 적어 주세요."
  else if (nickname.length > NICKNAME_MAX) fieldErrors.nickname = `닉네임은 ${NICKNAME_MAX}자까지예요.`
  if (!message) fieldErrors.message = "축하의 말씀을 적어 주세요."
  else if ([...message].length > MESSAGE_MAX) fieldErrors.message = `축하의 말씀은 ${MESSAGE_MAX}자까지예요.`
  if (password.length < 4) fieldErrors.password = "비밀번호는 4자 이상이에요."
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: { nickname, message } }

  await sql`
    INSERT INTO guestbook (nickname, message, password_hash)
    VALUES (${nickname}, ${message}, ${hashPassword(password)})`
  refresh()
  return { ok: true }
}

export async function deleteEntry(id: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "")
  const [row] = await sql`SELECT password_hash FROM guestbook WHERE id = ${id}`
  if (!row) return { error: "이미 지워진 글이에요." }
  if (!verifyPassword(password, String(row.password_hash))) {
    return { fieldErrors: { password: "비밀번호가 맞지 않아요." } }
  }
  await sql`DELETE FROM guestbook WHERE id = ${id}`
  refresh()
  return { ok: true }
}
