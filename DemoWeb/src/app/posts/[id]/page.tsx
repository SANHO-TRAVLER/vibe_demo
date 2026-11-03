import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { EyeIcon, ListIcon, MessageSquareIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react"

import { CategoryBadge } from "@/components/category-badge"
import { CommentForm } from "@/components/comment-form"
import { PasswordDialog } from "@/components/password-dialog"
import { ViewCounter } from "@/components/view-counter"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { addComment, deleteComment, deletePost } from "@/lib/actions"
import { formatFullDate } from "@/lib/format"
import { getPost } from "@/lib/queries"

export async function generateMetadata(props: PageProps<"/posts/[id]">): Promise<Metadata> {
  const post = await getPost(Number((await props.params).id))
  return { title: post?.title ?? "글 없음" }
}

export default function PostPage(props: PageProps<"/posts/[id]">) {
  return (
    <Suspense fallback={<PostSkeleton />}>
      <PostDetail params={props.params} />
    </Suspense>
  )
}

async function PostDetail({ params }: { params: PageProps<"/posts/[id]">["params"] }) {
  const id = Number((await params).id)
  const post = Number.isInteger(id) ? await getPost(id) : null
  if (!post) notFound()

  const edited = post.updatedAt !== post.createdAt

  return (
    <div className="space-y-6">
      <ViewCounter id={post.id} />

      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-center gap-2">
            <CategoryBadge category={post.category} />
            <h1 className="text-xl font-bold break-all">{post.title}</h1>
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-foreground font-medium">{post.author}</span>
            <span>
              {formatFullDate(post.createdAt)}
              {edited && " (수정됨)"}
            </span>
            <span className="inline-flex items-center gap-1">
              <EyeIcon className="size-3.5" />
              {post.views}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageSquareIcon className="size-3.5" />
              {post.comments.length}
            </span>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="min-h-40 py-2 leading-7 break-words whitespace-pre-wrap">
          {post.content}
        </CardContent>
        <CardFooter className="justify-between gap-2">
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ListIcon data-icon="inline-start" />
            목록
          </Link>
          <div className="flex gap-2">
            <Link
              href={`/posts/${post.id}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <PencilIcon data-icon="inline-start" />
              수정
            </Link>
            <PasswordDialog
              action={deletePost.bind(null, post.id)}
              title="글 삭제"
              description="글을 쓸 때 정한 비밀번호를 입력하세요. 삭제하면 되돌릴 수 없습니다."
              confirmLabel="삭제"
              trigger={
                <Button variant="destructive" size="sm">
                  <Trash2Icon data-icon="inline-start" />
                  삭제
                </Button>
              }
            />
          </div>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">댓글 {post.comments.length}</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          {post.comments.length > 0 && (
            <ul className="divide-y">
              {post.comments.map((c) => (
                <li key={c.id} className="flex gap-3 py-3 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 text-sm">
                      <span className="font-medium">{c.author}</span>
                      <span className="text-muted-foreground text-xs">
                        {formatFullDate(c.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm break-words whitespace-pre-wrap">{c.content}</p>
                  </div>
                  <PasswordDialog
                    action={deleteComment.bind(null, post.id, c.id)}
                    title="댓글 삭제"
                    description="댓글을 쓸 때 정한 비밀번호를 입력하세요."
                    confirmLabel="삭제"
                    trigger={
                      <Button variant="ghost" size="icon-xs" aria-label="댓글 삭제">
                        <XIcon />
                      </Button>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          <CommentForm action={addComment.bind(null, post.id)} />
        </CardContent>
      </Card>
    </div>
  )
}

function PostSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="bg-muted h-7 w-2/3 animate-pulse rounded" />
        <div className="bg-muted h-4 w-1/3 animate-pulse rounded" />
        <div className="bg-muted h-40 animate-pulse rounded" />
      </CardContent>
    </Card>
  )
}
