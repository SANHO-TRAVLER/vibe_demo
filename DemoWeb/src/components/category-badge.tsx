import { Badge } from "@/components/ui/badge"
import type { Category } from "@/lib/db"

export function CategoryBadge({ category }: { category: Category }) {
  return (
    <Badge variant={category === "공지" ? "default" : "secondary"} className="shrink-0">
      {category}
    </Badge>
  )
}
