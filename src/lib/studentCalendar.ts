/**
 * 학생 화면 「공부 기록」 달력 — 날짜별 보기 값 계산 (2026-11-28).
 *
 * 학생 폰은 두 곳에서 값을 받는다.
 *   · 등·하원 시각 + 그날 학원·숙제 시간·문제 : DB 함수 student_day_records (훈출 출결 attendance_sessions 포함)
 *   · 최근 30일 공부 기록(합계·비율)           : study_logs (지금까지 쓰던 listStudentLogs)
 *
 * 달력은 달 전체(이전 달 포함)를 보여 주므로 두 값을 날짜로 합쳐 DayView 하나로 만든다.
 * 함수가 아직 없는 DB(마이그레이션 전)에서도 달력이 비지 않도록,
 * 등·하원 값이 없으면 study_logs 값만으로 그날을 그린다.
 *
 * 화면과 상관없는 순수 함수라 단위 테스트(tools/lib-test.ts)로 확인한다.
 */
import { splitLog } from './stats'
import { formatMinutes, kstTimeString, monthRange, parseMs } from './time'
import type { StudentDayRecord, StudyLog } from './types'

/** 그날 등·하원 (훈출 키오스크 출결) */
export interface DayAttendance {
  /** 첫 입실 ISO 시각 */
  inAt: string
  /** 마지막 퇴실 ISO 시각 (아직 안 나갔으면 null) */
  outAt: string | null
  /** 하원을 찍지 않아 시스템이 닫은 날 (21:30 같은 마감 시각은 실제 하원이 아니다) */
  auto: boolean
  /** 아직 학원에 있는 날 (하원 미체크) */
  missing: boolean
  /** 그날 입실 횟수 (좌석 이동·재입실) */
  visits: number
}

/** 달력 한 칸·날짜 상세에 쓰는 하루치 */
export interface DayView {
  date: string
  /** 등·하원 기록이 없으면 null */
  attendance: DayAttendance | null
  academyMinutes: number
  academyProblems: number
  homeworkMinutes: number
  homeworkProblems: number
}

