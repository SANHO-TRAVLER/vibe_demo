import Link from "next/link"

import { Couple } from "@/components/costume-kid"
import { GameLink } from "@/components/game-link"

// 방명록 첫 화면 머리: 손잡은 신랑 신부, 제목, 하객 입장·게임 버튼
export function Hero() {
  return (
    <header className="relative -mx-4 overflow-hidden">
      <div className="halftone absolute inset-x-0 bottom-0 h-24 opacity-70" aria-hidden />
      <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 pt-10 pb-6 text-center">
        <Couple className="h-auto w-[200px] sm:w-[230px]" />
        <p className="font-heading text-sm tracking-[0.25em] text-ink-blue">SKY WEDDING · GUEST BOOK</p>
        <h1 className="misprint font-heading text-[40px] leading-tight sm:text-[52px]" data-text="축하 방명록">
          축하 방명록
        </h1>
        <p className="max-w-sm text-[15px] leading-7">
          두 사람에게 축하 한마디를 남겨 주세요.
          <br />
          남긴 글은 식장 하객의 말풍선으로 몽글몽글 떠올라요!
        </p>
        <nav className="flex flex-wrap justify-center gap-3 pt-2" aria-label="결혼식 보러 가기">
          <Link href="/entrance" className="print-btn inline-flex h-11 items-center bg-ink-yellow px-5 font-heading text-base">
            하객 입장 보기 ▶
          </Link>
          {/* 게임은 public/game 의 정적 파일(pygbag). 손이 닿으면 미리 받기 시작한다 */}
          <GameLink className="print-btn inline-flex h-11 items-center bg-ink-pink px-5 font-heading text-base text-white">
            게임 하기 ♥
          </GameLink>
        </nav>
      </div>
    </header>
  )
}
