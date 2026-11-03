import { Suspense } from "react"
import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon, MessageSquareIcon, SearchIcon } from "lucide-react"

import { CategoryBadge } from "@/components/category-badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CATEGORIES, type Category } from "@/lib/categories"
import { formatListDate } from "@/lib/format"
import { listPosts, parseCategory } from "@/lib/queries"
import { cn } from "@/lib/utils"

export default function Home(props: PageProps<"/">) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">전체 글</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          자유롭게 글을 남겨 주세요. 수정·삭제는 글쓸 때 정한 비밀번호로 합니다.
        </p>
      </div>
      <Suspense fallback={<BoardSkeleton />}>
        <Board searchParams={props.searchParams} />
      </Suspense>
    </div>
  )
}

type Query = { q?: string; category?: Category; page?: number }

// 현재 조건에서 일부만 바꾼 목록 주소를 만든다.
function href(base: Query, patch: Query) {
  const next = { ...base, ...patch }
  const sp = new URLSearchParams()
  if (next.category) sp.set("category", next.category)
  if (next.q) sp.set("q", next.q)
  if (next.page && next.page > 1) sp.set("page", String(next.page))
  const s = sp.toString()
  return s ? `/?${s}` : "/"
}

async function Board({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const sp = await searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const query: Query = {
    q: one(sp.q)?.trim() || undefined,
    category: parseCategory(one(sp.category)),
    page: Number(one(sp.page)) || 1,
  }
  const { posts, total, page, pageCount } = await listPosts(query)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex flex-wrap gap-1.5">
          {[undefined, ...CATEGORIES].map((c) => (
            <Link
              key={c ?? "all"}
              href={href({ q: query.q }, { category: c })}
              className={buttonVariants({
                size: "sm",
                variant: query.category === c ? "default" : "outline",
              })}
            >
              {c ?? "전체"}
            </Link>
          ))}
        </nav>
        <form action="/" className="flex gap-2">
          {query.category && <input type="hidden" name="category" value={query.category} />}
          <Input
            name="q"
            defaultValue={query.q}
            placeholder="제목·내용·작성자 검색"
            className="sm:w-56"
            aria-label="검색어"
          />
          <Button type="submit" variant="outline" size="icon" aria-label="검색">
            <SearchIcon />
          </Button>
        </form>
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden w-16 text-center sm:table-cell">번호</TableHead>
                <TableHead>제목</TableHead>
                <TableHead className="hidden w-28 sm:table-cell">작성자</TableHead>
                <TableHead className="w-24 text-center">작성일</TableHead>
                <TableHead className="hidden w-16 text-center sm:table-cell">조회</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground h-32 text-center">
                    {query.q ? `"${query.q}"에 맞는 글이 없습니다.` : "아직 글이 없습니다."}
                  </TableCell>
                </TableRow>
              )}
              {posts.map((post) => (
                <TableRow
                  key={post.id}
                  className={cn(post.category === "공지" && "bg-muted/50")}
                >
                  <TableCell className="text-muted-foreground hidden text-center sm:table-cell">
                    {post.id}
                  </TableCell>
                  <TableCell className="max-w-0">
                    <Link
                      href={`/posts/${post.id}`}
                      className="flex min-w-0 items-center gap-2 hover:underline"
                    >
                      <CategoryBadge category={post.category} />
                      <span className="truncate font-medium">{post.title}</span>
                      {post.commentCount > 0 && (
                        <span className="text-primary inline-flex shrink-0 items-center gap-0.5 text-xs">
                          <MessageSquareIcon className="size-3" />
                          {post.commentCount}
                        </span>
                      )}
                    </Link>
                    <span className="text-muted-foreground mt-1 block text-xs sm:hidden">
                      {post.author} · 조회 {post.views}
                    </span>
                  </TableCell>
                  <TableCell className="hidden truncate sm:table-cell">{post.author}</TableCell>
                  <TableCell className="text-muted-foreground text-center text-xs">
                    {formatListDate(post.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-center text-xs sm:table-cell">
                    {post.views}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">총 {total}개</p>
        {pageCount > 1 && (
          <nav className="flex items-center gap-1" aria-label="페이지">
            <PageLink href={href(query, { page: page - 1 })} disabled={page <= 1} label="이전 페이지">
              <ChevronLeftIcon />
            </PageLink>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={href(query, { page: n })}
                aria-current={n === page ? "page" : undefined}
                className={buttonVariants({
                  size: "icon-sm",
                  variant: n === page ? "default" : "ghost",
                })}
              >
                {n}
              </Link>
            ))}
            <PageLink
              href={href(query, { page: page + 1 })}
              disabled={page >= pageCount}
              label="다음 페이지"
            >
              <ChevronRightIcon />
            </PageLink>
          </nav>
        )}
      </div>
    </div>
  )
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string
  disabled: boolean
  label: string
  children: React.ReactNode
}) {
  const cls = buttonVariants({ size: "icon-sm", variant: "ghost" })
  if (disabled)
    return (
      <span aria-disabled className={cn(cls, "pointer-events-none opacity-40")}>
        {children}
      </span>
    )
  return (
    <Link href={href} aria-label={label} className={cls}>
      {children}
    </Link>
  )
}

function BoardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="bg-muted h-8 w-72 animate-pulse rounded-lg" />
      <Card className="py-0">
        <CardContent className="space-y-3 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bg-muted h-6 animate-pulse rounded" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
