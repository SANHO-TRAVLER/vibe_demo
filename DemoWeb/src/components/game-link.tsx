"use client"

import { prefetchGame } from "@/lib/prefetch-game"

// 게임 링크. 게임은 Next 페이지가 아니라 public/game 의 정적 파일(pygbag)이라 일반 링크로 연다.
// 마우스를 올리거나 손가락이 닿는 순간 게임 파일을 미리 받기 시작한다.
export function GameLink({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <a href="/game/index.html" className={className} onPointerEnter={prefetchGame} onTouchStart={prefetchGame} onFocus={prefetchGame}>
      {children}
    </a>
  )
}
