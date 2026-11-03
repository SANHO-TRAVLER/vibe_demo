// 웹 게임(public/game, pygbag)이 여는 무거운 파일(파이썬 실행 파일 약 9MB·pygame·게임 묶음)을
// 미리 받아 브라우저 캐시에 넣어 둔다. 그러면 게임 버튼을 눌렀을 때 몇 초 빨리 뜬다.
// 받을 목록은 scripts/build-game.py 가 public/game/prefetch.json 에 쓴다.
// 데이터 절약 모드이거나 느린(2g) 연결이면 받지 않는다.
let started = false

export function prefetchGame() {
  if (started || typeof window === "undefined") return
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (conn?.saveData || conn?.effectiveType?.includes("2g")) return
  started = true
  fetch("/game/prefetch.json")
    .then((res) => (res.ok ? res.json() : []))
    .then((urls: string[]) => {
      for (const url of urls) {
        // 끝까지 읽어야 캐시에 온전히 들어간다
        fetch(url, { credentials: "omit" })
          .then((res) => res.arrayBuffer())
          .catch(() => {})
      }
    })
    .catch(() => {})
}
