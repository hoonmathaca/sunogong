import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../lib/api'
import * as questionsApi from '../lib/questions'
import { normalizeKind, type SessionKind } from '../lib/kinds'
import { autoEndNotice } from '../lib/pauseWatch'
import { isAcademySessionActive } from '../lib/session'
import type { AutoEndResult, FinishResult, Student, StudyQuestion, StudySession } from '../lib/types'
import { ChooseStudentScreen } from './ChooseStudentScreen'
import { CodeEntryScreen } from './CodeEntryScreen'
import { PendingProblemsModal } from './PendingProblemsModal'
import { QuestionBoardScreen } from './QuestionBoardScreen'
import { ResultScreen } from './ResultScreen'
import { StudentHomeScreen } from './StudentHomeScreen'
import { TimerScreen } from './TimerScreen'
import { usePendingProblems } from './usePendingProblems'
import type { DiscardReason, FinishReason } from './useStudyTimer'

type Phase = 'code' | 'choose' | 'home' | 'timer' | 'result' | 'questions'

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
  /* 방금 한 공부 종류 — 결과 화면의 "공부 더 하기" 가 같은 종류로 이어진다 */
  const [lastKind, setLastKind] = useState<SessionKind>('academy')
  /* 학원 등원 중(훈출이 연 학원 세션) — 이때는 홈의 「숙제 공부 시작」을 잠근다 (2026-11-28) */
  const [academyActive, setAcademyActive] = useState(false)
  /* 새로 온 선오공이 답변 (홈 배지·맨 위 알림 배너) */
  const [unreadAnswerList, setUnreadAnswerList] = useState<StudyQuestion[]>([])
  const [unreadAnswers, setUnreadAnswers] = useState(0)
  /* 홈 알림 배너에서 '답변 보기'를 누른 질문 — 질문 화면에서 그 답변을 펼쳐 보여 준다 */
  const [focusQuestionId, setFocusQuestionId] = useState<string | null>(null)
  /* 지난 공부를 마저 내면 홈의 숙제 제출 목록을 다시 읽게 하는 값 */
  const [homeRefresh, setHomeRefresh] = useState(0)
  /* 자동 종료된 지난 공부의 문제 수 입력 (다음 접속 때) */
  const pendingProblems = usePendingProblems(student?.id ?? null)

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

  /* 아직 열지 않은 답변을 읽어 둔다 (질문 기능이 아직 없어도 홈은 그대로) */
  const loadUnreadAnswers = useCallback(async (studentId: string) => {
    const res = await questionsApi.listUnreadAnswers(studentId)
    if (!res.ok) return
    const list = res.data ?? []
    setUnreadAnswerList(list)
    setUnreadAnswers(list.length)
  }, [])

  const enterWithStudent = useCallback(async (target: Student) => {
    setBusy(true)
    setStartError(null)
    try {
      saveStudent(target)
      setStudent(target)
      void loadUnreadAnswers(target.id)
      const active = await api.getActiveSession(target.id)
      if (active.ok && active.data.discarded) setFlash(discardMessage('stale'))
      const found = active.ok ? active.data.session : null
      if (found && found.status !== 'finished') {
        setAcademyActive(isAcademySessionActive(found))
        setInitialSession(found)
        setPhase('timer')
      } else {
        setAcademyActive(false)
        setInitialSession(null)
        setPhase('home')
      }
      if (!active.ok) setStartError(active.error)
    } finally {
      setBusy(false)
    }
  }, [loadUnreadAnswers])

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
        // DB 마이그레이션 전에는 세션에 종류가 없으므로, 방금 고른 종류를 붙여 넘긴다
        setInitialSession({ ...res.data, kind: res.data.kind ?? kind })
        setLastKind(normalizeKind(res.data.kind ?? kind))
        setAcademyActive(isAcademySessionActive(res.data))
        setPhase('timer')
      } else {
        // 학원 등원 중 숙제 시작 거부 → 홈의 안내(버튼 잠금)도 바로 켠다
        if (res.code === 'academy_session_active') setAcademyActive(true)
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
    setLastKind(normalizeKind(data.kind))
    setResult({ data, reason })
    setPhase('result')
  }, [])

  /* 쉬는 시간이 60분을 넘어 자동 종료 → 홈으로 나가 문제 수를 바로 입력받는다 */
  const reloadPendingRef = useRef(pendingProblems.reload)
  reloadPendingRef.current = pendingProblems.reload
  const handleAutoEnded = useCallback((data: AutoEndResult) => {
    setInitialSession(null)
    setResult(null)
    setFlash(autoEndNotice(data.minutes))
    setPhase('home')
    void reloadPendingRef.current()
  }, [])

  /* 홈으로 돌아올 때마다 새 답변 배지·알림 배너를 새로 읽는다 */
  useEffect(() => {
    if (!student || (phase !== 'home' && phase !== 'result')) return
    void loadUnreadAnswers(student.id)
  }, [phase, student?.id, loadUnreadAnswers])

  /* 홈 알림 배너 — '답변 보기'는 그 질문을 펼쳐 열고, '확인했어요'는 알림만 닫는다(읽음으로 남김) */
  const openAnswer = useCallback((questionId: string) => {
    setFocusQuestionId(questionId)
    setPhase('questions')
  }, [])

  const confirmAnswers = useCallback(() => {
    const ids = unreadAnswerList.map((question) => question.id)
    setUnreadAnswerList([])
    setUnreadAnswers(0)
    if (ids.length === 0) return
    void questionsApi.markAnswersRead(ids).then((res) => {
      if (!res.ok) console.warn('[sunogong] 답변 읽음 표시 실패:', res.error)
    })
  }, [unreadAnswerList])

  /* 질문 화면이 답변을 모두 열었을 때 — 배지·배너를 비운다 (함수가 매번 새로 생기면
   * 질문 화면의 목록 읽기가 끝없이 다시 도는 일이 있어 useCallback 으로 고정한다) */
  const handleUnreadChange = useCallback((count: number) => {
    setUnreadAnswers(count)
    if (count === 0) setUnreadAnswerList([])
  }, [])

  /* 홈에 머무는 동안에도 학원 등원 여부를 확인한다 —
   * 앱을 홈에 띄워 둔 사이 훈출이 등원시키면, 예전에는 그대로 「숙제 공부」가 눌려
   * 학원 타이머가 켜졌다. 30초마다·화면이 다시 보일 때 진행 중 세션을 읽는다. */
  useEffect(() => {
    if (!student || phase !== 'home') return
    let alive = true
    const tick = async () => {
      const res = await api.getActiveSession(student.id)
      if (!alive || !res.ok) return
      setAcademyActive(isAcademySessionActive(res.data.session))
    }
    void tick()
    const timer = window.setInterval(() => void tick(), 30_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [student?.id, phase])

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
        <StudentHomeScreen
          student={student}
          onStart={(kind) => void startStudy(kind)}
          onExit={exitToCode}
          onQuestions={() => {
            setFocusQuestionId(null)
            setPhase('questions')
          }}
          unreadAnswers={unreadAnswers}
          unreadAnswer={unreadAnswerList[0] ?? null}
          onOpenAnswer={openAnswer}
          onConfirmAnswer={confirmAnswers}
          pendingProblems={pendingProblems.count}
          pendingHomework={pendingProblems.hasHomework}
          onPendingProblems={pendingProblems.reopen}
          refreshKey={homeRefresh}
          academyActive={academyActive}
          busy={busy}
        />
      ) : null}

      {phase === 'questions' && student ? (
        <QuestionBoardScreen
          student={student}
          focusId={focusQuestionId}
          onBack={() => {
            setFocusQuestionId(null)
            setPhase('home')
          }}
          onUnreadChange={handleUnreadChange}
        />
      ) : null}

      {phase === 'timer' && student ? (
        <TimerScreen
          student={student}
          initialSession={initialSession}
          onFinished={handleFinished}
          onAutoEnded={handleAutoEnded}
          onDiscarded={(reason: DiscardReason) => {
            setInitialSession(null)
            setResult(null)
            setFlash(discardMessage(reason))
            setPhase('home')
          }}
          onExit={() => setPhase('home')}
        />
      ) : null}

      {/* 자동 종료된 지난 공부의 문제 수·숙제 사진 — 홈에 들어오면 한 번 물어본다 */}
      {phase === 'home' && student && pendingProblems.current ? (
        <PendingProblemsModal
          key={pendingProblems.current.id}
          studentId={student.id}
          item={pendingProblems.current}
          busy={pendingProblems.busy}
          error={pendingProblems.error}
          onSubmit={(problems, photoPaths) => {
            void pendingProblems.submit(problems, photoPaths).then((ok) => {
              if (ok) setHomeRefresh((value) => value + 1)
            })
          }}
          onSkip={pendingProblems.skip}
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
          onAgain={() => void startStudy(normalizeKind(result.data.kind ?? lastKind))}
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
