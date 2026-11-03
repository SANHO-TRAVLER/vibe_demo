import Link from "next/link"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-5 py-16 text-center">
      <p className="misprint font-heading text-6xl" data-text="404">
        404
      </p>
      <p className="text-muted-foreground">찾는 쪽이 없어요.</p>
      <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "print-btn bg-card px-5")}>
        방명록으로
      </Link>
    </div>
  )
}
