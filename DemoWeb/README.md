# DemoWeb 게시판

Next.js 16(App Router) · shadcn/ui · TypeScript로 만든 익명 게시판.

## 실행

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
| `src/lib/db.ts` | `data/db.json` 파일 저장소, 비밀번호 scrypt 해시 |
| `src/lib/queries.ts` | 화면용 조회(비밀번호 해시 제외) |
| `src/lib/actions.ts` | Server Actions (작성·수정·삭제·댓글·조회수) |
| `src/components/ui` | shadcn/ui 컴포넌트 (`npx shadcn@latest add …`) |

데이터는 처음 실행할 때 `data/db.json`에 샘플 글 4개와 함께 만들어진다(샘플 비밀번호 `1234`). 이 폴더는 git에서 제외된다.
DB를 쓰고 싶으면 `src/lib/db.ts`의 `read`/`mutate`만 바꾸면 된다.
