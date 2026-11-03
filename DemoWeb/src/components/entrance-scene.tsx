"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { COSTUME_KINDS, Couple, CostumeKid, type Costume } from "@/components/costume-kid"
import { prefetchGame } from "@/lib/prefetch-game"
import { cn } from "@/lib/utils"

type Guest = { id: number; nickname: string; message: string }

// 하객이 한 명씩 걸어 들어오는 간격(초)과 걷는 시간(초)
const GAP = 0.55
const WALK = 5.2
// 방명록 글이 적어도 와글와글해 보이도록, 모자라면 이름 없는 하객으로 채운다
const MIN_CROWD = 14

type Walker = { key: string; kind: Costume; guest?: Guest; star?: boolean }

const walkerOf = (g: Guest, star = false): Walker => ({
  key: `guest-${g.id}`,
  kind: COSTUME_KINDS[g.id % COSTUME_KINDS.length], // 옷은 방명록 목록과 같은 id % 7
  guest: g,
  star,
})

// newId(방금 글을 쓴 사람)는 무리 맨 끝, 신랑 신부 바로 앞에 주인공처럼 들어온다
function crowd(guests: Guest[], newId?: number): Walker[] {
  const star = guests.find((g) => g.id === newId)
  const others = guests.filter((g) => g !== star)
  const total = Math.max(others.length, MIN_CROWD)
  const walkers: Walker[] = Array.from({ length: total }, (_, i) => ({
    key: `extra-${i}`,
    kind: COSTUME_KINDS[(i * 3) % COSTUME_KINDS.length],
  }))
  // 방명록 하객은 무리 사이사이에 고르게 끼운다
  others.forEach((g, j) => {
    walkers[Math.floor((j * total) / others.length)] = walkerOf(g)
  })
  if (star) walkers.push(walkerOf(star, true))
  return walkers
}

/**
 * 와글와글 하객 입장 → 신랑 신부 입장 → 하트 팡팡. 문에는 게임으로 가는 '결혼식장 들어가기' 버튼.
 * 방명록 글 하나가 동물 옷 하객 한 명이다 (옷은 방명록 목록과 같은 id % 7).
 * inline: 방명록에 글을 쓴 직후 폼 아래에서 틀 때 (끝 버튼을 줄인다)
 */
