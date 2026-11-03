"use client"

import { useActionState, useState } from "react"

import { Field } from "@/components/field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { addEntry, type FormState } from "@/lib/actions"
import { cn } from "@/lib/utils"

const NICKNAME_MAX = 12
const MESSAGE_MAX = 100

const inputClass = "h-11 rounded-full border-2 bg-card px-4 text-base"

export function GuestbookForm() {
  const [state, formAction, pending] = useActionState(addEntry, {} as FormState)
  // 글자 수 표시. 제출이 끝나면 React가 폼을 비우므로 그때 0(또는 돌려받은 값)으로 맞춘다.
  const [count, setCount] = useState(0)
  const [seen, setSeen] = useState(state)
  if (seen !== state) {
    setSeen(state)
    setCount([...(state.values?.message ?? "")].length)
  }
  const err = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="riso-card grid gap-4 p-5 sm:p-7">
      <h2 className="font-heading text-2xl text-ink-pink">축하 한마디 남기기</h2>
      <Field id="message" label="축하의 말씀" error={err.message}>
        <Textarea
          id="message"
          name="message"
          defaultValue={state.values?.message}
          maxLength={MESSAGE_MAX}
          rows={3}
          placeholder="행복해라!! 결혼 축하해!!"
          aria-invalid={Boolean(err.message)}
          onChange={(e) => setCount([...e.target.value].length)}
          className="min-h-24 resize-none rounded-2xl border-2 bg-card px-4 py-3 text-base leading-7"
        />
        <p
          className={cn(
            "justify-self-end text-xs tabular-nums",
            count >= MESSAGE_MAX ? "text-destructive" : "text-muted-foreground"
          )}
          aria-live="polite"
        >
          {count} / {MESSAGE_MAX}
        </p>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="nickname" label="닉네임" error={err.nickname}>
          <Input
            id="nickname"
            name="nickname"
            defaultValue={state.values?.nickname}
            maxLength={NICKNAME_MAX}
            autoComplete="nickname"
            placeholder="신랑친구"
            aria-invalid={Boolean(err.nickname)}
            className={inputClass}
          />
        </Field>
        <Field id="password" label="비밀번호 (지울 때 써요)" error={err.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="4자 이상"
            aria-invalid={Boolean(err.password)}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-heading text-ink-green" aria-live="polite">
          {state.ok ? "♥ 고마워요! 축하가 걸렸어요." : state.error}
        </p>
        <Button
          type="submit"
          disabled={pending}
          className="print-btn h-12 px-6 font-heading text-lg hover:bg-ink-pink/90"
        >
          {pending ? "보내는 중…" : "축하 남기기 ♥"}
        </Button>
      </div>
    </form>
  )
}