/** 날짜 문자열 비교용 (YYYY-MM-DD 는 사전순 = 날짜순) */
export function isDateText(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function attendanceOf(record: StudentDayRecord | null | undefined): DayAttendance | null {
  if (!record || !record.check_in_at) return null
  return {
    inAt: record.check_in_at,
    outAt: record.check_out_at ?? null,
    auto: Boolean(record.check_out_auto),
    missing: Boolean(record.check_out_missing) || (!record.check_out_at && !record.check_out_auto),
    visits: Math.max(0, record.visits ?? 0),
  }
}

/**
 * 하루치 DayView.
 * record( DB 함수 값 )가 있으면 그 값을, 없으면 study_logs 한 줄을 쓴다.
 */
export function buildDayView(
  date: string,
  record?: StudentDayRecord | null,
  log?: StudyLog | null,
): DayView {
  if (record) {
    return {
      date,
      attendance: attendanceOf(record),
      academyMinutes: Math.max(0, record.academy_minutes ?? 0),
      academyProblems: Math.max(0, record.academy_problems ?? 0),
      homeworkMinutes: Math.max(0, record.homework_minutes ?? 0),
      homeworkProblems: Math.max(0, record.homework_problems ?? 0),
    }
  }
  const split = splitLog(log)
  return {
    date,
    attendance: null,
    academyMinutes: split.academyMinutes,
    academyProblems: split.academyProblems,
    homeworkMinutes: split.homeworkMinutes,
    homeworkProblems: split.homeworkProblems,
  }
}

/** 달력에 그릴 날짜별 DayView — DB 함수 값이 study_logs 값보다 우선한다 */
export function buildDayViews(records: StudentDayRecord[], logs: StudyLog[]): Map<string, DayView> {
  const byRecord = new Map<string, StudentDayRecord>()
  for (const record of records) {
    if (isDateText(record.record_date)) byRecord.set(record.record_date, record)
  }
  const views = new Map<string, DayView>()
  for (const log of logs) {
    if (!isDateText(log.date)) continue
    views.set(log.date, buildDayView(log.date, byRecord.get(log.date) ?? null, log))
  }
  for (const [date, record] of byRecord) {
    views.set(date, buildDayView(date, record, null))
  }
  return views
}

/** 그날 전체 공부 시간 (학원 + 숙제) */
export function dayTotalMinutes(view: DayView | null | undefined): number {
  if (!view) return 0
  return view.academyMinutes + view.homeworkMinutes
}

/** 그날 전체 푼 문제 수 (학원 + 숙제) */
export function dayTotalProblems(view: DayView | null | undefined): number {
  if (!view) return 0
  return view.academyProblems + view.homeworkProblems
}

/** 달력 점 — 학원(파랑)은 시간이나 문제가 있을 때, 숙제(빨강)도 같다 */
export function dayDots(view: DayView | null | undefined): { academy: boolean; homework: boolean } {
  if (!view) return { academy: false, homework: false }
  return {
    academy: view.academyMinutes > 0 || view.academyProblems > 0,
    homework: view.homeworkMinutes > 0 || view.homeworkProblems > 0,
  }
}

/** 그날 보여 줄 것이 있는지 (등·하원만 있어도 있다) */
export function dayHasContent(view: DayView | null | undefined): boolean {
  if (!view) return false
  return Boolean(view.attendance) || dayTotalMinutes(view) > 0 || dayTotalProblems(view) > 0
}

/**
 * 등·하원 한 줄.
 *   · 15:36 등원 ~ 17:48 하원
 *   · 15:36 등원 · 하원 미확인(자동 마감)   ← 하원을 안 찍어 시스템이 닫은 날
 *   · 15:36 등원 · 아직 학원에 있어요       ← 아직 하원하지 않은 날
 *   · 등·하원 기록 없음                     ← 훈출 키오스크를 안 쓴 날
 */
export function attendanceLine(attendance: DayAttendance | null | undefined): string {
  if (!attendance || !attendance.inAt) return '등·하원 기록 없음'
  const inMs = parseMs(attendance.inAt)
  if (!Number.isFinite(inMs)) return '등·하원 기록 없음'
  const inText = kstTimeString(inMs)
  if (attendance.missing) return `${inText} 등원 · 아직 학원에 있어요`
  if (attendance.auto) return `${inText} 등원 · 하원 미확인(자동 마감)`
  if (!attendance.outAt) return `${inText} 등원 · 하원 미확인`
  const outMs = parseMs(attendance.outAt)
  if (!Number.isFinite(outMs)) return `${inText} 등원 · 하원 미확인`
  return `${inText} 등원 ~ ${kstTimeString(outMs)} 하원`
}

/**
 * 학원 공부 칸의 시간 글.
 *   · 2시간 11분
 *   · 시간 기록 없음        ← 0분인데 푼 문제는 있는 날
 *   · 공부 시간 기록 없음   ← 등·하원은 있는데 공부 기록이 없는 날 (선오공 도입 전 10월 등)
 *   · 기록 없음             ← 아무것도 없는 날
 */
export function academyTimeText(view: DayView | null | undefined): string {
  if (!view) return '기록 없음'
  if (view.academyMinutes > 0) return formatMinutes(view.academyMinutes)
  if (view.academyProblems > 0) return '시간 기록 없음'
  if (view.attendance) return '공부 시간 기록 없음'
  return '기록 없음'
}

/** 숙제 공부 칸의 시간 글 (학원과 같은 규칙, 등·하원은 숙제와 상관없다) */
export function homeworkTimeText(view: DayView | null | undefined): string {
  if (!view) return '기록 없음'
  if (view.homeworkMinutes > 0) return formatMinutes(view.homeworkMinutes)
  if (view.homeworkProblems > 0) return '시간 기록 없음'
  return '기록 없음'
}

/** '푼 문제 6개' */
export function problemsText(problems: number): string {
  return `푼 문제 ${Math.max(0, Math.round(problems || 0))}개`
}

/**
 * 달을 바꿨을 때 처음 골라 둘 날짜.
 *   · 이번 달      → 오늘
 *   · 지난 달      → 그 달 마지막 날
 *   · 앞으로의 달  → null (아직 기록이 없다)
 */
export function defaultSelectedDate(month: string, today: string): string | null {
  const { start, end } = monthRange(month)
  if (!isDateText(start) || !isDateText(end) || !isDateText(today)) return null
  const thisMonth = today.slice(0, 7)
  if (month === thisMonth) return today
  if (month < thisMonth) return end
  return null
}

/** 그 달을 달력에서 열 수 있는지 (이번 달 이후는 볼 기록이 없다) */
export function canOpenMonth(month: string, today: string): boolean {
  if (!isDateText(today)) return true
  return month <= today.slice(0, 7)
}
