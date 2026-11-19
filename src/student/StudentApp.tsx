import { useCallback, useEffect, useState } from 'react'
import * as api from '../lib/api'
import type { SessionKind } from '../lib/kinds'
import type { FinishResult, Student, StudySession } from '../lib/types'
import { ChooseStudentScreen } from './ChooseStudentScreen'
import { CodeEntryScreen } from './CodeEntryScreen'
import { ResultScreen } from './ResultScreen'
import { StudentHomeScreen } from './StudentHomeScreen'
import { TimerScreen } from './TimerScreen'
import type { DiscardReason, FinishReason } from './useStudyTimer'

type Phase = 'code' | 'choose' | 'home' | 'timer' | 'result'

const STORAGE_KEY = 'sunogong.current-student'

interface SavedStudent {
  id: string
  name: string
  code: string
  grade: string
}

function saveStudent(student: Student): void {
  try {
    const payload: SavedStudent = { id: student.id, name: student.name, code: student.code, grade: student.grade }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* 저장 실패해도 앱은 계속 */
  }
}

function readStudent(): SavedStudent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedStudent
    if (!parsed || typeof parsed.id !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

function clearStudent(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 무시 */
  }
}

export interface StudentAppProps {
  onAdmin: () => void
}

/** 학생용 화면 묶음: 코드 입력 → (이름 선택) → 홈 → 타이머 → 결과 */
export function StudentApp({ onAdmin }: StudentAppProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>('code')
  const [student, setStudent] = useState<Student | null>(null)
  const [candidates, setCandidates] = useState<Student[]>([])
  const [enteredCode, setEnteredCode] = useState('')
  const [initialSession, setInitialSession] = useState<StudySession | null>(null)
  const [result, setResult] = useState<{ data: FinishResult; reason: FinishReason } | null>(null)
  const [busy, setBusy] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const discardMessage = (reason: DiscardReason) =>
    reason === 'stale'
      ? '자정 전에 끝내지 않은 공부라 기록하지 않았어요'
      : '자정이 지나서 오늘 공부는 기록하지 않았어요'

  /* 진행 중인 공부가 있으면 앱을 다시 열었을 때 타이머로 바로 복귀 */
  useEffect(() => {
    const saved = readStudent()
    if (!saved) return
    let alive = true
    void (async () => {
      try {
        const active = await api.getActiveSession(saved.id)
        if (!alive || !active.ok) return
        if (active.data.discarded) {
          setFlash(discardMessage('stale'))
          return
        }
        const found = active.data.session
        if (!found || found.status === 'finished') return
        setStudent({ ...saved, created_at: '' })
        setInitialSession(found)
        setPhase('timer')
      } catch (error) {
        console.warn('[sunogong] 진행 중인 공부 확인 실패:', error)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const enterWithStudent = useCallback(async (target: Student) => {
    setBusy(true)
    setStartError(null)
    try {
      saveStudent(target)
      setStudent(target)
      const active = await api.getActiveSession(target.id)
      if (active.ok && active.data.discarded) setFlash(discardMessage('stale'))
      const found = active.ok ? active.data.session : null
      if (found && found.status !== 'finished') {
        setInitialSession(found)
        setPhase('timer')
      } else {
        setInitialSession(null)
        setPhase('home')
      }
      if (!active.ok) setStartError(active.error)
    } finally {
      setBusy(false)
    }
  }, [])

  const handleCode = useCallback(
    async (code: string): Promise<{ ok: boolean; error?: string }> => {
      const res = await api.findStudentsByCode(code)
      if (!res.ok) return { ok: false, error: res.error }
      const found = res.data ?? []
      if (found.length === 0) return { ok: false, error: '코드를 확인해주세요' }
      if (found.length === 1) {
        await enterWithStudent(found[0])
        return { ok: true }
      }
      setCandidates(found)
      setEnteredCode(code)
      setPhase('choose')
      return { ok: true }
    },
    [enterWithStudent],
  )

  const startStudy = useCallback(async (kind: SessionKind = 'academy') => {
    if (!student) return
    setBusy(true)
    setStartError(null)
    try {
      const res = await api.startSession(student.id, kind)
      if (res.ok) {
        setInitialSession(res.data)
        setPhase('timer')
      } else {
        setStartError(res.error)
      }
    } finally {
      setBusy(false)
    }
  }, [student])

  const exitToCode = useCallback(() => {
    clearStudent()
    setStudent(null)
    setCandidates([])
    setInitialSession(null)
    setResult(null)
    setPhase('code')
  }, [])

  const handleFinished = useCallback((data: FinishResult, reason: FinishReason) => {
    setResult({ data, reason })
    setPhase('result')
  }, [])

  return (
    <div className="min-h-dvh bg-white">
      {phase === 'code' ? <CodeEntryScreen onSubmit={handleCode} onAdmin={onAdmin} /> : null}

      {phase === 'choose' ? (
        <ChooseStudentScreen
          code={enteredCode}
          candidates={candidates}
          busy={busy}
          onSelect={(chosen) => void enterWithStudent(chosen)}
          onBack={() => {
            setCandidates([])
            setPhase('code')
          }}
        />
      ) : null}

      {phase === 'home' && student ? (
        <StudentHomeScreen student={student} onStart={(kind) => void startStudy(kind)} onExit={exitToCode} busy={busy} />
      ) : null}

      {phase === 'timer' && student ? (
        <TimerScreen
          student={student}
          initialSession={initialSession}
          onFinished={handleFinished}
          onDiscarded={(reason: DiscardReason) => {
            setInitialSession(null)
            setResult(null)
            setFlash(discardMessage(reason))
            setPhase('home')
          }}
          onExit={() => setPhase('home')}
        />
      ) : null}

      {phase === 'result' && student && result ? (
        <ResultScreen
          student={student}
          result={result.data}
          reason={result.reason}
          busy={busy}
          onHome={() => {
            setInitialSession(null)
            setPhase('home')
          }}
          onAgain={() => void startStudy('academy')}
        />
      ) : null}

      {startError && phase !== 'code' ? (
        <div className="fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-sm items-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-[12px] font-semibold text-white shadow-lg">
          <span className="flex-1 break-words">{startError}</span>
          <button type="button" className="shrink-0 underline" onClick={() => setStartError(null)}>
            닫기
          </button>
        </div>
      ) : null}

      {flash ? (
        <div className="fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-sm items-center gap-2 rounded-2xl bg-navy px-4 py-3 text-[12px] font-semibold text-white shadow-lg">
          <span className="flex-1 break-words">{flash}</span>
          <button type="button" className="shrink-0 underline" onClick={() => setFlash(null)}>
            닫기
          </button>
        </div>
      ) : null}
    </div>
  )
}
