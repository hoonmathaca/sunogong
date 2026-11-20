/**
 * '새 질문 웹 푸시 알림'에서 쓰는 순수 함수들.
 * (브라우저·서버 없이 테스트할 수 있게 모아 둔다 — tools/lib-test.ts)
 */

/**
 * 웹 푸시 VAPID 공개 키.
 * 비밀 키는 Vercel 환경변수 `VAPID_PRIVATE_KEY` 에만 있고, 이 공개 키는 앱에 그대로 들어가도 됩니다.
 * (api/notify-question.ts 의 DEFAULT_VAPID_PUBLIC_KEY 와 같은 값이어야 합니다.)
 */
export const VAPID_PUBLIC_KEY =
  'BAHw0qEKNdHLWAV5wakdHeHQr3OsQY_bjpS4T1KC4HY2mbu2ELjJgMx4JZfGEsj9rYMT1zziJja-VFq_rqNJpZg'

/** 관리자 전용 요청(테스트 알림)에 붙이는 머리글 이름 */
export const PUSH_ADMIN_HEADER = 'x-sunogong-admin'

/** 푸시 알림 서버 주소 (Vercel Serverless Function) */
export const PUSH_API_PATH = '/api/notify-question'

/** 알림을 누르면 열 화면 — 관리자 질문함 */
export const PUSH_NOTIFICATION_URL = '/admin?tab=questions'

/** 알림 제목 (서버가 보내는 값과 같다) */
export const PUSH_TITLE = '선오공 새 질문'

/** 질문 알림 본문 — '{이름} 학생이 질문을 올렸어요!' */
export function questionPushBody(studentName: string | null | undefined): string {
  const name = (studentName ?? '').trim()
  return name ? `${name} 학생이 질문을 올렸어요!` : '학생이 질문을 올렸어요!'
}

/** 테스트 알림 본문 */
export const PUSH_TEST_BODY = '알림이 잘 도착해요! 새 질문이 올라오면 이렇게 알려 드릴게요.'

/** 알림을 받을 수 없는 환경에 보여 줄 말 */
export const PUSH_UNSUPPORTED_MESSAGE =
  '이 브라우저는 알림을 지원하지 않아요. 안드로이드는 크롬, 아이폰은 홈 화면에 추가한 선오공에서 알림을 켤 수 있어요.'

/** 아이폰(홈 화면에 추가 전) 안내 */
export const PUSH_IOS_INSTALL_MESSAGE =
  "아이폰은 '홈 화면에 추가'한 선오공에서만 알림을 받을 수 있어요. 공유 버튼 → 홈 화면에 추가 → 홈 화면의 선오공을 열고 다시 켜 주세요."

/** 알림 권한을 막았을 때 안내 */
export const PUSH_DENIED_MESSAGE =
  '브라우저에서 알림이 막혀 있어요. 주소창 옆 자물쇠(또는 설정)에서 알림을 "허용"으로 바꾼 뒤 다시 켜 주세요.'

export type PushPlatform = 'ios' | 'android' | 'desktop' | 'other'

