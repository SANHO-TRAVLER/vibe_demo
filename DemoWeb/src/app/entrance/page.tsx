import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"

import { EntranceScene } from "@/components/entrance-scene"
import { listEntrance } from "@/lib/queries"

export const metadata: Metadata = { title: "하객 입장 · 스카이 웨딩 축하 방명록" }

export default function EntrancePage() {
  return (
    <div className="space-y-4 pt-6">
      <Link href="/" className="font-heading text-ink-blue">
        ← 방명록으로
      </Link>
      <h1 className="text-center font-heading text-3xl">
        하객 <span className="text-ink-pink">와글와글</span> 입장 중!
      </h1>
      <Suspense fallback={<div className="riso-card mx-auto aspect-[3/4] w-full max-w-[480px] animate-pulse opacity-50" />}>
        <Scene />
      </Suspense>
    </div>
  )
}

async function Scene() {
  return <EntranceScene guests={await listEntrance()} />
}
