"use client"

import { useEffect, useRef } from "react"

import { countView } from "@/lib/actions"

// 실제로 화면에 열렸을 때만 조회수를 올린다(개발 모드의 이중 실행도 막는다).
export function ViewCounter({ id }: { id: number }) {
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    countView(id)
  }, [id])
  return null
}
