const TZ = "Asia/Seoul"

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

// 목록용: 오늘 쓴 글은 시각, 그 전 글은 날짜만
export function formatListDate(iso: string) {
  const d = new Date(iso)
  return dateFmt.format(d) === dateFmt.format(new Date()) ? timeFmt.format(d) : dateFmt.format(d)
}

// 상세용: 날짜와 시각 모두
export function formatFullDate(iso: string) {
  const d = new Date(iso)
  return `${dateFmt.format(d)} ${timeFmt.format(d)}`
}
