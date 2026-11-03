import { cn } from "@/lib/utils"

// 게임(shooting.py)의 하객과 같은 동물 옷 아이들 (UKI 그림처럼 통통한 몸 + 동물 모자 + 비껴 그은 선)
// [옷 색, 선 색, 얼굴 색]
const COSTUMES = {
  bunny: ["var(--ink-pink)", "var(--ink-purple)", "var(--ink-yellow)"],
  chick: ["var(--ink-yellow)", "var(--ink-coral)", "var(--ink-pink)"],
  frog: ["var(--ink-green)", "var(--ink-teal)", "var(--ink-yellow)"],
  cat: ["var(--ink-blue)", "var(--ink-purple)", "var(--ink-pink)"],
  bear: ["var(--ink-coral)", "var(--ink-purple)", "var(--ink-yellow)"],
  lion: ["var(--ink-yellow)", "var(--ink-coral)", "var(--ink-pink)"],
  sheep: ["#fffbf4", "var(--ink-pink)", "var(--ink-pink)"],
} as const

export type Costume = keyof typeof COSTUMES
export const COSTUME_KINDS = Object.keys(COSTUMES) as Costume[]

// 동물별 귀·갈기·털 (모자 뒤에 깔린다)
function Ears({ kind, fill }: { kind: Costume; fill: string }) {
  switch (kind) {
    case "bunny":
      return (
        <>
          <ellipse cx="38" cy="16" rx="8" ry="19" fill={fill} />
          <ellipse cx="62" cy="16" rx="8" ry="19" fill={fill} />
        </>
      )
    case "bear":
      return (
        <>
          <circle cx="27" cy="27" r="11" fill={fill} />
          <circle cx="73" cy="27" r="11" fill={fill} />
        </>
      )
    case "cat":
      return (
        <>
          <path d="M24 38 L27 10 L48 24 Z" fill={fill} strokeLinejoin="round" />
          <path d="M76 38 L73 10 L52 24 Z" fill={fill} strokeLinejoin="round" />
        </>
      )
    case "frog":
      return (
        <>
          <circle cx="35" cy="24" r="11" fill={fill} />
          <circle cx="65" cy="24" r="11" fill={fill} />
          <circle cx="35" cy="23" r="5.5" fill="#fffbf4" />
          <circle cx="65" cy="23" r="5.5" fill="#fffbf4" />
          <circle cx="35" cy="23" r="2.4" fill="var(--ink-text)" />
          <circle cx="65" cy="23" r="2.4" fill="var(--ink-text)" />
        </>
      )
    case "chick":
      return <path d="M46 24 Q44 8 52 12 Q60 6 56 24 Z" fill={fill} />
    case "lion":
      return (
        <>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2
            return (
              <circle key={i} cx={50 + Math.cos(a) * 30} cy={48 + Math.sin(a) * 30} r="11" fill="var(--ink-coral)" />
            )
          })}
        </>
      )
    case "sheep":
      return (
        <>
          {Array.from({ length: 11 }, (_, i) => {
            const a = (i / 11) * Math.PI * 2
            return <circle key={i} cx={50 + Math.cos(a) * 27} cy={48 + Math.sin(a) * 27} r="10" fill={fill} />
          })}
          <circle cx="18" cy="52" r="9" fill="var(--ink-yellow)" />
          <circle cx="82" cy="52" r="9" fill="var(--ink-yellow)" />
        </>
      )
  }
}

