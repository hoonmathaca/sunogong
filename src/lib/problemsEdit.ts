/**
 * 학생이 오늘 학원 공부 문제 수를 직접 고칠 때 쓰는 계산 (2026-11-23).
 *
 * · 오늘 학원 공부 기록(시간 또는 문제 수)이 있어야 고칠 수 있다.
 * · 숙제 공부 문제 수는 선생님 승인 대상이라 건드리지 않는다.
 * 화면 없이 확인할 수 있게 순수 함수로 둔다 — DB 함수와 같은 규칙이다.
 */

export interface AcademySplitLike {
  academyMinutes?: number | null
  academyProblems?: number | null
}

/** 오늘 학원 공부 기록이 있는가 (0분 0문제 기록은 남지 않으므로 둘 다 0이면 없다) */
export function hasTodayAcademy(split: AcademySplitLike | null | undefined): boolean {
  const minutes = Number(split?.academyMinutes ?? 0)
  const problems = Number(split?.academyProblems ?? 0)
  return (Number.isFinite(minutes) && minutes > 0) || (Number.isFinite(problems) && problems > 0)
}

/** 수정 뒤 문제 합계 — 학원(새 값) + 숙제(그대로). DB 의 problems 재계산과 같다. */
export function problemsAfterAcademyEdit(academyProblems: number, homeworkProblems: number | null | undefined): number {
  const academy = Number.isFinite(academyProblems) ? Math.max(0, Math.floor(academyProblems)) : 0
  const homework = Number(homeworkProblems ?? 0)
  return academy + (Number.isFinite(homework) ? Math.max(0, Math.floor(homework)) : 0)
}
