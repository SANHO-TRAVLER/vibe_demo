# DemoWeb 게시판

Next.js 16(App Router) · shadcn/ui · TypeScript로 만든 익명 게시판.

## 실행

데이터는 [Neon](https://neon.tech) PostgreSQL에 저장한다. 먼저 `.env.example`을 `.env.local`로 복사하고 `DATABASE_URL`에 Neon 연결 문자열을 넣는다.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm start   # 프로덕션
```

## 기능

- 글 목록: 분류(자유·질문·정보·공지) 필터, 제목·내용·작성자 검색, 페이지 나눔(10개씩), 공지 상단 고정
- 글쓰기 / 수정 / 삭제: 회원가입 없이 글쓸 때 정한 비밀번호로 수정·삭제
- 댓글 작성·삭제(댓글별 비밀번호), 조회수

## 구조

| 경로 | 내용 |
|---|---|
| `src/app/page.tsx` | 목록 (검색·분류·페이지) |
| `src/app/posts/new` | 글쓰기 |
| `src/app/posts/[id]` | 상세 + 댓글, `[id]/edit` 수정 |
| `src/app/api/posts` | 글 목록 JSON (`shooting.py` 하객 말풍선이 읽어 감) |
| `src/lib/db.ts` | Neon 연결(`@neondatabase/serverless`), 테이블 생성·샘플 글, 비밀번호 scrypt 해시 |
| `src/lib/queries.ts` | 화면용 조회(비밀번호 해시 제외) |
| `src/lib/actions.ts` | Server Actions (작성·수정·삭제·댓글·조회수) |
| `src/components/ui` | shadcn/ui 컴포넌트 (`npx shadcn@latest add …`) |

테이블(`posts`, `comments`)은 첫 요청 때 자동으로 만들어지고, 글이 하나도 없으면 샘플 글 4개를 넣는다(샘플 비밀번호 `1234`).
글을 지우면 댓글도 함께 지워진다(`ON DELETE CASCADE`).
