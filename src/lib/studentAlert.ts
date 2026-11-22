/**
 * 학생 화면에서 쉬는 시간(30분)을 알리는 수단.
 * - 진동 (안드로이드 크롬)
 * - 짧은 안내음 (WebAudio — 소리 파일 없이 두 번 울린다)
 * - 브라우저 알림 (Notification, 이미 허용했거나 지금 허용하면)
 * 화면이 꺼져 있거나 앱이 완전히 백그라운드면 브라우저가 막을 수 있어서,
 * 알림창(모달)이 가장 확실한 안내이고 나머지는 보조 수단이다.
 */

type NotificationLike = {
  new (title: string, options?: { body?: string; tag?: string; icon?: string; badge?: string; renotify?: boolean }): unknown
  permission: NotificationPermission
  requestPermission: () => Promise<NotificationPermission>
}

function notificationApi(): NotificationLike | null {
  if (typeof window === 'undefined') return null
  const api = (window as unknown as { Notification?: NotificationLike }).Notification
  return api ?? null
}

/** 이 기기에서 브라우저 알림을 쓸 수 있는지 */
export function canNotify(): boolean {
  const api = notificationApi()
  return !!api && typeof api.requestPermission === 'function'
}

/** 이미 허용된 경우에만 알림을 띄운다 (권한 팝업은 알림이 필요한 순간에만 한 번 시도) */
export async function notifyPauseCheck(title: string, body: string): Promise<'sent' | 'denied' | 'unsupported'> {
  const api = notificationApi()
  if (!api) return 'unsupported'
  try {
    let permission = api.permission
    if (permission === 'default') permission = await api.requestPermission()
    if (permission !== 'granted') return 'denied'
    new api(title, {
      body,
      tag: 'sunogong-pause-check',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      renotify: true,
    })
    return 'sent'
  } catch {
    return 'denied'
  }
}

let audioContext: AudioContext | null = null

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    audioContext = audioContext ?? new Ctor()
    return audioContext
  } catch {
    return null
  }
}

/** '삐- 삐-' 두 번. 소리를 낼 수 없는 기기면 조용히 넘어간다 */
export function playAlertBeep(): void {
  const ctx = context()
  if (!ctx) return
  try {
    void ctx.resume?.()
    const start = ctx.currentTime + 0.02
    for (const offset of [0, 0.42]) {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, start + offset)
      gain.gain.exponentialRampToValueAtTime(0.22, start + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.3)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start(start + offset)
      oscillator.stop(start + offset + 0.32)
    }
  } catch {
    /* 소리를 낼 수 없어도 알림창은 그대로 */
  }
}

/** 소리 준비 — 학생이 버튼을 누를 때 한 번 불러 두면 나중에 알림음을 낼 수 있다 */
export function primeAlertSound(): void {
  const ctx = context()
  if (ctx && ctx.state === 'suspended') void ctx.resume?.()
}

/** 진동 (지원하지 않는 기기는 무시) */
export function vibratePauseCheck(): void {
  try {
    const nav = navigator as unknown as { vibrate?: (pattern: number | number[]) => boolean }
    nav.vibrate?.([220, 120, 220])
  } catch {
    /* 무시 */
  }
}

/** 쉬는 시간 알림을 한 번에: 진동 + 소리 + 브라우저 알림 */
export async function alertPauseCheck(title: string, body: string): Promise<void> {
  vibratePauseCheck()
  playAlertBeep()
  await notifyPauseCheck(title, body)
}