export function EntranceScene({ guests, newId, inline = false }: { guests: Guest[]; newId?: number; inline?: boolean }) {
  const [run, setRun] = useState(0) // 다시 보기: key 를 바꿔 애니메이션을 처음부터
  // 하객이 입장하는 동안 게임 파일을 미리 받아 두면, 문을 눌렀을 때 게임이 빨리 뜬다
  useEffect(() => {
    const timer = setTimeout(prefetchGame, 1500)
    return () => clearTimeout(timer)
  }, [])
  const walkers = crowd(guests, newId)
  const coupleAt = walkers.length * GAP + 1.6
  const endAt = coupleAt + 5.4

  return (
    <div className="space-y-6">
      <div
        key={run}
        className="entrance relative mx-auto aspect-[3/4] w-full max-w-[480px] overflow-hidden rounded-[2rem] border-[2.5px] border-ink-pink bg-[#fffaf2] shadow-[6px_6px_0_var(--ink-yellow)]"
        style={{ "--couple-at": `${coupleAt}s`, "--end-at": `${endAt}s` } as React.CSSProperties}
      >
        <Hall />

        {walkers.map(({ key, kind, guest: g, star }, i) => {
          const fromLeft = i % 2 === 0
          const lane = (i * 37) % 5 // 다섯 줄로 나눠 걷기
          const style = {
            "--delay": `${i * GAP}s`,
            "--walk": `${WALK}s`,
            "--x0": fromLeft ? "-18%" : "104%",
            "--y0": `${60 + lane * 6}%`,
            "--x1": star ? "50%" : `${46 + ((i * 13) % 9) - 4}%`,
            "--y1": "38%",
            "--bob": `${0.32 + (i % 4) * 0.04}s`,
          } as React.CSSProperties
          return (
            <div key={key} className="walker absolute" style={style} aria-hidden>
              <div className="walker-bob relative">
                <CostumeKid kind={kind} size={star ? 66 : g ? 54 : 46} />
                {g && (
                  <span
                    className={cn(
                      "absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-1.5 font-heading whitespace-nowrap",
                      star ? "bg-ink-pink text-[13px] text-white" : "bg-white/90 text-[11px] text-ink-text"
                    )}
                  >
                    {star ? `♥ ${g.nickname}` : g.nickname}
                  </span>
                )}
                {g && (
                  <span className="walker-bubble absolute bottom-full left-1/2 mb-1 w-max max-w-[150px] -translate-x-1/2 rounded-2xl border-2 border-ink-pink bg-white px-2 py-1 text-[11px] leading-4 text-ink-text shadow-[2px_2px_0_var(--ink-yellow)]">
                    {g.message.length > 22 ? `${g.message.slice(0, 22)}…` : g.message}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {/* 신랑 신부 입장 */}
        <div className="couple-walk absolute left-1/2" aria-hidden>
          <div className="walker-bob">
            <Couple className="h-auto w-[150px]" />
          </div>
        </div>
        <p className="couple-banner misprint absolute inset-x-0 top-[8%] text-center font-heading text-4xl" data-text="신랑 신부 입장!">
          신랑 신부 입장!
        </p>
        <Hearts />

        {/* 문에 단 버튼: 누르면 게임(public/game, pygbag)에서 결혼식이 이어진다 */}
        <a
          href="/game/index.html"
          className="door-btn print-btn absolute top-[30%] left-1/2 z-20 inline-flex h-10 -translate-x-1/2 -translate-y-1/2 items-center bg-white px-4 font-heading text-[15px] whitespace-nowrap text-ink-pink"
        >
          결혼식장 들어가기 ▶
        </a>

        <p className="sr-only">
          방명록에 축하를 남긴 하객 {guests.length}명이 동물 옷을 입고 식장으로 들어간 뒤, 곰 옷 신랑과 토끼 옷 신부가
          손을 잡고 입장합니다.
        </p>
      </div>

      <div className="entrance-end flex flex-col items-center gap-3" style={{ "--end-at": `${endAt}s` } as React.CSSProperties} key={`end-${run}`}>
        <p className="font-heading text-xl text-ink-pink">축하해 주셔서 고마워요 ♥</p>
        <p className="text-sm text-muted-foreground">문의 &lsquo;결혼식장 들어가기&rsquo;를 누르면 게임에서 결혼식이 이어져요</p>
        {!inline && (
          <Link href="/" className="print-btn inline-flex h-12 items-center bg-card px-6 font-heading text-lg">
            방명록 쓰기
          </Link>
        )}
        <button
          type="button"
          onClick={() => setRun((r) => r + 1)}
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          처음부터 다시 보기
        </button>
      </div>
    </div>
  )
}

// 식장 입구: 둥근 아치 문, 꽃 줄, 옐로 망점 바닥
function Hall() {
  return (
    <svg viewBox="0 0 300 400" className="absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="floor-dots" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <circle cx="5" cy="5" r="2.6" fill="var(--ink-yellow)" />
        </pattern>
        <linearGradient id="floor-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id="floor-mask">
          <rect x="0" y="190" width="300" height="210" fill="url(#floor-fade)" />
        </mask>
      </defs>
      {/* 바닥: 아래로 갈수록 진해지는 망점 */}
      <rect x="0" y="190" width="300" height="210" fill="url(#floor-dots)" mask="url(#floor-mask)" />
      {/* 핑크 카펫 */}
      <path d="M128 190 L172 190 L215 400 L85 400 Z" fill="var(--ink-pink)" opacity=".85" />
      {/* 아치 문: 옐로 판이 비껴 찍힌 그림자 → 하늘색 문 → 핑크 테두리 */}
      <path d="M95 192 L95 120 Q95 62 150 62 Q205 62 205 120 L205 192 Z" fill="var(--ink-yellow)" transform="translate(5 4)" />
      <path d="M95 192 L95 120 Q95 62 150 62 Q205 62 205 120 L205 192 Z" fill="var(--ink-blue)" />
      <path d="M112 192 L112 124 Q112 82 150 82 Q188 82 188 124 L188 192 Z" fill="#fffaf2" opacity=".55" />
      <path d="M95 192 L95 120 Q95 62 150 62 Q205 62 205 120 L205 192" fill="none" stroke="var(--ink-pink)" strokeWidth="4" />
      <path d="M150 82 L150 192" stroke="var(--ink-pink)" strokeWidth="2" opacity=".6" />
      {/* 꽃 줄 */}
      {Array.from({ length: 13 }, (_, i) => {
        const a = Math.PI * (1 + i / 12)
        const colors = ["var(--ink-pink)", "#fffaf2", "var(--ink-yellow)", "var(--ink-green)"]
        return <circle key={i} cx={150 + Math.cos(a) * 62} cy={120 + Math.sin(a) * 62} r="7" fill={colors[i % 4]} stroke="var(--ink-purple)" strokeWidth="1" />
      })}
      {/* 양옆 꽃 화분 */}
      {[60, 240].map((x) => (
        <g key={x}>
          <rect x={x - 14} y="168" width="28" height="24" rx="8" fill="var(--ink-coral)" />
          {[-10, 0, 10].map((dx, j) => (
            <circle key={dx} cx={x + dx} cy={158 - (j === 1 ? 6 : 0)} r="9" fill={j === 1 ? "var(--ink-yellow)" : "var(--ink-pink)"} />
          ))}
        </g>
      ))}
    </svg>
  )
}

// 신랑 신부가 문 앞에 닿으면 팡 터지는 하트
function Hearts() {
  return (
    <div className="hearts pointer-events-none absolute inset-0" aria-hidden>
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2
        const style = {
          "--hx": `${Math.cos(a) * (90 + (i % 3) * 30)}px`,
          "--hy": `${Math.sin(a) * (80 + (i % 4) * 22) - 40}px`,
          "--hd": `${(i % 5) * 0.08}s`,
        } as React.CSSProperties
        return (
          <span key={i} className={cn("heart absolute left-1/2 top-[42%] font-heading text-2xl", i % 3 === 0 ? "text-ink-yellow" : "text-ink-pink")} style={style}>
            ♥
          </span>
        )
      })}
    </div>
  )
}
