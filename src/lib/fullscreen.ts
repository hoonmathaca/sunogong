/**
 * 전체화면(브라우저 주소창·하단 내비게이션 바 숨기기)과 화면 잔상(번인) 방지 도우미.
 *
 * - 안드로이드 크롬 등 Fullscreen API 를 지원하는 기기: documentElement.requestFullscreen()
 * - 아이폰 사파리: 일반 웹페이지에서는 Fullscreen API 가 없으므로 조용히 실패하고 안내 문구만 보여 준다.
 *   (홈 화면에 추가한 앱은 주소창 없이 열린다 — public/manifest.webmanifest display: "standalone")
 * 모든 함수는 SSR(문서 없음)에서도 오류 없이 값을 돌려준다.
 */

export type Platform = 'ios' | 'android' | 'other'

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
  webkitFullscreenEnabled?: boolean
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

/** 화면 잔상을 막기 위해 1분마다 옮길 거리 (2~6px) */
export const PIXEL_SHIFT_INTERVAL_MS = 60_000

/** 타이머 화면이 오래 켜져 있어도 같은 픽셀이 계속 켜지지 않도록 조금씩 움직이는 위치들 */
const PIXEL_SHIFT_STEPS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 3, y: 2 },
  { x: -4, y: 4 },
  { x: 5, y: -2 },
  { x: -3, y: -5 },
  { x: 4, y: 5 },
  { x: -5, y: -3 },
  { x: 2, y: -4 },
  { x: -6, y: 3 },
]

/** 기기 종류 — 아이폰(아이패드 포함)은 전체화면 지원 여부가 달라 따로 본다 */
export function detectPlatform(userAgent: string | null | undefined, maxTouchPoints = 0): Platform {
  if (!userAgent) return 'other'
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios'
  // 아이패드의 사파리는 데스크톱 사파리처럼 보인다(Macintosh + 멀티터치)
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios'
  if (/android/i.test(userAgent)) return 'android'
  return 'other'
}

/** 홈 화면에 추가한 앱(standalone)으로 열렸는지 — 이때는 주소창이 이미 없다 */
export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true
    const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
    return iosStandalone === true
  } catch {
    return false
  }
}

/** 이 브라우저에서 전체화면을 켤 수 있는지 */
export function supportsFullscreen(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): boolean {
  if (!doc) return false
  const element = doc.documentElement as FullscreenElement | null
  return typeof element?.requestFullscreen === 'function' || typeof element?.webkitRequestFullscreen === 'function'
}

/** 지금 전체화면인지 */
export function isFullscreenActive(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): boolean {
  if (!doc) return false
  const fullscreenDocument = doc as FullscreenDocument
  return Boolean(fullscreenDocument.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement)
}

export type FullscreenOutcome = 'active' | 'unsupported' | 'failed'

/**
 * 전체화면 진입. 반드시 사용자가 누른 클릭 처리 안에서(제스처) 부른다.
 * 실패해도 예외를 밖으로 던지지 않는다.
 */
export async function enterFullscreen(): Promise<FullscreenOutcome> {
  if (typeof document === 'undefined') return 'unsupported'
  const element = document.documentElement as FullscreenElement
  const modern: ((options?: FullscreenOptions) => Promise<void>) | undefined = element.requestFullscreen
  const legacy: (() => Promise<void> | void) | undefined = element.webkitRequestFullscreen
  if (typeof modern !== 'function' && typeof legacy !== 'function') return 'unsupported'
  if (isFullscreenActive(document)) return 'active'
  if (typeof modern === 'function') {
    try {
      await modern.call(element, { navigationUI: 'hide' })
      return 'active'
    } catch {
      try {
        // 옵션을 받지 않는 브라우저·정책상 한 번 거절하는 경우 한 번 더
        await modern.call(element)
        return 'active'
      } catch {
        return 'failed'
      }
    }
  }
  try {
    await legacy?.call(element)
    return isFullscreenActive(document) ? 'active' : 'failed'
  } catch {
    return 'failed'
  }
}

/** 전체화면 해제. 전체화면이 아니면 아무 것도 하지 않고, 실패해도 조용히 넘어간다. */
export async function exitFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return
  const fullscreenDocument = document as FullscreenDocument
  if (!fullscreenDocument.fullscreenElement && !fullscreenDocument.webkitFullscreenElement) return
  try {
    if (typeof fullscreenDocument.exitFullscreen === 'function') {
      await fullscreenDocument.exitFullscreen()
    } else {
      await fullscreenDocument.webkitExitFullscreen?.()
    }
  } catch {
    /* 브라우저가 거절해도 화면은 그대로 쓴다 */
  }
}

/**
 * 전체화면을 켤 수 없을 때 보여 줄 안내 — 켤 수 있으면 null.
 * 상황(아이폰 / 이미 홈 화면 앱 / 그냥 미지원 / 한 번 실패)에 맞는 문구만 돌려준다.
 */
export function fullscreenHint(options: {
  platform: Platform
  supported: boolean
  standalone: boolean
  failed?: boolean
}): string | null {
  const { platform, supported, standalone, failed = false } = options
  if (standalone && !supported) return '이미 홈 화면 앱으로 열려 있어서 주소창 없이 쓸 수 있어요'
  if (platform === 'ios' && !supported) {
    return '아이폰은 ‘홈 화면에 추가’로 열면 주소창 없이 전체화면으로 쓸 수 있어요'
  }
  if (!supported) {
    return '이 브라우저에서는 전체화면을 쓸 수 없어요. 크롬으로 열면 주소창을 숨길 수 있어요'
  }
  if (failed) return '전체화면을 켜지 못했어요. 한 번 더 눌러주세요'
  return null
}

/** 1분마다 옮길 위치 — step 을 계속 늘려도 8가지 위치를 돌기만 한다(화면이 밀려 나가지 않음) */
export function pixelShift(step: number): { x: number; y: number } {
  const safeStep = Number.isFinite(step) ? Math.abs(Math.trunc(step)) : 0
  return PIXEL_SHIFT_STEPS[safeStep % PIXEL_SHIFT_STEPS.length]
}
