"use client"

import { useActionState } from "react"
import Link from "next/link"

import { Field } from "@/components/field"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { FormState } from "@/lib/actions"
import { CATEGORIES, type Category } from "@/lib/categories"

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  cancelHref: string
  submitLabel: string
  // 수정할 때는 기존 값을 채우고 작성자 칸은 숨긴다.
  initial?: { category: Category; title: string; content: string }
}

export function PostForm({ action, cancelHref, submitLabel, initial }: Props) {
  const [state, formAction, pending] = useActionState(action, {})
  const err = state.fieldErrors ?? {}
  const v = { ...initial, ...state.values }
  const editing = Boolean(initial)

  return (
    <form action={formAction} className="grid gap-5">
      {state.error && (
        <p className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm">
          {state.error}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
        <Field id="category" label="분류" error={err.category}>
          <select
            id="category"
            name="category"
            defaultValue={v.category || "자유"}
            aria-invalid={Boolean(err.category)}
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field id="title" label="제목" error={err.title}>
          <Input
            id="title"
            name="title"
            defaultValue={v.title}
            maxLength={100}
            placeholder="제목을 입력하세요"
            aria-invalid={Boolean(err.title)}
          />
        </Field>
      </div>

      <Field id="content" label="내용" error={err.content}>
        <Textarea
          id="content"
          name="content"
          defaultValue={v.content}
          maxLength={10_000}
          rows={14}
          placeholder="내용을 입력하세요"
          className="min-h-72"
          aria-invalid={Boolean(err.content)}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        {!editing && (
          <Field id="author" label="작성자" error={err.author}>
            <Input
              id="author"
              name="author"
              defaultValue={v.author}
              maxLength={20}
              autoComplete="nickname"
              placeholder="닉네임"
              aria-invalid={Boolean(err.author)}
            />
          </Field>
        )}
        <Field
          id="password"
          label={editing ? "비밀번호 확인" : "비밀번호 (수정·삭제용)"}
          error={err.password}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={editing ? "current-password" : "new-password"}
            placeholder="4자 이상"
            aria-invalid={Boolean(err.password)}
          />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          취소
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중…" : submitLabel}
        </Button>
      </div>
    </form>
  )
}
