import type { Metadata } from "next"

import { PostForm } from "@/components/post-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createPost } from "@/lib/actions"

export const metadata: Metadata = { title: "글쓰기" }

export default function NewPostPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-bold">글쓰기</CardTitle>
      </CardHeader>
      <CardContent>
        <PostForm action={createPost} cancelHref="/" submitLabel="등록" />
      </CardContent>
    </Card>
  )
}
