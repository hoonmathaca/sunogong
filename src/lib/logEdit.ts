import type { StudyLog } from './types'

/** 기록 수정 화면에서 다루는 네 값 — 학원 공부와 숙제 공부를 따로 */
export interface LogEditValues {
  academyMinutes: number
  academyProblems: number
  homeworkMinutes: number
  homeworkProblems: number
}

export const EMPTY_EDIT_VALUES: LogEditValues = {
  academyMinutes: 0,
  academyProblems: 0,
  homeworkMinutes: 0,
  homeworkProblems: 0,
}

/** 0 이상의 정수로 다듬는다 (빈 칸·음수·소수·NaN 은 0) */
export function toEditNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''))
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.floor(n))
}

/** 네 값을 저장 가능한 형태로 정리한다 */
export function normalizeEditValues(values: Partial<LogEditValues>): LogEditValues {
  return {
    academyMinutes: toEditNumber(values.academyMinutes),
    academyProblems: toEditNumber(values.academyProblems),
    homeworkMinutes: toEditNumber(values.homeworkMinutes),
    homeworkProblems: toEditNumber(values.homeworkProblems),
  }
}

/**
 * 전체 공부시간·문제 수 = 학원 + 숙제.
 * 저장하는 study_logs.minutes / problems 와 항상 같은 값이 되도록 여기서만 계산한다.
 */
export function editTotals(values: Partial<LogEditValues>): { minutes: number; problems: number } {
  const v = normalizeEditValues(values)
  return {
    minutes: v.academyMinutes + v.homeworkMinutes,
    problems: v.academyProblems + v.homeworkProblems,
  }
}

export interface EditValuesFromLog {
  values: LogEditValues
  /** 합계만 있던 예전 기록이라 학원 공부로 채웠는지 */
  filledFromTotal: boolean
  /** 채워 넣은 분·문제 (안내 문구용) */
  filledMinutes: number
  filledProblems: number
}

/**
 * 기존 기록을 수정 화면 초기값으로 바꾼다.
 * · 학원·숙제 구분이 없던 예전 기록(합계만 있는 기록)은 학원 공부로 본다.
 * · 학원+숙제가 합계보다 적으면(예전에 합계만 직접 고친 기록) 모자란 만큼도 학원 공부로 채운다.
 *   → 저장해도 총 공부시간이 줄지 않고, 합계와 학원+숙제 합이 어긋나지 않는다.
 */
export function editValuesFromLog(log: StudyLog | null | undefined): EditValuesFromLog {
  if (!log) {
    return { values: { ...EMPTY_EDIT_VALUES }, filledFromTotal: false, filledMinutes: 0, filledProblems: 0 }
  }
  const academyMinutes = toEditNumber(log.academy_minutes)
  const academyProblems = toEditNumber(log.academy_problems)
  const homeworkMinutes = toEditNumber(log.homework_minutes)
  const homeworkProblems = toEditNumber(log.homework_problems)
  const filledMinutes = Math.max(0, toEditNumber(log.minutes) - academyMinutes - homeworkMinutes)
  const filledProblems = Math.max(0, toEditNumber(log.problems) - academyProblems - homeworkProblems)
  return {
    values: {
      academyMinutes: academyMinutes + filledMinutes,
      academyProblems: academyProblems + filledProblems,
      homeworkMinutes,
      homeworkProblems,
    },
    filledFromTotal: filledMinutes > 0 || filledProblems > 0,
    filledMinutes,
    filledProblems,
  }
}
