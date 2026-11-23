import { useCallback, useEffect, useState } from 'react'
import * as api from '../lib/api'
import * as homeworkApi from '../lib/homework'
import { mergePendingItems, type PendingItem } from '../lib/homeworkBoard'

export type { PendingItem }

export interface PendingProblems {
  /** 지금 물어볼 것 (가장 오래된 것부터, 이번에 건너뛴 것은 빼고) */
  current: PendingItem | null
  /** 아직 마저 내지 않은 건수 (서버 기준) */
  count: number
  /** 남은 것 중 숙제 공부가 있는지 (홈 카드 문구·안내) */
  hasHomework: boolean
  busy: boolean
  error: string | null
  reload: () => Promise<void>
  /** 학원: 문제 수만 / 숙제: (이미 올린) 사진 경로와 문제 수를 내고 승인 대기로 넘긴다 */
  submit: (problems: number, photoPaths?: string[]) => Promise<boolean>
  /** 이번 접속에서는 넘어가기 (기록은 그대로 남아 다음 접속 때 다시 물어봄) */
  skip: () => void
  /** 건너뛴 것을 다시 물어보기 (홈의 카드) */
  reopen: () => void
}

/**
 * 마저 내지 못한 지난 공부(학원 문제 수 · 숙제 사진/문제 수)를 다음 접속 때 하나씩 물어본다.
 * - '건너뛰기'는 이번 접속에서만 넘긴다(기록은 그대로 남아 다음 접속 때 다시 물어봄).
 */
export function usePendingProblems(studentId: string | null | undefined): PendingProblems {
  const [list, setList] = useState<PendingItem[]>([])
  /** 이번 접속에서 건너뛴 것 — 다시 묻지 않는다(홈 카드로는 다시 열 수 있다) */
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!studentId) {
      setList([])
      return
    }
    const [sessions, submissions] = await Promise.all([
      api.listPendingProblemSessions(studentId),
      homeworkApi.listPendingHomeworkSubmissions(studentId),
    ])
    // DB 마이그레이션 전에는 함수가 없어 오류가 난다 — 앱은 그대로 두고 조용히 넘어간다
    if (!sessions.ok) console.warn('[sunogong] 문제 수 입력 대기 조회 실패:', sessions.error)
    if (!submissions.ok) console.warn('[sunogong] 숙제 제출 대기 조회 실패:', submissions.error)
    setList(
      mergePendingItems(
        sessions.ok ? sessions.data : [],
        submissions.ok ? submissions.data : [],
      ),
    )
  }, [studentId])

  useEffect(() => {
    setList([])
    setHidden(new Set())
    setError(null)
    void reload()
  }, [reload])

  const current = list.find((item) => !hidden.has(item.id)) ?? null

  const submit = useCallback(
    async (problems: number, photoPaths: string[] = []): Promise<boolean> => {
      const target = current
      if (!target || !studentId) return false
      setBusy(true)
      setError(null)

      if (target.type === 'academy') {
        const res = await api.setSessionProblems(target.session.id, problems)
        setBusy(false)
        if (!res.ok) {
          setError(res.error)
          return false
        }
        setList((prev) => prev.filter((item) => item.id !== target.id))
        return true
      }

      /* 숙제 — 사진은 고를 때 이미 올라가 있다. 경로와 문제 수를 함께 채운다 */
      const submission = target.submission
      const res = await homeworkApi.submitPendingHomework(submission.id, problems, photoPaths.slice(0, 5))
      setBusy(false)
      if (!res.ok) {
        setError(res.error)
        return false
      }
      setList((prev) => prev.filter((item) => item.id !== target.id))
      return true
    },
    [current, studentId],
  )

  const skip = useCallback(() => {
    const target = current
    if (!target) return
    setHidden((prev) => new Set(prev).add(target.id))
  }, [current])

  const reopen = useCallback(() => setHidden(new Set()), [])

  return {
    current,
    count: list.length,
    hasHomework: list.some((item) => item.type === 'homework'),
    busy,
    error,
    reload,
    submit,
    skip,
    reopen,
  }
}