function Kid({ kind }: { kind: Costume }) {
  const [fill, line, face] = COSTUMES[kind]
  const body = (
    <>
      <ellipse cx="34" cy="111" rx="10" ry="7" />
      <ellipse cx="66" cy="111" rx="10" ry="7" />
      <path d="M22 108 Q16 70 32 66 L68 66 Q84 70 78 108 Q50 116 22 108 Z" />
      <ellipse cx="20" cy="86" rx="8" ry="12" />
      <ellipse cx="80" cy="86" rx="8" ry="12" />
      <circle cx="50" cy="48" r="27" />
    </>
  )
  return (
    <g>
      <g stroke={line} strokeWidth="0">
        <Ears kind={kind} fill={fill} />
      </g>
      <g fill={fill}>{body}</g>
      {/* 선 판: 1.5칸 비껴 찍힌 손그림 선 */}
      <g fill="none" stroke={line} strokeWidth="2.4" strokeLinecap="round" transform="translate(1.6 1.8)">
        {body}
        <path d="M50 76 L50 104" />
      </g>
      {/* 웃는 얼굴: 발그레한 볼 + 반달 눈(^ ^) + 활짝 웃는 입 (게임과 같은 얼굴) */}
      <circle cx="50" cy="52" r="17" fill={face} />
      {kind === "chick" && <path d="M44 33 L56 33 L50 40 Z" fill="var(--ink-coral)" />}
      <ellipse cx="38.5" cy="57.5" rx="5" ry="3.2" fill={face === "var(--ink-pink)" ? "var(--ink-coral)" : "var(--ink-pink)"} />
      <ellipse cx="61.5" cy="57.5" rx="5" ry="3.2" fill={face === "var(--ink-pink)" ? "var(--ink-coral)" : "var(--ink-pink)"} />
      <path d="M40.5 51.5 Q43.5 46.5 46.5 51.5 M53.5 51.5 Q56.5 46.5 59.5 51.5" fill="none" stroke="var(--ink-text)"
        strokeWidth="2" strokeLinecap="round" />
      <path d="M45.5 56 Q50 63.5 54.5 56 Z" fill="var(--ink-coral)" stroke="var(--ink-text)" strokeWidth="1.4" strokeLinejoin="round" />
    </g>
  )
}

export function CostumeKid({
  kind,
  size = 64,
  className,
  label,
}: {
  kind: Costume
  size?: number
  className?: string
  label?: string
}) {
  return (
    <svg
      viewBox="0 -6 100 128"
      width={size}
      height={(size * 128) / 100}
      className={cn("ink-grain overflow-visible", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Kid kind={kind} />
    </svg>
  )
}

// 손잡은 신랑(곰 옷)과 신부(토끼 옷), 머리 위에 하트
export function Couple({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 -40 230 168"
      width="230"
      height="168"
      className={cn("ink-grain overflow-visible", className)}
      role="img"
      aria-label="손을 맞잡은 곰 옷 신랑과 토끼 옷 신부"
    >
      <g transform="translate(14 0)">
        <Kid kind="bear" />
      </g>
      <g transform="translate(116 0)">
        <Kid kind="bunny" />
      </g>
      {/* 맞잡은 손 */}
      <path d="M100 88 Q115 98 130 88" fill="none" stroke="var(--ink-coral)" strokeWidth="9" strokeLinecap="round" />
      <circle cx="115" cy="94" r="7" fill="var(--ink-yellow)" />
      {/* 하트: 핑크 판 뒤로 옐로 판이 비껴 찍힘 */}
      <path d="M115 -2 C107 -12 92 -6 96 6 C99 15 115 24 115 24 C115 24 131 15 134 6 C138 -6 123 -12 115 -2 Z"
        fill="var(--ink-yellow)" transform="translate(3 3)" />
      <path d="M115 -2 C107 -12 92 -6 96 6 C99 15 115 24 115 24 C115 24 131 15 134 6 C138 -6 123 -12 115 -2 Z"
        fill="var(--ink-pink)" />
    </svg>
  )
}

// 페이지 어디서나 쓰는 잉크 결 필터 (layout 에 한 번 깐다)
export function InkGrainFilter() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <filter id="ink-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="7" result="noise" />
        <feColorMatrix
          in="noise"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -4 0 0 0 3.3"
          result="mask"
        />
        <feComposite in="SourceGraphic" in2="mask" operator="in" />
      </filter>
    </svg>
  )
}
