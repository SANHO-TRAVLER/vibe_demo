import type { Metadata, Viewport } from "next"
import { Gowun_Dodum, Jua } from "next/font/google"

import { Couple, InkGrainFilter } from "@/components/costume-kid"
import "./globals.css"

// 제목: 둥글고 통통한 주아 (GANMO 제목 글씨처럼) / 본문: 둥글고 부드러운 고운돋움
// 한글은 글자가 많아 미리 불러오기(preload)는 끄고, 쓰는 글자만 그때그때 받는다.
const title = Jua({ weight: "400", variable: "--font-title", display: "swap", preload: false })
const body = Gowun_Dodum({ weight: "400", variable: "--font-body", display: "swap", preload: false })

export const metadata: Metadata = {
  title: "스카이 웨딩 축하 방명록",
  description: "결혼식장 입구에서 두 사람에게 축하 한마디를 남겨 주세요.",
}

export const viewport: Viewport = {
  themeColor: "#f9f1e6",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${title.variable} ${body.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <InkGrainFilter />
        <header className="relative overflow-hidden">
          <div className="halftone absolute inset-x-0 bottom-0 h-24 opacity-70" aria-hidden />
          <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 pt-10 pb-14 text-center">
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
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-14">{children}</main>
        <footer className="py-8 text-center font-heading text-sm text-ink-pink">
          ♥ Sky Wedding · 행복하게 잘 살아요 ♥
        </footer>
      </body>
    </html>
  )
}
