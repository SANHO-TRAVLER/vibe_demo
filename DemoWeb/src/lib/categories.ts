// 클라이언트 컴포넌트에서도 쓰므로 서버 전용 모듈(db.ts)과 따로 둔다.
export const CATEGORIES = ["자유", "질문", "정보", "공지"] as const
export type Category = (typeof CATEGORIES)[number]
