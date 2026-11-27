import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../lib/api'
import * as homeworkApi from '../lib/homework'
import { normalizeKind, pausesOnLeave, type SessionKind } from '../lib/kinds'
import { computeElapsedSeconds, isHeartbeatStale, pausedSecondsOf } from '../lib/session'
import { PAUSE_AUTO_END_SECONDS } from '../lib/pauseWatch'
import { HEARTBEAT_INTERVAL_MS, MAX_SESSION_SECONDS, REMOTE_END_CHECK_MS, kstMidnightMs, parseMs, todayKst } from '../lib/time'
import type { AutoEndResult, FinishResult, StudySession } from '../lib/types'

export type FinishReason = 'manual' | 'limit' | 'admin'
/** 기록 없이 버린 이유 — 자정이 지나서 / 이미 지난 날의 세션이라서 */
export type DiscardReason = 'midnight' | 'stale'

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
  /** 자정을 넘겨 기록 없이 버려졌을 때 */
  onDiscarded?: (reason: DiscardReason) => void
  /** 쉬는 시간이 60분을 넘어 자동 종료됐을 때 (문제 수는 다음에 입력) */
  onAutoEnded?: (result: AutoEndResult) => void
}

export interface StudyTimer {
  session: StudySession | null
  status: 'loading' | 'idle' | 'running' | 'paused' | 'finished'
  kind: SessionKind
  elapsedSeconds: number
  /** 쉬는 중(일시정지)인 시간(초) — 30분에 알림, 60분에 자동 종료 */
  pausedSeconds: number
  loading: boolean
  busy: boolean
  error: string | null
  notice: string | null
  limitReached: boolean
  wakeLockOk: boolean
  start: (kind?: SessionKind) => Promise<void>
  pause: (auto?: boolean, message?: string) => Promise<void>
  resume: () => Promise<void>
  finish: (problems: number, reason?: FinishReason, photoPaths?: string[]) => Promise<FinishResult | null>
  discard: (reason?: DiscardReason) => Promise<void>
  reload: () => Promise<void>
  clearError: () => void
  /**
   * 질문 창(사진 고르기·카메라)을 여는 동안에는 화면을 잠깐 벗어나도 일시정지하지 않는다.
   * (숙제 공부 중에 문제 사진을 찍으러 카메라로 넘어가도 타이머가 멈추지 않게)
   */
  holdOnLeave: (held: boolean) => void
}

/**
 * 공부 타이머.
 * - 시작·일시정지·계속·종료 시각은 Supabase 서버 시각(now())으로 저장하고,
 *   화면 숫자는 서버 시각과 기기 시각의 차이(offset)를 보정해 계산한다.
 * - 학원 공부(academy): 화면이 꺼지거나 앱을 잠깐 벗어난 것으로는 멈추지 않는다(공부는 계속).
 *   앱을 벗어났다가 다시 열었을 때, 그리고 직접 누른 일시정지에만 멈춘다.
 * - 숙제 공부(homework): 화면을 끄거나 다른 화면·앱으로 나가면 즉시 일시정지한다.
 *   (요청이 화면 꺼짐에 끊기지 않도록 keepalive 로 보내고, 화면에는 바로 반영한다)
 * - 5시간(300분)을 넘으면 자동 종료 안내, 자정(00:00)을 넘기면 기록 없이 버린다.
 * - 쉬는 중(일시정지)이 30분을 넘으면 화면이 "아직 공부 중인가요?" 알림을 띄우고,
 *   총 60분을 넘으면 세션을 자동 종료한다(공부 시간은 쉬기 전까지, 문제 수는 다음 접속 때 입력).
 */