/** 알림 안내 문구를 고르기 위한 기기 판별 */
export function detectPushPlatform(userAgent: string, maxTouchPoints = 0): PushPlatform {
  const ua = userAgent ?? ''
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  // 아이패드가 맥처럼 보낼 때
  if (/macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios'
  if (/android/i.test(ua)) return 'android'
  if (/windows|macintosh|linux|cros/i.test(ua)) return 'desktop'
  return 'other'
}

/** 앱처럼(홈 화면에 추가해서) 열렸는지 */
export function isStandaloneDisplay(displayModeMatches: boolean, iosStandalone: boolean | undefined): boolean {
  return displayModeMatches || iosStandalone === true
}

/**
 * 지금 이 기기에서 알림을 켤 수 있는지.
 * · unsupported : 알림 기능이 없는 브라우저
 * · needs-install : 아이폰인데 홈 화면에 추가하지 않음 (iOS 는 홈 화면 웹앱만 푸시 허용)
 * · ready : 켤 수 있음
 */
export type PushAvailability = 'unsupported' | 'needs-install' | 'ready'

export function pushAvailability(input: {
  platform: PushPlatform
  standalone: boolean
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
}): PushAvailability {
  const { platform, standalone, hasServiceWorker, hasPushManager, hasNotification } = input
  if (!hasServiceWorker || !hasNotification) return 'unsupported'
  // 아이폰은 홈 화면에 추가한 웹앱에서만 PushManager 가 동작한다
  if (platform === 'ios' && !standalone) return 'needs-install'
  if (platform === 'ios' && !hasPushManager) return 'needs-install'
  if (!hasPushManager) return 'unsupported'
  return 'ready'
}

/** 화면에 보여 줄 알림 상태 */
export type PushState = 'checking' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

export function pushStateLabel(state: PushState): string {
  switch (state) {
    case 'on':
      return '알림 켜짐'
    case 'off':
      return '알림 꺼짐'
    case 'denied':
      return '알림이 막혀 있음'
    case 'needs-install':
      return '홈 화면에 추가하면 켤 수 있어요'
    case 'unsupported':
      return '이 브라우저는 알림을 지원하지 않아요'
    default:
      return '알림 상태 확인 중…'
  }
}

/** 상태별 짧은 안내 */
export function pushStateHint(state: PushState, platform: PushPlatform): string {
  switch (state) {
    case 'on':
      return platform === 'ios'
        ? '홈 화면의 선오공을 열어 둔 동안에도, 앱을 닫아 둔 동안에도 알림이 와요.'
        : '앱을 닫아 둔 동안에도 알림이 와요. 알림을 누르면 질문함이 열려요.'
    case 'off':
      return '켜 두면 학생이 질문을 올릴 때마다 바로 알려 드려요(추가 요금 없음).'
    case 'denied':
      return PUSH_DENIED_MESSAGE
    case 'needs-install':
      return PUSH_IOS_INSTALL_MESSAGE
    case 'unsupported':
      return PUSH_UNSUPPORTED_MESSAGE
    default:
      return '알림을 준비하고 있어요.'
  }
}

/** base64url(VAPID 공개 키) → Uint8Array (pushManager.subscribe 의 applicationServerKey) */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(normalized)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** 저장할 구독 정보 (Supabase push_subscriptions 한 줄) */
export interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
  user_agent?: string | null
}

/**
 * 브라우저 구독(PushSubscription.toJSON())을 DB에 넣을 모양으로 바꾼다.
 * endpoint 나 keys 가 없으면 저장하지 않고 null 을 돌려준다.
 */
export function toSubscriptionRow(
  json: { endpoint?: string | null; keys?: { p256dh?: string | null; auth?: string | null } | null } | null,
  userAgent?: string | null,
): PushSubscriptionRow | null {
  const endpoint = (json?.endpoint ?? '').trim()
  const p256dh = (json?.keys?.p256dh ?? '').trim()
  const auth = (json?.keys?.auth ?? '').trim()
  if (!endpoint || !p256dh || !auth) return null
  return { endpoint, p256dh, auth, user_agent: (userAgent ?? '').slice(0, 300) || null }
}

/** 만료된 구독으로 볼 응답 코드 (보낼 때마다 정리) */
export function isExpiredSubscription(statusCode: number | null | undefined): boolean {
  return statusCode === 404 || statusCode === 410
}

/** 알림 서버가 돌려준 실패를 사람이 읽을 말로 */
export function pushApiErrorMessage(status: number, body: unknown): string {
  const code =
    body && typeof body === 'object' && 'error' in body ? String((body as { error?: unknown }).error ?? '') : ''
  if (status === 503 || code === 'push_not_configured') {
    return '알림 서버 키(VAPID_PRIVATE_KEY)가 아직 없어요. Vercel 환경변수에 넣고 다시 배포하면 바로 동작해요.'
  }
  if (status === 401 || code === 'unauthorized') {
    return '관리자 확인에 실패했어요. 새로 고친 뒤 다시 시도해 주세요.'
  }
  if (status === 404 || code === 'question_not_found') return '질문을 찾지 못했어요.'
  if (status === 400 && code === 'invalid_question') return '알림을 보낼 질문을 찾지 못했어요.'
  if (status === 405) return '알림 서버 주소가 맞지 않아요.'
  return '알림을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.'
}

/** 테스트 알림 응답 요약 */
export function pushResultSummary(result: { sent?: number; removed?: number; failed?: number; devices?: number }): string {
  const sent = result.sent ?? 0
  const devices = result.devices ?? sent
  if (devices === 0) return '알림 받을 기기가 없어요. 먼저 이 기기에서 알림을 켜 주세요.'
  if (sent === 0) return '알림을 보내지 못했어요. 알림을 껐다가 다시 켜 주세요.'
  const removed = result.removed ?? 0
  return removed > 0
    ? `테스트 알림을 ${sent}대에 보냈어요. (만료된 기기 ${removed}대는 정리했어요)`
    : `테스트 알림을 ${sent}대에 보냈어요.`
}
