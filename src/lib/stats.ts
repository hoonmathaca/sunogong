import { compareName, gradeRank } from './grades'
import { addDays, diffDays, rangeDates } from './time'
import type { Student, StudyLog } from './types'

export interface StudentStat {
  student: Student
  /** 전체 공부 시간(분) — study_logs.minutes 합계 */
  minutes: number
  problems: number
  /** 학원 공부(🏫)로 집계된 시간·문제 */
  academyMinutes: number
  academyProblems: number
  /** 숙제 공부(🏠)로 집계된 시간·문제 */
  homeworkMinutes: number
  homeworkProblems: number
  /** 학원·숙제 어느 쪽에도 잡히지 않은 시간 (합계만 직접 고친 기록) */
  otherMinutes: number
  otherProblems: number
  submittedDays: number
  byDate: Map<string, StudyLog>
}

export interface KindSplit {
  academyMinutes: number
  academyProblems: number
  homeworkMinutes: number
  homeworkProblems: number
}

export const EMPTY_SPLIT: KindSplit = {
  academyMinutes: 0,
  academyProblems: 0,
  homeworkMinutes: 0,
  homeworkProblems: 0,
}

/**
 * 하루 기록을 학원 공부와 숙제 공부로 나눈다.
 * 종류별 값(academy_minutes 등)이 없는 예전 기록이나,
 * 원장님이 합계만 직접 고친 기록은 학원 공부로 본다.
 */
export function splitLog(log: StudyLog | null | undefined): KindSplit {
  if (!log) return EMPTY_SPLIT
  const homeworkMinutes = Math.max(0, log.homework_minutes ?? 0)
  const homeworkProblems = Math.max(0, log.homework_problems ?? 0)
  let academyMinutes = Math.max(0, log.academy_minutes ?? 0)
  let academyProblems = Math.max(0, log.academy_problems ?? 0)
  if (academyMinutes === 0 && homeworkMinutes === 0 && (log.minutes ?? 0) > 0) {
    academyMinutes = Math.max(0, log.minutes)
  }
  if (academyProblems === 0 && homeworkProblems === 0 && (log.problems ?? 0) > 0) {
    academyProblems = Math.max(0, log.problems)
  }
  return { academyMinutes, academyProblems, homeworkMinutes, homeworkProblems }
}

export type LogIndex = Map<string, Map<string, StudyLog>> // student_id → date → log

export function indexLogs(logs: StudyLog[]): LogIndex {
  const index: LogIndex = new Map()
  for (const log of logs) {
    let byDate = index.get(log.student_id)
    if (!byDate) {
      byDate = new Map()
      index.set(log.student_id, byDate)
    }
    byDate.set(log.date, log)
  }
  return index
}

export function buildStats(
  students: Student[],
  index: LogIndex,
  start: string,
  end: string,
): StudentStat[] {
  return students.map((student) => {
    const byDate = new Map<string, StudyLog>()
    let minutes = 0
    let problems = 0
    let academyMinutes = 0
    let academyProblems = 0
    let homeworkMinutes = 0
    let homeworkProblems = 0
    const source = index.get(student.id)
    if (source) {
      for (const [date, log] of source) {
        if (date >= start && date <= end) {
          byDate.set(date, log)
          minutes += log.minutes ?? 0
          problems += log.problems ?? 0
          const split = splitLog(log)
          academyMinutes += split.academyMinutes
          academyProblems += split.academyProblems
          homeworkMinutes += split.homeworkMinutes
          homeworkProblems += split.homeworkProblems
        }
      }
    }
    return {
      student,
      minutes,
      problems,
      academyMinutes,
      academyProblems,
      homeworkMinutes,
      homeworkProblems,
      otherMinutes: Math.max(0, minutes - academyMinutes - homeworkMinutes),
      otherProblems: Math.max(0, problems - academyProblems - homeworkProblems),
      submittedDays: byDate.size,
      byDate,
    }
  })
}

/** 학년 → 이름 가나다순 정렬 (낮은 학년 먼저, 미지정 맨 아래) */
export function sortStudents(students: Student[]): Student[] {
  return [...students].sort((a, b) => {
    const gradeDiff = gradeRank(a.grade) - gradeRank(b.grade)
    if (gradeDiff !== 0) return gradeDiff
    return compareName(a.name, b.name)
  })
}

export function groupByGrade(students: Student[]): { grade: string; students: Student[] }[] {
  const groups = new Map<string, Student[]>()
  for (const student of sortStudents(students)) {
    const key = student.grade || '미지정'
    const list = groups.get(key)
    if (list) list.push(student)
    else groups.set(key, [student])
  }
  return [...groups.entries()].map(([grade, list]) => ({ grade, students: list }))
}

