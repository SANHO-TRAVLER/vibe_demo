import { Suspense } from "react"
import { notFound } from "next/navigation"

import { PostForm } from "@/components/post-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { updatePost } from "@/lib/actions"
import { getPost } from "@/lib/queries"

export default function EditPostPage(props: PageProps<"/posts/[id]/edit">) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-bold">글 수정</CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<div className="bg-muted h-96 animate-pulse rounded-lg" />}>
          <EditForm params={props.params} />
        </Suspense>
      </CardContent>
    </Card>
  )
}

async function EditForm({ params }: { params: PageProps<"/posts/[id]/edit">["params"] }) {
  const id = Number((await params).id)
  const post = Number.isInteger(id) ? await getPost(id) : null
  if (!post) notFound()

  return (
    <PostForm
      action={updatePost.bind(null, post.id)}
      cancelHref={`/posts/${post.id}`}
      submitLabel="수정 완료"
      initial={{ category: post.category, title: post.title, content: post.content }}
    />
  )
}
