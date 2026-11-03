# 스카이 웨딩 축하 방명록 (DemoWeb)

결혼식장 입구에서 "행복해라!! 축하한다!!" 같은 한마디를 남기는 방명록.
Next.js 16(App Router) · shadcn/ui · TypeScript, 데이터는 [Neon](https://neon.tech) PostgreSQL.

남긴 글은 스카이 웨딩 게임(`../shooting.py`) 결혼식장의 하객 말풍선으로 떠오른다(`/api/posts`).

## 실행

먼저 `.env.example`을 `.env.local`로 복사하고 `DATABASE_URL`에 Neon 연결 문자열을 넣는다.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm start   # 프로덕션
```

Vercel에 올릴 때는 프로젝트 설정에서 Root Directory를 `DemoWeb`으로, 환경 변수 `DATABASE_URL`을 넣는다.

## 기능

- 한 쪽짜리 방명록: 닉네임(12자) · 축하의 말씀(100자, 글자 수 표시) · 비밀번호(지울 때 사용)
- 최신 글부터 24개씩, 글이 많으면 쪽 넘김
- 글쓴이가 비밀번호로 자기 글 지우기

## 디자인

몽글몽글한 동화책 리소 인쇄. 게임의 `RISO_INKS`와 같은 네 잉크(핑크 `#ff8ac4`, 옐로 `#ffde54`, 하늘 `#7eb4ea`, 초록 `#56b476`)와
겹쳐 찍힌 색(코랄·보라·청록), 크림색 종이(`#f9f1e6`), 검정 대신 부드러운 남색 글씨(`#2e5470`)만 쓴다.

- 글꼴: 제목 주아(Jua, GANMO 제목처럼 둥글고 통통), 본문 고운돋움 — `next/font/google`
- `globals.css`: shadcn 색 토큰을 잉크 색으로, 둥근 모서리, 종이 결 배경, `.misprint`(옐로 판이 비껴 찍힌 제목),
  `.riso-card`(잉크 테두리 + 비껴 찍힌 다른 잉크 그림자), `.halftone`(옅어지는 둥근 망점 띠), `.print-btn`(눌리는 동그란 버튼), `.ink-grain`(잉크 결 필터)
- `components/costume-kid.tsx`: 동물 옷 아이들 SVG(토끼·병아리·개구리·고양이·곰·사자·양). 게임 하객과 같은 옷. 헤더의 곰 옷 신랑·토끼 옷 신부도 여기 있다

## 구조

| 경로 | 내용 |
|---|---|
| `src/app/page.tsx` | 방명록 (작성 폼 + 글 목록) |
| `src/app/api/posts` | 글 목록 JSON `{posts: [{id, title, author}]}` — 게임이 읽으므로 모양을 바꾸지 말 것 (`title`=축하의 말씀, `author`=닉네임) |
| `src/components/guestbook-form.tsx` | 작성 폼 (글자 수 표시) |
| `src/lib/db.ts` | Neon 연결, `guestbook` 테이블 생성·예시 글, 비밀번호 scrypt 해시 |
| `src/lib/queries.ts` | 화면·API용 조회 (비밀번호 해시 제외) |
| `src/lib/actions.ts` | Server Actions (남기기·지우기) |

`guestbook` 테이블은 첫 요청 때 자동으로 만들어지고, 비어 있으면 예시 축하글 3개를 넣는다(비밀번호 `1234`).
예전 게시판 시절의 `posts`·`comments` 테이블은 쓰지 않지만 DB에 그대로 남아 있다.
