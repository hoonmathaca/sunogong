import { MAX_SESSION_SECONDS, parseMs } from './time'
import type { StudySession } from './types'

/**
 * 화면에 보여줄 공부 시간(초).
 * 서버 시각 기준으로 계산하고, 일시정지 시간은 빼며, 최대 5시간까지만 센다.
 *
 * @param session      서버에서 받은 세션
 * @param serverNowMs  기기 시각을 서버 시각으로 보정한 현재 시각
 */
export function computeElapsedSeconds(session: StudySession, serverNowMs: number): number {
  const startedMs = parseMs(session.started_at)
  if (!Number.isFinite(startedMs)) return 0

  const endedMs = parseMs(session.ended_at)
  const pausedMs = parseMs(session.paused_at)

  const base =
    session.status === 'finished'
      ? Number.isFinite(endedMs)
        ? endedMs
        : serverNowMs
      : session.status === 'paused'
        ? Number.isFinite(pausedMs)
          ? pausedMs
          : serverNowMs
        : serverNowMs

  const seconds = Math.floor((base - startedMs) / 1000) - (session.paused_seconds ?? 0)
  return Math.max(0, Math.min(seconds, MAX_SESSION_SECONDS))
}

/** 하트비트가 30초 넘게 끊겼는지 (서버 규칙과 같은 판단) */
export function isHeartbeatStale(session: StudySession, serverNowMs: number, timeoutMs = 30_000): boolean {
  if (session.status !== 'running') return false
  const beatMs = parseMs(session.last_heartbeat_at)
  if (!Number.isFinite(beatMs)) return true
  return serverNowMs - beatMs > timeoutMs
}

/** 분으로 내림 (0분 이상) */
export function elapsedMinutes(seconds: number): number {
  return Math.max(0, Math.floor(seconds / 60))
}

/**
 * 학원 등원 중인가 — 훈출(등·하원)이 연 학원 세션이 아직 진행 중(running/paused).
 * 이때는 숙제 공부를 시작할 수 없다 (2026-11-28).
 */
export function isAcademySessionActive(session: StudySession | null | undefined): boolean {
  if (!session || !session.id || session.status === 'finished') return false
  return (session.kind ?? 'academy') === 'academy'
}

/**
 * 쉬는 중(일시정지)인 시간(초) — 서버 시각 보정값 기준.
 * 일시정지가 아니면 0.
 */
export function pausedSecondsOf(session: StudySession | null | undefined, serverNowMs: number): number {
  if (!session || session.status !== 'paused') return 0
  const pausedMs = parseMs(session.paused_at)
  const base = Number.isFinite(pausedMs) ? pausedMs : serverNowMs
  return Math.max(0, Math.floor((serverNowMs - base) / 1000))
}