export function useStudyTimer({ studentId, initialSession = null, onFinished, onDiscarded, onAutoEnded }: UseStudyTimerOptions): StudyTimer {
  const [session, setSession] = useState<StudySession | null>(initialSession)
  const [loading, setLoading] = useState(!initialSession)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [pausedFor, setPausedFor] = useState(0)
  const [limitReached, setLimitReached] = useState(false)
  const [wakeLockOk, setWakeLockOk] = useState(true)
  const [kind, setKind] = useState<SessionKind>(normalizeKind(initialSession?.kind))

  const sessionRef = useRef<StudySession | null>(initialSession)
  const offsetRef = useRef(0)
  const busyRef = useRef(false)
  const finishingRef = useRef(false)
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)
  const kindRef = useRef<SessionKind>(normalizeKind(initialSession?.kind))
  const onFinishedRef = useRef(onFinished)
  const onDiscardedRef = useRef(onDiscarded)
  const onAutoEndedRef = useRef(onAutoEnded)
  /** 질문 창을 여는 동안 화면을 벗어나도 멈추지 않기 (숙제 공부) */
  const leaveHoldRef = useRef(false)
  /** 자동 종료 요청이 도는 중인지 (같은 요청이 겹치지 않게) */
  const autoEndingRef = useRef(false)
  /** 자동 종료가 실패한 세션 — 계속 다시 시도하지 않는다(DB 함수가 아직 없을 때) */
  const autoEndFailedIdRef = useRef<string | null>(null)
  onFinishedRef.current = onFinished
  onDiscardedRef.current = onDiscarded
  onAutoEndedRef.current = onAutoEnded

  const applySession = useCallback((next: StudySession | null) => {
    sessionRef.current = next
    setSession(next)
    if (next?.kind) {
      kindRef.current = normalizeKind(next.kind)
      setKind(kindRef.current)
    }
  }, [])

  const syncServerTime = useCallback((iso: string | null | undefined) => {
    const ms = parseMs(iso ?? null)
    if (Number.isFinite(ms)) offsetRef.current = ms - Date.now()
  }, [])

  const serverNowMs = useCallback(() => Date.now() + offsetRef.current, [])

  /** 지금 시각(서버 보정) ISO */
  const nowIso = useCallback(() => new Date(Date.now() + offsetRef.current).toISOString(), [])

  /* 질문 창(사진·카메라)을 여는 동안 숙제 타이머가 멈추지 않게 잠깐 잡아 둔다.
     창을 닫으면 그동안 끊겼을 수 있는 마지막 신호를 지금으로 다시 맞춘다. */
  const computeElapsed = useCallback((target: StudySession | null = sessionRef.current): number => {
    if (!target) return 0
    return computeElapsedSeconds(target, Date.now() + offsetRef.current)
  }, [])

  const holdOnLeave = useCallback(
    (held: boolean) => {
      leaveHoldRef.current = held
      const current = sessionRef.current
      if (!held && current && current.status === 'running' && pausesOnLeave(current.kind)) {
        void api.touchHeartbeat(current.id, new Date(Date.now() + offsetRef.current).toISOString())
        setElapsed(computeElapsed(current))
      }
    },
    [computeElapsed],
  )

  /* 1초마다 화면 숫자 갱신 (쉬는 시간도 함께 센다) */
  useEffect(() => {
    const tick = () => {
      const current = sessionRef.current
      setElapsed(computeElapsed(current))
      setPausedFor(pausedSecondsOf(current, Date.now() + offsetRef.current))
    }
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

  /* 앱을 닫았다가 다시 연 경우: 마지막 신호 시점에 멈춘 것으로 본다.
     (화면만 꺼진 경우에는 페이지가 살아 있어서 여기로 오지 않는다)
     숙제 공부만 멈춘다. 학원 공부는 앱을 닫았다 열어도 그대로 두고 마지막 신호만 지금으로 맞춘다.
     (훈출이 등원으로 연 학원 세션은 하트비트가 시작 시각에 멈춰 있어 '끊김'으로 보이는데,
      여기서 일시정지하면 멈춘 시각이 곧 시작 시각이 되어 0분짜리 기록이 될 수 있다 — 2026-11-27) */
  const settleLoaded = useCallback(
    async (active: StudySession | null) => {
      let next = active
      if (next && next.status === 'running' && isHeartbeatStale(next, Date.now() + offsetRef.current)) {
        if (pausesOnLeave(next.kind)) {
          const paused = await api.pauseSession(next.id, true)
          if (paused.ok) {
            next = paused.data
            setNotice('화면을 벗어나서 멈췄어요')
          }
        } else {
          void api.touchHeartbeat(next.id, nowIso())
        }
      }
      applySession(next)
      setElapsed(computeElapsed(next))
      if (next?.status === 'paused') setNotice((prev) => prev ?? '일시정지 중이에요')
    },
    [applySession, computeElapsed, nowIso],
  )

  /* 처음 들어올 때 진행 중인 세션 확인 */
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const nowRes = await api.serverNow()
    if (nowRes.ok) syncServerTime(nowRes.data)

    const res = await api.getActiveSession(studentId)
    if (!res.ok) {
      setError(res.error)
      setLoading(false)
      return
    }
    if (res.data.discarded) {
      applySession(null)
      setElapsed(0)
      setLoading(false)
      onDiscardedRef.current?.('stale')
      return
    }

    await settleLoaded(res.data.session)
    setLoading(false)
  }, [studentId, applySession, settleLoaded, syncServerTime])

  useEffect(() => {
    if (!initialSession) {
      void load()
      return
    }
    // 이미 받아둔 세션이 있으면 바로 그리고, 서버 시각을 맞춘 뒤에 앱을 벗어나 있던 시간을 정리한다
    applySession(initialSession)
    setElapsed(computeElapsed(initialSession))
    setLoading(false)
    void (async () => {
      const nowRes = await api.serverNow()
      if (nowRes.ok) syncServerTime(nowRes.data)
      await settleLoaded(sessionRef.current)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  /* 시작 — 학원 공부 / 숙제 공부 */
  const start = useCallback(async (nextKind: SessionKind = 'academy') => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    setLimitReached(false)
    kindRef.current = nextKind
    setKind(nextKind)
    const res = await api.startSession(studentId, nextKind)
    if (res.ok) {
      syncServerTime(res.data.last_heartbeat_at)
      await settleLoaded(res.data)
      if (res.data.status !== 'paused') setNotice(null)
    } else {
      setError(res.error)
    }
    busyRef.current = false
    setBusy(false)
  }, [studentId, applySession, computeElapsed, settleLoaded, syncServerTime])

  /* 일시정지 */
  const pause = useCallback(
    async (auto = false, message?: string) => {
      const current = sessionRef.current
      if (!current || current.status !== 'running' || busyRef.current) return
      busyRef.current = true
      setBusy(true)
      // 화면을 꺼둔 시간이 길었어도 "지금" 멈춘 것으로 처리되도록 마지막 신호를 먼저 갱신한다
      await api.touchHeartbeat(current.id, new Date(Date.now() + offsetRef.current).toISOString())
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
    // 숙제 공부: 화면을 벗어난 사이 일시정지가 서버에 닿지 못했을 수 있으니,
    // 먼저 마지막 신호 시점에서 멈춘 것으로 확정한다(벗어나 있던 시간은 빼고).
    if (pausesOnLeave(current.kind)) {
      const guard = await api.pauseSession(current.id, true)
      if (!guard.ok) {
        setError(guard.error)
        busyRef.current = false
        setBusy(false)
        return
      }
      applySession(guard.data)
    }
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

  /* 기록 없이 버리기 (자정 초과) */
  const discard = useCallback(
    async (reason: DiscardReason = 'midnight') => {
      const current = sessionRef.current
      if (!current) return
      if (finishingRef.current) return
      finishingRef.current = true
      setBusy(true)
      await api.discardSession(current.id)
      finishingRef.current = false
      setBusy(false)
      applySession(null)
      setElapsed(0)
      onDiscardedRef.current?.(reason)
    },
    [applySession],
  )

  /* 종료 (학원: 서버가 시간을 계산해 study_logs 에 누적 / 숙제: 사진과 함께 승인 대기로 제출) */
  const finish = useCallback(
    async (problems: number, reason: FinishReason = 'manual', photoPaths: string[] = []): Promise<FinishResult | null> => {
      const current = sessionRef.current
      if (!current || finishingRef.current) return null
      // 자정을 넘긴 세션은 종료를 눌러도 기록하지 않고 버린다
      if (current.date !== todayKst()) {
        await discard('stale')
        return null
      }
      finishingRef.current = true
      setBusy(true)
      setError(null)
      // 숙제 공부: 화면을 벗어난 사이 일시정지가 서버에 닿지 못했을 수 있으니,
      // 마지막 신호 시점에서 멈춘 것으로 먼저 확정한 뒤 종료한다(벗어나 있던 시간은 빼고).
      if (pausesOnLeave(current.kind)) {
        const guard = await api.pauseSession(current.id, true)
        if (guard.ok) applySession(guard.data)
      }
      const isHomework = normalizeKind(current.kind) === 'homework'
      const res = isHomework
        ? await homeworkApi.submitHomework(current.id, problems, photoPaths)
        : await api.finishSession(current.id, problems)
      finishingRef.current = false
      setBusy(false)
      if (res.ok) {
        applySession(res.data.session)
        setElapsed(computeElapsed(res.data.session))
        try {
          onFinishedRef.current?.({ ...res.data, kind: normalizeKind(res.data.kind ?? kindRef.current) }, reason)
        } catch (callbackError) {
          console.error('[sunogong] 종료 처리 중 오류:', callbackError)
        }
        return res.data
      }
      setError(res.error)
      return null
    },
    [applySession, computeElapsed, discard],
  )

  /* 쉬는 시간이 60분을 넘으면 자동 종료 (공부 시간은 쉬기 전까지, 문제 수는 다음 접속 때) */
  const autoEnd = useCallback(async () => {
    const current = sessionRef.current
    if (!current || current.status !== 'paused') return
    if (autoEndingRef.current || finishingRef.current) return
    // DB 함수가 아직 없어 한 번 실패했다면 같은 세션으로 계속 다시 시도하지 않는다
    if (autoEndFailedIdRef.current === current.id) return
    autoEndingRef.current = true
    setBusy(true)
    const res = await api.autoEndPausedSession(current.id)
    autoEndingRef.current = false
    setBusy(false)
    if (!res.ok) {
      autoEndFailedIdRef.current = current.id
      setError(res.error)
      return
    }
    const data = res.data
    if (data.too_short) {
      // 실제 공부가 1분도 안 됐다 — 자동 종료하지 않고 그대로 둔다 (DB 가드와 같은 판단)
      autoEndFailedIdRef.current = current.id
      if (data.session) applySession(data.session)
      return
    }
    if (data.discarded) {
      // 자정을 넘긴 공부 — 기록 없이 버린다 (기존 규칙)
      applySession(null)
      setElapsed(0)
      setPausedFor(0)
      onDiscardedRef.current?.('stale')
      return
    }
    if (!data.session) return
    applySession(data.session)
    setElapsed(computeElapsed(data.session))
    setPausedFor(0)
    setNotice(null)
    try {
      onAutoEndedRef.current?.(data)
    } catch (callbackError) {
      console.error('[sunogong] 자동 종료 처리 중 오류:', callbackError)
    }
  }, [applySession, computeElapsed])

  /* 30분 알림 뒤에도 응답이 없어 60분을 채우면 자동 종료 */
  useEffect(() => {
    if (!session || session.status !== 'paused') return
    if (pausedFor < PAUSE_AUTO_END_SECONDS) return
    void autoEnd()
  }, [pausedFor, session?.id, session?.status, autoEnd])

  /* 선생님이 관리자 실시간 탭에서 「수업 종료」했는지 확인한다.
     학생 기기가 타이머 화면에 머물러 있어도 10초 안에 알아채고 결과 화면으로 넘어간다. */
  useEffect(() => {
    if (!session || session.status === 'finished') return undefined
    const sessionId = session.id
    let cancelled = false
    let checking = false

    const check = async () => {
      if (cancelled || checking) return
      if (finishingRef.current || autoEndingRef.current) return
      checking = true
      const res = await api.studySessionState(sessionId)
      checking = false
      if (cancelled || finishingRef.current) return
      if (!res.ok || !res.data) return

      /* 세션이 사라졌다(자정 넘김 등) — 기록 없이 대기 화면으로 */
      if (res.data.status === 'missing') {
        applySession(null)
        setElapsed(0)
        setPausedFor(0)
        return
      }
      if (res.data.status !== 'finished') return

      const result = res.data.result
      if (!result || !result.session) return

      applySession(result.session)
      setElapsed(computeElapsed(result.session))
      setPausedFor(0)
      setNotice(null)
      try {
        onFinishedRef.current?.(
          { ...result, kind: normalizeKind(result.kind ?? kindRef.current) },
          result.ended_by_admin ? 'admin' : 'manual',
        )
      } catch (callbackError) {
        console.error('[sunogong] 종료 확인 처리 중 오류:', callbackError)
      }
    }

    const id = window.setInterval(() => void check(), REMOTE_END_CHECK_MS)
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [session?.id, session?.status, applySession, computeElapsed])

  /* 하트비트 (10초) — 마지막 신호 시각만 갱신한다.
     화면이 꺼져 타이머가 느려지더라도 서버가 임의로 일시정지하지 않게 하기 위해서다. */
  useEffect(() => {
    if (!session || session.status !== 'running') return undefined
    let cancelled = false
    let beats = 0

    const beat = async () => {
      const current = sessionRef.current
      if (!current || current.status !== 'running' || finishingRef.current) return
      beats += 1
      // 가끔 서버 시각을 다시 맞춘다 (기기 시계가 조금씩 어긋나는 것 보정)
      if (beats % 30 === 0) {
        const nowRes = await api.serverNow()
        if (cancelled) return
        if (nowRes.ok) syncServerTime(nowRes.data)
      }
      await api.touchHeartbeat(current.id, new Date(Date.now() + offsetRef.current).toISOString())
    }

    const id = window.setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [session?.id, session?.status, syncServerTime])

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

  /* 화면 꺼짐 vs 앱 이탈 — 공부 종류에 따라 다르게
     - 숙제 공부(homework): 화면을 끄거나 다른 화면·앱으로 나가면 곧바로 일시정지한다.
       화면에는 서버 응답을 기다리지 않고 바로 "일시정지"로 보여 주고, 요청은 keepalive 로 보낸다.
     - 학원 공부(academy): 화면이 꺼지거나 앱을 잠깐 벗어난 것(visibilitychange hidden / blur / pagehide)만으로는
       멈추지 않는다. 화면을 끄고 공부를 계속하는 경우가 있고, 아이폰은 화면을 잠그면 pagehide 가 오기 때문이다.
       대신 페이지를 떠나는 순간의 시각을 마지막 신호로 남겨 두고, 앱을 다시 열었을 때 그 시점까지로 정리한다. */
  useEffect(() => {
    if (!session || session.status === 'finished') return undefined

    /** 숙제 공부: 지금 이 순간 멈춘 것으로 화면에 먼저 반영하고 서버에도 알린다 */
    const pauseForLeave = () => {
      const current = sessionRef.current
      if (!current || current.status !== 'running') return
      if (finishingRef.current || busyRef.current) return
      if (leaveHoldRef.current) return
      const at = nowIso()
      const paused: StudySession = { ...current, status: 'paused', paused_at: at }
      applySession(paused)
      setElapsed(computeElapsed(paused))
      setNotice('화면을 벗어나서 멈췄어요')
      api.pauseSessionBeacon(current.id)
    }

    /** 숙제 공부: 화면을 벗어난 사이 일시정지가 닿지 못했다면 마지막 신호 시점에서 멈춘 것으로 확정 */
    const stopLeftHomework = async () => {
      const current = sessionRef.current
      if (!current || current.status !== 'running') return
      // 지금 시각으로 하트비트를 먼저 치면 벗어나 있던 시간이 공부 시간으로 들어가므로 치지 않는다
      const res = await api.pauseSession(current.id, true)
      if (res.ok) {
        applySession(res.data)
        setElapsed(computeElapsed(res.data))
        setNotice((prev) => prev ?? '화면을 벗어나서 멈췄어요')
      }
    }

    const onLeave = () => {
      const current = sessionRef.current
      if (!current || current.status !== 'running') return
      if (pausesOnLeave(current.kind)) {
        pauseForLeave()
      } else {
        api.heartbeatBeacon(current.id, nowIso())
      }
    }

    const onVisibility = () => {
      try {
        if (document.visibilityState === 'visible') {
          const current = sessionRef.current
          if (current && current.date !== todayKst()) {
            // 화면이 꺼져 있는 동안 자정을 넘긴 경우
            void discard('midnight')
            return
          }
          if (current && current.status === 'running') {
            void requestWakeLock()
            if (pausesOnLeave(current.kind) && !leaveHoldRef.current) {
              void stopLeftHomework()
            } else {
              // 화면이 다시 켜지면 마지막 신호 시각을 먼저 현재로 맞춘다
              void api.touchHeartbeat(current.id, nowIso())
              setElapsed(computeElapsed())
            }
          }
        } else {
          onLeave()
        }
      } catch (visibilityError) {
        console.warn('[sunogong] visibility 처리 실패:', visibilityError)
      }
    }

    const onBlur = () => {
      // 다른 앱·다른 창으로 넘어간 경우 (화면이 꺼지는 것은 visibilitychange 가 먼저 올 때가 많다)
      if (document.visibilityState === 'visible' && document.hasFocus()) return
      onLeave()
    }

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void load()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pagehide', onLeave)
    window.addEventListener('beforeunload', onLeave)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pagehide', onLeave)
      window.removeEventListener('beforeunload', onLeave)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [session?.id, session?.status, requestWakeLock, computeElapsed, load, discard, applySession, nowIso])

  /* 한국 시간 자정(00:00)을 넘기면 기록 없이 버린다 */
  useEffect(() => {
    if (!session || session.status === 'finished') return undefined
    const targetMs = kstMidnightMs(session.date)
    const waitMs = targetMs - serverNowMs()
    if (!Number.isFinite(waitMs)) return undefined
    if (waitMs <= 0) {
      void discard('midnight')
      return undefined
    }
    const id = window.setTimeout(() => {
      void discard('midnight')
    }, Math.min(waitMs, 2_147_483_000))
    return () => window.clearTimeout(id)
  }, [session?.id, session?.date, session?.status, discard, serverNowMs])

  /* 5시간 제한 */
  useEffect(() => {
    if (!session || session.status === 'finished') return
    if (elapsed >= MAX_SESSION_SECONDS) setLimitReached(true)
  }, [elapsed, session?.status])

  return {
    session,
    kind,
    status: loading ? 'loading' : !session ? 'idle' : session.status,
    elapsedSeconds: elapsed,
    pausedSeconds: pausedFor,
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
    discard,
    reload: load,
    clearError: () => setError(null),
    holdOnLeave,
  }
}
