/**
 * 기기 확인 — 학생 화면은 스마트폰·태블릿에서만 열고, 컴퓨터(데스크톱·노트북)에서는 안내 화면을 보여 준다.
 *
 * 판별은 User-Agent 를 기본으로 하고, 아이패드가 맥처럼 보내는 User-Agent 만 멀티터치로 보완한다.
 *   - 허용: 휴대폰·태블릿 User-Agent(아이폰·아이패드·안드로이드 등)
 *   - 허용: `Macintosh` + `navigator.maxTouchPoints > 1` (아이패드 사파리·크롬, '데스크톱 사이트'로 열어도 같음)
 *   - 차단: 그 밖의 데스크톱 User-Agent(Windows·Mac·Linux·크롬북)
 *     → 터치스크린 윈도우 노트북은 멀티터치가 있어도 컴퓨터이므로 차단한다.
 * 모든 함수는 SSR(문서 없음)에서도 오류 없이 값을 돌려준다.
 */

export interface DeviceFingerprint {
  userAgent?: string | null
  /** navigator.maxTouchPoints — 터치 화면이면 1보다 크다(아이패드 판별에 쓴다) */
  maxTouchPoints?: number
  /** navigator.platform — User-Agent 를 줄여 보내는 브라우저 보완용 */
  platform?: string | null
}

/** 휴대폰·태블릿이 User-Agent 에 넣는 표시 */
const MOBILE_UA =
  /iphone|ipod|ipad|android|silk|kindle|playbook|blackberry|bb10|windows phone|iemobile|opera mini|opera mobi|webos|tablet|mobile/i

/** 휴대폰·태블릿이 platform 에 넣는 표시 */
const MOBILE_PLATFORM = /ipad|iphone|ipod|android/i

function touchCount(device: DeviceFingerprint): number {
  const value = Number(device.maxTouchPoints)
  return Number.isFinite(value) && value > 0 ? value : 0
}

/** 스마트폰·태블릿인지 */
export function isMobileOrTablet(device: DeviceFingerprint): boolean {
  const userAgent = String(device.userAgent ?? '')
  const platform = String(device.platform ?? '')

  if (MOBILE_UA.test(userAgent)) return true

  /*
   * 아이패드(아이패드OS 13+)의 사파리·크롬은 맥 사파리와 똑같은 User-Agent 를 보낸다.
   * 맥에는 터치 화면이 없으므로, 맥으로 보이는데 멀티터치가 있으면 아이패드다.
   * (터치스크린 윈도우 노트북은 여기 걸리지 않는다 — Macintosh 로 보이지 않으므로 그대로 컴퓨터로 본다.)
   */
  if (/macintosh/i.test(userAgent) && touchCount(device) > 1) return true

  /* User-Agent Client Hints 등으로 User-Agent 가 줄어든 경우 */
  if (MOBILE_PLATFORM.test(platform)) return true

  return false
}

/** 학생 화면을 막아야 하는지 — 컴퓨터 브라우저면 true */
export function isStudentScreenBlocked(device: DeviceFingerprint): boolean {
  return !isMobileOrTablet(device)
}

/** 지금 브라우저의 기기 정보 (SSR 에서는 빈 값 → 컴퓨터로 본다) */
export function readDeviceFingerprint(): DeviceFingerprint {
  if (typeof window === 'undefined' || !window.navigator) return {}
  const nav = window.navigator as Navigator & { platform?: string }
  return {
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints,
    platform: nav.platform,
  }
}
