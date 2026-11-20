/**
 * '새 질문 웹 푸시 알림' — 브라우저 쪽 동작.
 *
 *  · 관리자(/admin)에서 알림 켜기/끄기 → 서비스 워커 등록 + push 구독 + Supabase 저장
 *  · 학생이 질문을 올리면 서버(api/notify-question.ts)에 알려 주기만 한다 (결과를 기다리지 않음)
 *
 *  추가 과금 없는 구조: 브라우저 푸시(무료) + Vercel 서버리스 함수 1개 + Supabase 표 1개.
 */
import { friendlyError, NOT_CONFIGURED_MESSAGE, type ApiResult } from './api'
import {
  detectPushPlatform,
  isStandaloneDisplay,
  PUSH_ADMIN_HEADER,
  PUSH_API_PATH,
  PUSH_UNSUPPORTED_MESSAGE,
  pushApiErrorMessage,
  pushAvailability,
  pushResultSummary,
  toSubscriptionRow,
  urlBase64ToUint8Array,
  VAPID_PUBLIC_KEY,
  type PushPlatform,
  type PushState,
} from './pushBoard'
import { ADMIN_PASSWORD, isSupabaseConfigured, supabase } from './supabase'

export const PUSH_TABLE = 'push_subscriptions'

const fail = (error: string): ApiResult<never> => ({ ok: false, error })

/** 표가 아직 없을 때(마이그레이션 전) 보여 줄 말 */
export const PUSH_NOT_READY =
  '알림 표가 아직 없어요. Supabase SQL Editor 에서 supabase/migrate-2026-11-21-push.sql 을 한 번 실행해 주세요.'

function describePushDbError(message: string): string {
  const lower = (message ?? '').toLowerCase()
  if (
    lower.includes('push_subscriptions') ||
    (lower.includes('relation') && lower.includes('does not exist')) ||
    lower.includes('could not find the table')
  ) {
    return PUSH_NOT_READY
  }
  return friendlyError(message)
}

/* ------------------------------------------------------------------ */
/* 이 기기의 알림 상태                                                */
/* ------------------------------------------------------------------ */

export interface PushDeviceStatus {
  platform: PushPlatform
  /** 앱처럼(홈 화면에 추가) 열렸는지 */
  standalone: boolean
  /** 지금 이 기기에서 켤 수 있는지 */
  available: 'unsupported' | 'needs-install' | 'ready'
  permission: NotificationPermission | 'unsupported'
  /** 화면에 보여 줄 상태 */
  state: PushState
  /** 이 기기에서 구독 중인 주소 (없으면 null) */
  endpoint: string | null
}

const hasWindow = () => typeof window !== 'undefined' && typeof navigator !== 'undefined'

/** 지금 이 기기의 알림 상태 읽기 */
export async function readPushStatus(): Promise<PushDeviceStatus> {
  if (!hasWindow()) {
    return {
      platform: 'other',
      standalone: false,
      available: 'unsupported',
      permission: 'unsupported',
      state: 'checking',
      endpoint: null,
    }
  }

  const platform = detectPushPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0)
  let standalone = false
  try {
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone
    standalone = isStandaloneDisplay(window.matchMedia('(display-mode: standalone)').matches, iosStandalone)
  } catch {
    standalone = false
  }

  const hasServiceWorker = 'serviceWorker' in navigator
  const hasPushManager = 'PushManager' in window
  const hasNotification = 'Notification' in window
  const available = pushAvailability({ platform, standalone, hasServiceWorker, hasPushManager, hasNotification })
  const permission: NotificationPermission | 'unsupported' = hasNotification ? Notification.permission : 'unsupported'

  let endpoint: string | null = null
  if (available === 'ready') {
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = registration ? await registration.pushManager.getSubscription() : null
      endpoint = subscription?.endpoint ?? null
    } catch (error) {
      console.warn('[sunogong] 알림 구독 확인 실패:', error)
    }
  }

  let state: PushState
  if (available === 'needs-install') state = 'needs-install'
  else if (available === 'unsupported') state = 'unsupported'
  else if (permission === 'denied') state = 'denied'
  else if (endpoint) state = 'on'
  else state = 'off'

  return { platform, standalone, available, permission, state, endpoint }
}

/* ------------------------------------------------------------------ */
/* 서비스 워커                                                        */
/* ------------------------------------------------------------------ */

/** 서비스 워커 등록 (이미 있으면 그대로) */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!hasWindow() || !('serviceWorker' in navigator)) return null
  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    return registration
  } catch (error) {
    console.warn('[sunogong] 서비스 워커 등록 실패:', error)
    return null
  }
}

/* ------------------------------------------------------------------ */
/* 켜기 / 끄기                                                        */
/* ------------------------------------------------------------------ */

