"use client"

import { useActionState, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { FormState } from "@/lib/actions"

// 비밀번호를 받아 삭제 같은 작업을 실행하는 확인 창
export function PasswordDialog({
  action,
  title,
  description,
  confirmLabel,
  trigger,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  title: string
  description: string
  confirmLabel: string
  trigger: React.ReactElement
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(async (prev: FormState, fd: FormData) => {
    const result = await action(prev, fd)
    if (!result.error && !result.fieldErrors) setOpen(false)
    return result
  }, {})
  const message = state.error ?? state.fieldErrors?.password

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="riso-card ring-0 sm:max-w-sm">
        <form action={formAction} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl leading-tight text-ink-pink">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="비밀번호"
              aria-label="비밀번호"
              aria-invalid={Boolean(message)}
              autoFocus
              className="h-11 rounded-full border-2 bg-card px-4 text-base"
            />
            {message && <p className="text-destructive text-xs">{message}</p>}
          </div>
          <DialogFooter className="border-t-2 border-dashed border-ink-pink/60 bg-transparent">
            <DialogClose render={<Button type="button" variant="outline" className="print-btn h-10 bg-card px-5" />}>
              취소
            </DialogClose>
            <Button
              type="submit"
              disabled={pending}
              className="print-btn h-10 bg-destructive px-5 font-heading text-base text-primary-foreground hover:bg-destructive/90"
            >
              {pending ? "처리 중…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
