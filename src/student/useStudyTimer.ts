import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../lib/api'
import { computeElapsedSeconds } from '../lib/session'
import { HEARTBEAT_INTERVAL_MS, MAX_SESSION_SECONDS, kstDayEndMs, parseMs } from '../lib/time'
import type { FinishResult, StudySession } from '../lib/types'

export type FinishReason = 'manual' | 'limit' | 'midnight'

interface WakeLockSentinelLike {
  release: () => Promise<void>
  released: boolean
  addEventListener: (type: string, listener: () => void) => void
}

interface NavigatorWithWakeLock {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
}

export interface UseStudyTimerOptions {
  studentId: string
  initialSession?: StudySession | null
  onFinished?: (result: FinishResult, reason: FinishReason) => void
}

export interface StudyTimer {
  session: StudySession | null
  status: 'loading' | 'idle' | 'running' | 'paused' | 'finished'
  elapsedSeconds: number
  loading: boolean
  busy: boolean
  error: string | null
  notice: string | null
  limitReached: boolean
  wakeLockOk: boolean
  start: () => Promise<void>
  pause: (auto?: boolean, message?: string) => Promise<void>
  resume: () => Promise<void>
  finish: (problems: number, reason?: FinishReason) => Promise<FinishResult | null>
  reload: () => Promise<void>
  clearError: () => void
}

/**
 * 공부 타이머.
 * - 시작·일시정지·계속·종료 시각은 모두 Supabase 서버 시각(now())으로 저장하고,
 *   화면 숫자는 서버 시각과 기기 시각의 차이(offset)를 보정해 계산한다.
 * - 10초마다 하트비트를 보내고, 다른 앱으로 이동하면 자동 일시정지한다(자동 재개 없음).
 * - 5시간(300분)을 넘으면 자동 종료 안내, 자정(23:59)을 넘으면 0문제로 종료한다.
 */
