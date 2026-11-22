import { useCallback, useEffect, useState } from 'react'
import * as api from '../lib/api'
import { pendingProblemQueue } from '../lib/pauseWatch'
import type { StudySession } from '../lib/types'

export interface PendingProblems {
  /** 지금 물어볼 세션 (가장 오래된 것부터, 이번에 건너뛴 것은 빼고) */
  current: StudySession | null
  /** 아직 문제 수를 넣지 않은 세션 수 (서버 기준) */
  count: number
  busy: boolean
  error: string | null
  reload: () => Promise<void>
  submit: (problems: number) => Promise<boolean>
  /** 이번 접속에서는 넘어가기 (기록은 그대로 남아 다음 접속 때 다시 물어봄) */
  skip: () => void
  /** 건너뛴 세션을 다시 물어보기 (홈의 '지난번 푼 문제 수' 카드) */
  reopen: () => void
}

/**
 * 자동 종료된(문제 수 미입력) 세션을 다음 접속 때 물어보기 위한 목록.
 * - 서버(pending_problem_sessions)에서 최근 30일 것을 받아 오래된 것부터 하나씩 물어본다.
 * - '건너뛰기'는 이번 접속에서만 넘긴다(기록은 그대로 남아 다음 접속 때 다시 물어봄).
 */
export function usePendingProblems(studentId: string | null | undefined): PendingProblems {
  const [list, setList] = useState<StudySession[]>([])
  /** 이번 접속에서 건너뛴 세션 — 다시 묻지 않는다(홈 카드로는 다시 열 수 있다) */
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!studentId) {
      setList([])
      return
    }
    const res = await api.listPendingProblemSessions(studentId)
    if (!res.ok) {
      // DB 마이그레이션 전에는 함수가 없어 오류가 난다 — 앱은 그대로 두고 조용히 넘어간다
      console.warn('[sunogong] 문제 수 입력 대기 조회 실패:', res.error)
      return
    }
    setList(pendingProblemQueue(res.data))
  }, [studentId])

  useEffect(() => {
    setList([])
    setHidden(new Set())
    setError(null)
    void reload()
  }, [reload])

  const current = list.find((session) => !hidden.has(session.id)) ?? null

  const submit = useCallback(
    async (problems: number): Promise<boolean> => {
      const target = current
      if (!target) return false
      setBusy(true)
      setError(null)
      const res = await api.setSessionProblems(target.id, problems)
      setBusy(false)
      if (!res.ok) {
        setError(res.error)
        return false
      }
      setList((prev) => prev.filter((session) => session.id !== target.id))
      return true
    },
    [current],
  )

  const skip = useCallback(() => {
    const target = current
    if (!target) return
    setHidden((prev) => new Set(prev).add(target.id))
  }, [current])

  const reopen = useCallback(() => setHidden(new Set()), [])

  return { current, count: list.length, busy, error, reload, submit, skip, reopen }
}