/** 기간 안에서 가장 길게 이어진 연속 공부 일수 */
export function longestStreakInRange(dates: Iterable<string>, start: string, end: string): number {
  const set = new Set<string>()
  for (const date of dates) {
    if (date >= start && date <= end) set.add(date)
  }
  if (set.size === 0) return 0
  let best = 0
  const min = [...set].sort()[0]
  const span = Math.min(diffDays(min, end), 400)
  let run = 0
  for (let i = 0; i <= span; i += 1) {
    const date = addDays(min, i)
    if (set.has(date)) {
      run += 1
      best = Math.max(best, run)
    } else {
      run = 0
    }
  }
  return best
}

/** 전체 기간에서 가장 길게 이어진 연속 공부 일수 (역대 최장) */
export function longestStreakAllTime(dates: Iterable<string>): number {
  const sorted = [...new Set(dates)].sort()
  if (sorted.length === 0) return 0
  let best = 1
  let run = 1
  for (let i = 1; i < sorted.length; i += 1) {
    if (diffDays(sorted[i - 1], sorted[i]) === 1) run += 1
    else run = 1
    best = Math.max(best, run)
  }
  return best
}

export interface RankedEntry {
  student: Student
  value: number
  days: number
  rank: number
}

/**
 * 값 내림차순 순위. 동점이면 같은 순위로 두고,
 * 같은 순위 안에서는 제출 일수가 많은 학생을 먼저 보여준다.
 */
export function rankEntries(
  items: { student: Student; value: number; days: number }[],
  take = 3,
): RankedEntry[] {
  const sorted = [...items]
    .filter((item) => item.value > 0)
    .sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value
      if (b.days !== a.days) return b.days - a.days
      return compareName(a.student.name, b.student.name)
    })

  const ranked: RankedEntry[] = []
  let rank = 0
  let prevValue = Number.NaN
  sorted.forEach((item, idx) => {
    if (item.value !== prevValue) {
      rank = idx + 1
      prevValue = item.value
    }
    ranked.push({ student: item.student, value: item.value, days: item.days, rank })
  })

  // 3위 안에 동점자가 더 있으면 함께 보여준다.
  const cut = ranked.filter((entry) => entry.rank <= take)
  const lastRank = cut.length > 0 ? cut[cut.length - 1].rank : 0
  return ranked.filter((entry) => entry.rank <= Math.max(take, lastRank))
}

/** 기간 내 미제출 학생 */
export function studentsWithoutLogs(
  students: Student[],
  index: LogIndex,
  start: string,
  end: string,
): Student[] {
  return sortStudents(students).filter((student) => {
    const dates = [...rangeDates(start, end)]
    const byDate = index.get(student.id)
    if (!byDate) return true
    return !dates.some((date) => byDate.has(date))
  })
}

/** 날짜별 합계 (그래프용) — 학원·숙제도 함께 센다 */
export function dailyTotals(
  index: LogIndex,
  dates: string[],
): { date: string; minutes: number; problems: number; academyMinutes: number; homeworkMinutes: number }[] {
  return dates.map((date) => {
    let minutes = 0
    let problems = 0
    let academyMinutes = 0
    let homeworkMinutes = 0
    for (const byDate of index.values()) {
      const log = byDate.get(date)
      if (log) {
        minutes += log.minutes ?? 0
        problems += log.problems ?? 0
        const split = splitLog(log)
        academyMinutes += split.academyMinutes
        homeworkMinutes += split.homeworkMinutes
      }
    }
    return { date, minutes, problems, academyMinutes, homeworkMinutes }
  })
}

/** 학생별 통계의 학원·숙제 합계 (학년별 요약 등에서 재사용) */
export function sumSplits(stats: StudentStat[]): KindSplit & { minutes: number; problems: number; otherMinutes: number } {
  return stats.reduce(
    (acc, stat) => ({
      academyMinutes: acc.academyMinutes + stat.academyMinutes,
      academyProblems: acc.academyProblems + stat.academyProblems,
      homeworkMinutes: acc.homeworkMinutes + stat.homeworkMinutes,
      homeworkProblems: acc.homeworkProblems + stat.homeworkProblems,
      minutes: acc.minutes + stat.minutes,
      problems: acc.problems + stat.problems,
      otherMinutes: acc.otherMinutes + stat.otherMinutes,
    }),
    { academyMinutes: 0, academyProblems: 0, homeworkMinutes: 0, homeworkProblems: 0, minutes: 0, problems: 0, otherMinutes: 0 },
  )
}
