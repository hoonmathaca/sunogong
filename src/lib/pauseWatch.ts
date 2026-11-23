import { KIND_EMOJI, KIND_LABEL, normalizeKind } from './kinds'
import { formatDateKo, formatMinutes } from './time'
import type { StudySession } from './types'

/** 일시정지(쉬는 중) 30분 → "아직 공부 중인가요?" 알림 */
export const PAUSE_CHECK_SECONDS = 30 * 60

/** 일시정지 총 60분 → 자동 종료 (문제 수는 다음 접속 때 입력) */
export const PAUSE_AUTO_END_SECONDS = 60 * 60

/** 학생이 입력할 수 있는 문제 수 최대값 (2026-11-23: 9,999 → 999) */
export const MAX_PROBLEMS = 999

/** 상한을 넘기려 할 때 보여 주는 안내 (화면·DB 가 같은 말을 쓴다) */
export const PROBLEMS_LIMIT_MESSAGE = '문제 수는 999개까지 넣을 수 있어요.'

export type PauseStage = 'none' | 'check' | 'auto'

/** 쉬는 시간이 어느 단계인지 — none(아직) / check(30분 알림) / auto(60분 자동 종료) */
export function pauseStage(pausedSeconds: number): PauseStage {
  const seconds = Number.isFinite(pausedSeconds) ? Math.max(0, pausedSeconds) : 0
  if (seconds < PAUSE_CHECK_SECONDS) return 'none'
  return seconds >= PAUSE_AUTO_END_SECONDS ? 'auto' : 'check'
}

/** 자동 종료까지 남은 초 (이미 지났으면 0) */
export function secondsUntilAutoEnd(pausedSeconds: number): number {
  const seconds = Number.isFinite(pausedSeconds) ? Math.max(0, Math.floor(pausedSeconds)) : 0
  return Math.max(0, PAUSE_AUTO_END_SECONDS - seconds)
}

/**
 * 키패드에서 한 자리 더 눌렀을 때의 입력값.
 * 999를 넘는 숫자가 되면 그대로 두고 blocked=true — 화면이 안내 문구를 띄운다.
 */
export function appendProblemDigit(current: string, digit: string): { text: string; blocked: boolean } {
  const base = String(current ?? '').replace(/[^0-9]/g, '')
  const nextDigit = String(digit ?? '').replace(/[^0-9]/g, '').slice(0, 1)
  if (!nextDigit) return { text: base, blocked: false }
  const next = `${base}${nextDigit}`
  if (Number(next) > MAX_PROBLEMS) return { text: base, blocked: true }
  return { text: next, blocked: false }
}

/** 입력값이 상한(999)을 넘는지 — 제출 직전 마지막 확인 */
export function problemsOverLimit(value: string | number | null | undefined): boolean {
  const digits = String(value ?? '').replace(/[^0-9]/g, '')
  if (!digits) return false
  return Number(digits) > MAX_PROBLEMS
}

/** 키패드로 입력한 글자 → 저장할 문제 수 (빈 칸은 0, 최대 999) */
export function problemsFromInput(value: string): number {
  const digits = String(value ?? '').replace(/[^0-9]/g, '')
  if (!digits) return 0
  const parsed = Number(digits)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(MAX_PROBLEMS, Math.max(0, Math.floor(parsed)))
}

/** "11월 21일 (금) · 🏠 숙제 공부 · 1시간 20분" — 지난 공부를 알아볼 수 있게 */
export function pendingProblemSummary(session: StudySession): string {
  const kind = normalizeKind(session.kind)
  const parts = [formatDateKo(session.date), `${KIND_EMOJI[kind]} ${KIND_LABEL[kind]}`]
  const minutes = Math.max(0, Math.round(session.minutes ?? 0))
  if (minutes > 0) parts.push(`${formatMinutes(minutes)} 공부`)
  return parts.join(' · ')
}

/**
 * 문제 수를 물어볼 세션 목록 정리.
 * - 끝난 세션 중 problems_pending 인 것만
 * - 공부한 시간이 0분인 세션은 물어볼 것이 없으니 뺀다
 * - 오래된 것부터, 같은 세션은 한 번만
 */
export function pendingProblemQueue(sessions: StudySession[] | null | undefined): StudySession[] {
  const seen = new Set<string>()
  const out: StudySession[] = []
  for (const session of sessions ?? []) {
    if (!session || !session.id) continue
    if (session.status !== 'finished') continue
    if (!session.problems_pending) continue
    if ((session.minutes ?? 0) <= 0) continue
    if (seen.has(session.id)) continue
    seen.add(session.id)
    out.push(session)
  }
  return out.sort((a, b) => {
    const left = Date.parse(a.ended_at ?? a.created_at ?? '') || 0
    const right = Date.parse(b.ended_at ?? b.created_at ?? '') || 0
    return left - right
  })
}

/** 자동 종료 뒤 화면에 잠깐 띄우는 안내 */
export function autoEndNotice(minutes: number): string {
  const studied = Math.max(0, Math.round(minutes || 0))
  const head = '쉬는 지 60분이 지나서 자동으로 마무리했어요'
  return studied > 0
    ? `${head}. ${formatMinutes(studied)} 공부한 것으로 저장했고, 푼 문제 수를 입력해 주세요.`
    : `${head}. 푼 문제 수를 입력해 주세요.`
}
