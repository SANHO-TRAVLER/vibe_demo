"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { FormState } from "@/lib/actions"

export function CommentForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
}) {
  const [state, formAction, pending] = useActionState(action, {})
  const err = state.fieldErrors ?? {}
  const message = state.error ?? err.author ?? err.password ?? err.content

  return (
    <form action={formAction} className="grid gap-2">
      <div className="flex gap-2">
        <Input
          name="author"
          defaultValue={state.values?.author}
          maxLength={20}
          placeholder="작성자"
          aria-label="작성자"
          aria-invalid={Boolean(err.author)}
          className="max-w-36"
        />
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="비밀번호"
          aria-label="댓글 비밀번호"
          aria-invalid={Boolean(err.password)}
          className="max-w-36"
        />
      </div>
      <Textarea
        name="content"
        defaultValue={state.values?.content}
        maxLength={1000}
        rows={3}
        placeholder="댓글을 남겨 주세요"
        aria-label="댓글 내용"
        aria-invalid={Boolean(err.content)}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-destructive text-xs">
          {message && (err.password && message === err.password ? `비밀번호: ${message}` : message)}
        </p>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "등록 중…" : "댓글 등록"}
        </Button>
      </div>
    </form>
  )
}
