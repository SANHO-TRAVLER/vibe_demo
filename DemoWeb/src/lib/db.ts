import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

// 게시판 데이터는 별도 DB 없이 data/db.json 파일 하나에 저장한다.
const DATA_DIR = path.join(process.cwd(), "data")
const DB_FILE = path.join(DATA_DIR, "db.json")

import type { Category } from "@/lib/categories"

export { CATEGORIES, type Category } from "@/lib/categories"

export type Comment = {
  id: string
  author: string
  content: string
  passwordHash: string
  createdAt: string
}

export type Post = {
  id: number
  category: Category
  title: string
  content: string
  author: string
  passwordHash: string
  views: number
  createdAt: string
  updatedAt: string
  comments: Comment[]
}

type Database = {
  nextId: number
  posts: Post[]
}

// 비밀번호는 salt를 붙인 scrypt 해시("salt:hash")로만 보관한다.
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 32).toString("hex")
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":")
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, "hex")
  const actual = scryptSync(password, salt, expected.length)
  return timingSafeEqual(expected, actual)
}

function seed(): Database {
  const now = Date.now()
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString()
  const pw = hashPassword("1234")
  const samples: Array<[Category, string, string, string]> = [
    ["공지", "게시판 이용 안내", "글을 쓸 때 정한 비밀번호로 수정·삭제할 수 있습니다.\n샘플 글의 비밀번호는 1234 입니다.", "운영자"],
    ["자유", "첫 글 남겨봅니다", "새 게시판이 열렸네요. 다들 반갑습니다!", "산호"],
    ["질문", "Next.js 16에서 캐시는 어떻게 동작하나요?", "cacheComponents 옵션을 켜면 무엇이 달라지는지 궁금합니다.", "궁금이"],
    ["정보", "shadcn/ui 컴포넌트 추가하는 법", "npx shadcn@latest add button 처럼 필요한 컴포넌트만 골라 넣으면 됩니다.", "개발자"],
  ]
  const posts: Post[] = samples.map(([category, title, content, author], i) => ({
    id: i + 1,
    category,
    title,
    content,
    author,
    passwordHash: pw,
    views: 0,
    createdAt: at((samples.length - i) * 90),
    updatedAt: at((samples.length - i) * 90),
    comments: [],
  }))
  return { nextId: posts.length + 1, posts }
}

async function load(): Promise<Database> {
  try {
    return JSON.parse(await readFile(DB_FILE, "utf8")) as Database
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    const db = seed()
    await save(db)
    return db
  }
}

async function save(db: Database) {
  await mkdir(DATA_DIR, { recursive: true })
  // 임시 파일에 쓴 뒤 바꿔치기해서 쓰는 도중 파일이 깨지지 않게 한다.
  const tmp = `${DB_FILE}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(db, null, 2), "utf8")
  await rename(tmp, DB_FILE)
}

// 쓰기 작업이 겹치지 않도록 한 줄로 세운다.
let queue: Promise<unknown> = Promise.resolve()

export function read<T>(fn: (db: Database) => T): Promise<T> {
  const run = queue.then(async () => fn(await load()))
  queue = run.catch(() => {})
  return run
}

export function mutate<T>(fn: (db: Database) => T): Promise<T> {
  const run = queue.then(async () => {
    const db = await load()
    const result = fn(db)
    await save(db)
    return result
  })
  queue = run.catch(() => {})
  return run
}

export function newCommentId() {
  return randomUUID()
}
