/** 기기 종류 — 설치 안내·타이머 안내 문구를 고를 때 쓴다 */
export type Platform = 'ios' | 'android' | 'other'

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  // 아이패드OS 13+ 는 데스크톱 사파리처럼 보인다
  if (/macintosh/i.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document) return 'ios'
  return 'other'
}

/** 홈 화면에서 앱처럼 열렸는지 */
export function isStandalone(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
    return iosStandalone === true
  } catch {
    return false
  }
}