export function useStudyTimer({ studentId, initialSession = null, onFinished }: UseStudyTimerOptions): StudyTimer {
  const [session, setSession] = useState<StudySession | null>(initialSession)
  const [loading, setLoading] = useState(!initialSession)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [limitReached, setLimitReached] = useState(false)
  const [wakeLockOk, setWakeLockOk] = useState(true)

  const sessionRef = useRef<StudySession | null>(initialSession)
  const offsetRef = useRef(0)
  const busyRef = useRef(false)
  const finishingRef = useRef(false)
  const lastPauseAtRef = useRef(0)
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  const applySession = useCallback((next: StudySession | null) => {
    sessionRef.current = next
    setSession(next)
  }, [])

  const syncServerTime = useCallback((iso: string | null | undefined) => {
    const ms = parseMs(iso ?? null)
    if (Number.isFinite(ms)) offsetRef.current = ms - Date.now()
  }, [])

  const computeElapsed = useCallback((target: StudySession | null = sessionRef.current): number => {
    if (!target) return 0
    return computeElapsedSeconds(target, Date.now() + offsetRef.current)
  }, [])

  /* 1초마다 화면 숫자 갱신 */
  useEffect(() => {
    const tick = () => setElapsed(computeElapsed())
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [computeElapsed, session?.id])

  /* 처음 열 때 서버 시각과 기기 시각의 차이를 한 번 맞춰둔다 */
  useEffect(() => {
    void (async () => {
      const res = await api.serverNow()
      if (res.ok) {
        syncServerTime(res.data)
        setElapsed(computeElapsed())
      }
    })()
  }, [syncServerTime, computeElapsed])

  /* 처음 들어올 때 진행 중인 세션 확인 */
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await api.getActiveSession(studentId)
    if (res.ok) {
      const active = res.data && res.data.status !== 'finished' ? res.data : null
      applySession(active)
      setElapsed(computeElapsed(active))
      if (active?.status === 'paused') setNotice('일시정지 중이에요')
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [studentId, applySession, computeElapsed])

  useEffect(() => {
    if (initialSession) {
      applySession(initialSession)
      setElapsed(computeElapsed(initialSession))
      setLoading(false)
      return
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  /* 시작 */
  const start = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    setLimitReached(false)
    const res = await api.startSession(studentId)
    if (res.ok) {
      applySession(res.data)
      syncServerTime(res.data.last_heartbeat_at)
      setElapsed(computeElapsed(res.data))
      setNotice(null)
    } else {
      setError(res.error)
    }
    busyRef.current = false
    setBusy(false)
  }, [studentId, applySession, computeElapsed, syncServerTime])

  /* 일시정지 */
  const pause = useCallback(
    async (auto = false, message?: string) => {
      const current = sessionRef.current
      if (!current || current.status !== 'running' || busyRef.current) return
      busyRef.current = true
      setBusy(true)
      const res = await api.pauseSession(current.id, auto)
      if (res.ok) {
        applySession(res.data)
        setElapsed(computeElapsed(res.data))
        setNotice(message ?? (auto ? '일시정지 중이에요' : '일시정지했어요'))
      } else {
        setError(res.error)
      }
      busyRef.current = false
      setBusy(false)
    },
    [applySession, computeElapsed],
  )

  /* 계속 */
  const resume = useCallback(async () => {
    const current = sessionRef.current
    if (!current || current.status !== 'paused' || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    const res = await api.resumeSession(current.id)
    if (res.ok) {
      applySession(res.data)
      syncServerTime(res.data.last_heartbeat_at)
      setElapsed(computeElapsed(res.data))
      setNotice(null)
    } else {
      setError(res.error)
    }
    busyRef.current = false
    setBusy(false)
  }, [applySession, computeElapsed, syncServerTime])

  /* 종료 (서버가 시간을 계산해 study_logs 에 누적) */
  const finish = useCallback(
    async (problems: number, reason: FinishReason = 'manual'): Promise<FinishResult | null> => {
      const current = sessionRef.current
      if (!current || finishingRef.current) return null
      finishingRef.current = true
      setBusy(true)
      setError(null)
      const res = await api.finishSession(current.id, problems)
      finishingRef.current = false
      setBusy(false)
      if (res.ok) {
        applySession(res.data.session)
        setElapsed(computeElapsed(res.data.session))
        try {
          onFinishedRef.current?.(res.data, reason)
        } catch (callbackError) {
          console.error('[sunogong] 종료 처리 중 오류:', callbackError)
        }
        return res.data
      }
      setError(res.error)
      return null
    },
    [applySession, computeElapsed],
  )

  /* 하트비트 (10초) */
  useEffect(() => {
    if (!session || session.status !== 'running') return undefined
    let cancelled = false

    const beat = async () => {
      const current = sessionRef.current
      if (!current || current.status !== 'running' || finishingRef.current) return
      const res = await api.sendHeartbeat(current.id)
      if (cancelled || !res.ok) return
      syncServerTime(res.data.server_now)
      if (res.data.session) applySession(res.data.session)
    }

    const id = window.setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [session?.id, session?.status, applySession, syncServerTime])

  /* 화면 켜두기 (Screen Wake Lock) */
  const requestWakeLock = useCallback(async () => {
    const nav = navigator as unknown as NavigatorWithWakeLock
    if (!nav.wakeLock) {
      setWakeLockOk(false)
      return
    }
    try {
      if (wakeLockRef.current && !wakeLockRef.current.released) return
      const sentinel = await nav.wakeLock.request('screen')
      wakeLockRef.current = sentinel
      sentinel.addEventListener('release', () => {
        wakeLockRef.current = null
      })
      setWakeLockOk(true)
    } catch {
      setWakeLockOk(false)
    }
  }, [])

  const releaseWakeLock = useCallback(() => {
    const sentinel = wakeLockRef.current
    wakeLockRef.current = null
    if (sentinel) {
      void sentinel.release().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    if (session?.status === 'running') {
      void requestWakeLock()
    } else {
      releaseWakeLock()
    }
  }, [session?.status, requestWakeLock, releaseWakeLock])

  useEffect(() => () => releaseWakeLock(), [releaseWakeLock])

  /* 다른 앱·탭으로 이동하면 자동 일시정지 */
  const maybePause = useCallback(
    (message: string) => {
      const current = sessionRef.current
      if (!current || current.status !== 'running') return
      const nowMs = Date.now()
      if (nowMs - lastPauseAtRef.current < 800) return
      lastPauseAtRef.current = nowMs
      void pause(true, message)
    },
    [pause],
  )

  useEffect(() => {
    if (!session || session.status === 'finished') return undefined

    const onVisibility = () => {
      try {
        if (document.visibilityState === 'hidden') {
          maybePause('화면을 벗어나서 일시정지했어요')
        } else if (sessionRef.current?.status === 'running') {
          void requestWakeLock()
        }
      } catch (visibilityError) {
        console.warn('[sunogong] visibility 처리 실패:', visibilityError)
      }
    }
    const onBlur = () => maybePause('다른 화면으로 이동해서 일시정지했어요')
    const onPageHide = () => maybePause('화면을 벗어나서 일시정지했어요')

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [session?.id, session?.status, maybePause, requestWakeLock])

  /* 한국 시간 자정(23:59) 이 되면 0문제로 종료 */
  useEffect(() => {
    if (!session || session.status === 'finished') return undefined
    const targetMs = kstDayEndMs(session.date)
    const waitMs = targetMs - (Date.now() + offsetRef.current)
    if (!Number.isFinite(waitMs) || waitMs <= 0) return undefined
    const id = window.setTimeout(() => {
      void finish(0, 'midnight')
    }, Math.min(waitMs, 2_147_483_000))
    return () => window.clearTimeout(id)
  }, [session?.id, session?.date, session?.status, finish])

  /* 5시간 제한 */
  useEffect(() => {
    if (!session || session.status === 'finished') return
    if (elapsed >= MAX_SESSION_SECONDS) setLimitReached(true)
  }, [elapsed, session?.status])

  return {
    session,
    status: loading ? 'loading' : !session ? 'idle' : session.status,
    elapsedSeconds: elapsed,
    loading,
    busy,
    error,
    notice,
    limitReached,
    wakeLockOk,
    start,
    pause,
    resume,
    finish,
    reload: load,
    clearError: () => setError(null),
  }
}
