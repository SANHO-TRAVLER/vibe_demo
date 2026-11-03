import type { Metadata } from "next"
import Link from "next/link"
import { Geist_Mono, Noto_Sans_KR } from "next/font/google"
import { PenLineIcon } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import "./globals.css"

const notoSans = Noto_Sans_KR({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: { default: "DemoWeb 게시판", template: "%s · DemoWeb 게시판" },
  description: "Next.js · shadcn/ui · TypeScript로 만든 게시판",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${notoSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-muted/30">
        <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-4">
            <Link href="/" className="text-lg font-bold tracking-tight">
              DemoWeb <span className="text-muted-foreground font-medium">게시판</span>
            </Link>
            <Link href="/posts/new" className={buttonVariants({ size: "sm" })}>
              <PenLineIcon data-icon="inline-start" />
              글쓰기
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
        <footer className="text-muted-foreground border-t py-6 text-center text-xs">
          Next.js · shadcn/ui · TypeScript
        </footer>
      </body>
    </html>
  )
}
