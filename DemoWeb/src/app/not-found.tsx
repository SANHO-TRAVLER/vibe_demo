import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <p className="text-5xl font-bold">404</p>
      <p className="text-muted-foreground">찾는 글이 없거나 삭제되었습니다.</p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        목록으로
      </Link>
    </div>
  )
}
