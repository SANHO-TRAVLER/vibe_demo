import { listPostTitles } from "@/lib/queries"

// 스카이 웨딩 게임(shooting.py)이 읽어 가는 글 목록: [{ id, title, author }]
export async function GET() {
  return Response.json({ posts: await listPostTitles() })
}
