import { connection } from "next/server"

import { listPostTitles } from "@/lib/queries"

// 스카이 웨딩 게임(shooting.py)이 읽어 가는 글 목록: [{ id, title, author }]
// connection() 으로 빌드 때 미리 만들지 않게 하고, 목록 자체는 listPostTitles 가 1분씩 저장해 둔다.
export async function GET() {
  await connection()
  return Response.json({ posts: await listPostTitles() })
}
