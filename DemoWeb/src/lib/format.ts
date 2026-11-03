const parts = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

// 방명록 도장: "11.03 14:20"
export function formatStamp(iso: string) {
  const p = Object.fromEntries(parts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.month}.${p.day} ${p.hour}:${p.minute}`
}
