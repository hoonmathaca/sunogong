/**
 * 관리자 「공부기록」 월별 달력 계산 (2026-11-28).
 *
 * · 달력 격자(일요일 시작, 앞뒤는 이웃 달 날짜)
 * · 날짜별 학원(🏫)·숙제(🏠) 인원·시간·문제 합계
 * · 하루 상세에 쓸 '학원 공부한 학생 / 숙제 공부한 학생 / 기록 없는 학생'
 *
 * 모두 화면과 상관없는 순수 함수라 단위 테스트(tools/lib-test.ts)로 확인한다.
 */
import { addDays, diffDays, monthRange, weekdayOf } from './time'
import { sortStudents, splitLog, type LogIndex } from './stats'
import type { Student, StudyLog } from './types'

/** 달력 한 칸 — 이웃 달 날짜는 inMonth=false 로 흐리게 그린다 */
export interface CalendarCell {
  date: string
  /** 그 달의 날짜 숫자 (이웃 달은 그 달의 숫자) */
  day: number
  inMonth: boolean
}

function dayOf(date: string): number {
  return Number(date.slice(8, 10))
}

/** 그 달 달력 격자 — 일요일 시작, 7의 배수 칸(마지막 주는 다음 달 날짜로 채운다) */
export function buildMonthGrid(month: string): CalendarCell[] {
  const { start } = monthRange(month)
  if (!start) return []
  const lead = weekdayOf(start)
  const cells: CalendarCell[] = []
  for (let i = 0; i < lead; i += 1) {
    const date = addDays(start, i - lead)
    cells.push({ date, day: dayOf(date), inMonth: false })
  }
  const total = diffDays(start, monthRange(month).end) + 1
  for (let i = 0; i < total; i += 1) {
    const date = addDays(start, i)
    cells.push({ date, day: dayOf(date), inMonth: true })
  }
  while (cells.length % 7 !== 0) {
    const date = addDays(cells[cells.length - 1].date, 1)
    cells.push({ date, day: dayOf(date), inMonth: false })
  }
  return cells
}

/** 하루치 학원·숙제 합계 — 인원(그날 그 종류로 기록한 학생 수)과 시간·문제 */
export interface DaySum {
  academyStudents: number
  academyMinutes: number
  academyProblems: number
  homeworkStudents: number
  homeworkMinutes: number
  homeworkProblems: number
  /** 그날 기록이 하나라도 있는 학생 수 */
  students: number
}

export const EMPTY_DAY_SUM: DaySum = {
  academyStudents: 0,
  academyMinutes: 0,
  academyProblems: 0,
  homeworkStudents: 0,
  homeworkMinutes: 0,
  homeworkProblems: 0,
  students: 0,
}

/** 그날 그 종류로 공부했는지 (시간이나 문제가 0보다 큼) */
export function hasKind(log: StudyLog | null | undefined, kind: 'academy' | 'homework'): boolean {
  if (!log) return false
  const split = splitLog(log)
  return kind === 'academy'
    ? split.academyMinutes > 0 || split.academyProblems > 0
    : split.homeworkMinutes > 0 || split.homeworkProblems > 0
}

/** 한 학생의 하루 기록을 합계에 더한다 */
export function addLogToDaySum(sum: DaySum, log: StudyLog | null | undefined): DaySum {
  if (!log) return sum
  const split = splitLog(log)
  const academy = split.academyMinutes > 0 || split.academyProblems > 0
  const homework = split.homeworkMinutes > 0 || split.homeworkProblems > 0
  return {
    academyStudents: sum.academyStudents + (academy ? 1 : 0),
    academyMinutes: sum.academyMinutes + split.academyMinutes,
    academyProblems: sum.academyProblems + split.academyProblems,
    homeworkStudents: sum.homeworkStudents + (homework ? 1 : 0),
    homeworkMinutes: sum.homeworkMinutes + split.homeworkMinutes,
    homeworkProblems: sum.homeworkProblems + split.homeworkProblems,
    students: sum.students + 1,
  }
}

/** 그 달 날짜별 합계 (학생 목록은 학년 필터가 적용된 목록을 넘긴다) */
export function monthDaySums(students: Student[], index: LogIndex, month: string): Map<string, DaySum> {
  const { start, end } = monthRange(month)
  const sums = new Map<string, DaySum>()
  if (!start || !end) return sums
  for (const student of students) {
    const byDate = index.get(student.id)
    if (!byDate) continue
    for (const [date, log] of byDate) {
      if (date < start || date > end) continue
      sums.set(date, addLogToDaySum(sums.get(date) ?? { ...EMPTY_DAY_SUM }, log))
    }
  }
  return sums
}

/** 달 전체 합계 — 달력 위쪽 요약에 쓴다 (인원은 연인원) */
export function sumMonth(days: Iterable<DaySum>): DaySum {
  let total: DaySum = { ...EMPTY_DAY_SUM }
  for (const day of days) {
    total = {
      academyStudents: total.academyStudents + day.academyStudents,
      academyMinutes: total.academyMinutes + day.academyMinutes,
      academyProblems: total.academyProblems + day.academyProblems,
      homeworkStudents: total.homeworkStudents + day.homeworkStudents,
      homeworkMinutes: total.homeworkMinutes + day.homeworkMinutes,
      homeworkProblems: total.homeworkProblems + day.homeworkProblems,
      students: total.students + day.students,
    }
  }
  return total
}

/** 날짜 클릭 상세 — 그날 학원/숙제로 공부한 학생과 기록이 없는 학생 */
export interface DayBreakdown {
  academy: Student[]
  homework: Student[]
  /** 그날 아무 기록도 없는 학생 */
  missing: Student[]
}

export function dayBreakdown(students: Student[], index: LogIndex, date: string): DayBreakdown {
  const academy: Student[] = []
  const homework: Student[] = []
  const missing: Student[] = []
  for (const student of sortStudents(students)) {
    const log = index.get(student.id)?.get(date)
    const studiedAcademy = hasKind(log, 'academy')
    const studiedHomework = hasKind(log, 'homework')
    if (studiedAcademy) academy.push(student)
    if (studiedHomework) homework.push(student)
    if (!studiedAcademy && !studiedHomework) missing.push(student)
  }
  return { academy, homework, missing }
}

/**
 * 달력 칸(360px 에서 폭 25px)에 들어가는 아주 짧은 시간 — '45분' · '1시간' · '36시간'
 * 분은 버리고 시간만 적는다(정확한 값은 날짜 상세·달 요약에 그대로).
 */
export function cellTimeText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes || 0))
  if (m < 60) return `${m}분`
  return `${Math.floor(m / 60)}시간`
}

/** '2026-11' → '2026년 11월' */
export function monthLabel(month: string): string {
  const [year, value] = month.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(value)) return month
  return `${year}년 ${value}월`
}
