/**
 * 새 버전이 배포되면 열려 있던 탭·홈화면 앱이 스스로 새로고침하게 한다 (2026-11-27).
 *
 * 왜 필요한가: 선오공은 서비스워커로 fetch 를 가로채지 않지만(푸시 알림 전용),
 * 한 번 열어 둔 탭은 예전 자바스크립트를 그대로 들고 있다. 그 상태로 남아 있으면
 * 이미 고친 규칙(예: 학원 세션 0분 종료 금지)이 그 탭에서는 옛 코드로 돌아간다.
 * 그래서 화면이 다시 보일 때 서버의 index.html 이 가리키는 번들 이름을 확인하고,
 * 지금 돌고 있는 번들과 다르면 새로 불러온다. (10분에 한 번만 확인)
 */

const CHECK_INTERVAL_MS = 10 * 60 * 1000
const CHECK_KEY = 'sunogong:update-checked-at'

/** 지금 화면에 올라와 있는 번들 경로 (/assets/index-XXXX.js) */
function currentBundle(): string {
  if (typeof document === 'undefined') return ''
  const scripts = Array.from(document.querySelectorAll('script[type="module"][src]')) as HTMLScriptElement[]
  const mine = scripts.find((script) => script.src.includes('/assets/'))
  return mine?.src ?? ''
}

/** 서버가 내려준 index.html 이 가리키는 번들 경로 */
export function bundleFromHtml(html: string): string {
  const found = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)
  return found ? found[0] : ''
}

function recentCheck(): boolean {
  try {
    const at = Number(window.sessionStorage.getItem(CHECK_KEY) ?? '0')
    return Number.isFinite(at) && Date.now() - at < CHECK_INTERVAL_MS
  } catch {
    return false
  }
}

function markChecked(): void {
  try {
    window.sessionStorage.setItem(CHECK_KEY, String(Date.now()))
  } catch {
    /* 저장소를 못 쓰면 확인만 건너뛴다 */
  }
}

export function watchForNewBuild(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const mine = currentBundle()
  if (!mine) return

  let reloaded = false
  let checking = false

  const check = async () => {
    if (reloaded || checking) return
    if (document.visibilityState !== 'visible') return
    if (recentCheck()) return
    checking = true
    try {
      const res = await fetch('/?fresh=1', { cache: 'no-store' })
      if (!res.ok) return
      const theirs = bundleFromHtml(await res.text())
      markChecked()
      if (theirs && !mine.endsWith(theirs)) {
        reloaded = true
        window.location.reload()
      }
    } catch {
      /* 오프라인이면 다음에 다시 확인한다 */
    } finally {
      checking = false
    }
  }

  document.addEventListener('visibilitychange', () => void check())
  window.addEventListener('focus', () => void check())
  void check()
}
