import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../lib/api'
import { pendingProblemQueue } from '../lib/pauseWatch'
import type { StudySession } from '../lib/types'

export interface PendingProblems {
  /** 지금 물어볼 세션 (가장 오래된 것부터) */
  current: StudySession | null
  count: number
  busy: boolean
  error: string | null
  reload: () => Promise<void>
  submit: (problems: number) => Promise<boolean>
  skip: () => void
}

/**
 * 자동 종료된(문제 수 미입력) 세션을 다음 접속 때 물어보기 위한 목록.
 * - 서버(pending_problem_sessions)에서 최근 30일 것을 받아 오래된 것부터 하나씩 물어본다.
 * - '건너뛰기'는 이번 접속에서만 넘긴다(기록은 그대로 남아 다음 접속 때 다시 물어봄).
 */
export function usePendingProblems(studentId: string | null | undefined): PendingProblems {
  const [list, setList] = useState<StudySession[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 이번 접속에서 건너뛴 세션 — 같은 접속에서 다시 묻지 않는다 */
  const skippedRef = useRef<Set<string>>(new Set())

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
    setList(pendingProblemQueue(res.data).filter((session) => !skippedRef.current.has(session.id)))
  }, [studentId])

  useEffect(() => {
    skippedRef.current = new Set()
    setList([])
    setError(null)
    void reload()
  }, [reload])

  const current = list[0] ?? null

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
    skippedRef.current.add(target.id)
    setList((prev) => prev.filter((session) => session.id !== target.id))
  }, [current])

  return { current, count: list.length, busy, error, reload, submit, skip }
}