/** 알림 켜기 — 권한 요청 → 서비스 워커 → push 구독 → Supabase 저장 */
export async function enablePush(): Promise<ApiResult<PushDeviceStatus>> {
  if (!hasWindow()) return fail(PUSH_UNSUPPORTED_MESSAGE)
  if (!isSupabaseConfigured) return fail(NOT_CONFIGURED_MESSAGE)

  const before = await readPushStatus()
  if (before.available === 'unsupported') return fail(PUSH_UNSUPPORTED_MESSAGE)

  let permission: NotificationPermission
  try {
    permission = await Notification.requestPermission()
  } catch (error) {
    console.warn('[sunogong] 알림 권한 요청 실패:', error)
    return fail('알림 권한을 요청하지 못했어요. 브라우저 설정에서 알림을 허용해 주세요.')
  }
  if (permission !== 'granted') {
    return fail(
      permission === 'denied'
        ? '브라우저에서 알림이 막혀 있어요. 주소창 옆 자물쇠(또는 설정)에서 알림을 "허용"으로 바꾼 뒤 다시 켜 주세요.'
        : '알림을 켜려면 "허용"을 눌러 주세요.',
    )
  }

  const registration = await registerServiceWorker()
  if (!registration) {
    return fail('알림 준비(서비스 워커)에 실패했어요. 새로 고친 뒤 다시 시도해 주세요.')
  }

  let subscription: PushSubscription | null = null
  try {
    subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      })
    }
  } catch (error) {
    console.warn('[sunogong] push 구독 실패:', error)
    return fail(
      before.platform === 'ios'
        ? "아이폰은 '홈 화면에 추가'한 선오공에서만 알림을 켤 수 있어요. 홈 화면의 선오공을 열어 다시 시도해 주세요."
        : '알림 구독을 만들지 못했어요. 새로 고친 뒤 다시 시도해 주세요.',
    )
  }

  const row = toSubscriptionRow(subscription.toJSON(), navigator.userAgent)
  if (!row) return fail('알림 구독 정보를 읽지 못했어요. 다시 시도해 주세요.')

  try {
    const { error } = await supabase
      .from(PUSH_TABLE)
      .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' })
    if (error) {
      console.warn('[sunogong] 알림 구독 저장 실패:', error.message)
      return fail(describePushDbError(error.message))
    }
  } catch (error) {
    return fail(describePushDbError(error instanceof Error ? error.message : String(error)))
  }

  return { ok: true, data: await readPushStatus() }
}

/** 알림 끄기 — 구독 해지 + 저장된 주소 지우기 */
export async function disablePush(): Promise<ApiResult<PushDeviceStatus>> {
  if (!hasWindow()) return fail(PUSH_UNSUPPORTED_MESSAGE)

  let endpoint: string | null = null
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = registration ? await registration.pushManager.getSubscription() : null
    if (subscription) {
      endpoint = subscription.endpoint
      await subscription.unsubscribe()
    }
  } catch (error) {
    console.warn('[sunogong] 알림 구독 해지 실패:', error)
  }

  if (endpoint && isSupabaseConfigured) {
    try {
      const { error } = await supabase.from(PUSH_TABLE).delete().eq('endpoint', endpoint)
      if (error) console.warn('[sunogong] 알림 구독 정리 실패:', error.message)
    } catch (error) {
      console.warn('[sunogong] 알림 구독 정리 실패:', error)
    }
  }

  return { ok: true, data: await readPushStatus() }
}

/* ------------------------------------------------------------------ */
/* 알림 받는 기기 수                                                   */
/* ------------------------------------------------------------------ */

/** 지금 알림을 받는 기기 수 (Supabase 행 수) */
export async function countPushDevices(): Promise<ApiResult<number>> {
  if (!isSupabaseConfigured) return fail(NOT_CONFIGURED_MESSAGE)
  try {
    const { count, error } = await supabase
      .from(PUSH_TABLE)
      .select('id', { count: 'exact', head: true })
    if (error) return fail(describePushDbError(error.message))
    return { ok: true, data: count ?? 0 }
  } catch (error) {
    return fail(describePushDbError(error instanceof Error ? error.message : String(error)))
  }
}

/* ------------------------------------------------------------------ */
/* 서버에 알림 보내기                                                  */
/* ------------------------------------------------------------------ */

interface PushApiResponse {
  ok?: boolean
  error?: string
  sent?: number
  removed?: number
  failed?: number
  devices?: number
}

async function callPushApi(body: unknown, admin: boolean): Promise<{ ok: boolean; message: string; data: PushApiResponse }> {
  try {
    const response = await fetch(PUSH_API_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(admin ? { [PUSH_ADMIN_HEADER]: ADMIN_PASSWORD } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const data = (await response.json().catch(() => ({}))) as PushApiResponse
    if (!response.ok) {
      return { ok: false, message: pushApiErrorMessage(response.status, data), data }
    }
    return { ok: true, message: '', data }
  } catch (error) {
    console.warn('[sunogong] 알림 서버 요청 실패:', error)
    return {
      ok: false,
      message: '알림 서버에 닿지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.',
      data: {},
    }
  }
}

/** 테스트 알림 보내기 (관리자만) */
export async function sendTestPush(): Promise<ApiResult<string>> {
  const res = await callPushApi({ test: true }, true)
  if (!res.ok) return fail(res.message)
  return { ok: true, data: pushResultSummary(res.data) }
}

/**
 * 학생이 질문을 올렸다고 알린다.
 * 화면은 기다리지 않는다 — 실패해도 질문 등록은 그대로 성공.
 */
export function notifyNewQuestion(questionId: string): void {
  if (!questionId) return
  void fetch(PUSH_API_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId }),
    keepalive: true,
    cache: 'no-store',
  }).catch((error) => {
    console.warn('[sunogong] 새 질문 알림 요청 실패:', error)
  })
}
