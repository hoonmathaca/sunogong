export const GRADES = [
  '초1',
  '초2',
  '초3',
  '초4',
  '초5',
  '초6',
  '중1',
  '중2',
  '중3',
  '고1',
  '고2',
  '고3',
] as const

export const UNASSIGNED_GRADE = '미지정'

/** 학년 드롭다운/필터에 쓰는 전체 목록 (미지정 포함, 낮은 학년 → 높은 학년 → 미지정) */
export const GRADE_OPTIONS: string[] = [...GRADES, UNASSIGNED_GRADE]

export type GradeFilter = '전체' | '초등' | '중등' | '고등' | (typeof GRADES)[number] | typeof UNASSIGNED_GRADE

export const GRADE_FILTERS: GradeFilter[] = ['전체', '초등', '중등', '고등', ...GRADES, UNASSIGNED_GRADE]

/** 정렬용 순위: 낮은 학년 → 높은 학년, 미지정은 맨 아래 */
export function gradeRank(grade: string | null | undefined): number {
  const idx = GRADE_OPTIONS.indexOf(grade ?? '')
  return idx === -1 ? GRADE_OPTIONS.length + 1 : idx
}

export function normalizeGrade(grade: string | null | undefined): string {
  const value = (grade ?? '').trim()
  return GRADE_OPTIONS.includes(value) ? value : UNASSIGNED_GRADE
}

export function matchesGradeFilter(grade: string, filter: GradeFilter): boolean {
  if (filter === '전체') return true
  if (filter === '초등') return grade.startsWith('초')
  if (filter === '중등') return grade.startsWith('중')
  if (filter === '고등') return grade.startsWith('고')
  return normalizeGrade(grade) === filter
}

export function compareName(a: string, b: string): number {
  return a.localeCompare(b, 'ko')
}
