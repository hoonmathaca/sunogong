import { useEffect, useRef, useState } from 'react'
import { BrandFooter, Mascot } from '../components/Brand'
import { Keypad, Spinner } from '../components/Keypad'
import { Modal } from '../components/Modal'
import { formatHMS, formatMinutes, MAX_SESSION_SECONDS } from '../lib/time'
import type { FinishResult, Student, StudySession } from '../lib/types'
import { useStudyTimer, type DiscardReason, type FinishReason } from './useStudyTimer'

interface TimerScreenProps {
  student: Student
  initialSession?: StudySession | null
  onFinished: (result: FinishResult, reason: FinishReason) => void
  onDiscarded: (reason: DiscardReason) => void
  onExit: () => void
}

/** 공부 타이머 화면 */
export function TimerScreen({ student, initialSession = null, onFinished, onDiscarded, onExit }: TimerScreenProps): JSX.Element {
  const timer = useStudyTimer({ studentId: student.id, initialSession, onFinished, onDiscarded })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [problemOpen, setProblemOpen] = useState(false)
  const [problems, setProblems] = useState('')
  const [pendingReason, setPendingReason] = useState<FinishReason>('manual')
  const limitModalShown = useRef(false)

  const { session, status, elapsedSeconds, busy, error, notice, limitReached, wakeLockOk } = timer

  /* 5시간이 되면 자동으로 종료 안내 (문제 수는 그대로 입력) */
  useEffect(() => {
    if (!limitReached || limitModalShown.current) return
    limitModalShown.current = true
    setPendingReason('limit')
    setProblems('')
    setProblemOpen(true)
  }, [limitReached])

  const openFinishFlow = () => {
    if (busy) return
    setConfirmOpen(true)
  }

  const openProblemInput = () => {
    setConfirmOpen(false)
    setPendingReason('manual')
    setProblems('')
    setProblemOpen(true)
  }

  const saveAndFinish = async () => {
    const count = problems === '' ? 0 : Number(problems)
    const result = await timer.finish(Number.isFinite(count) ? count : 0, pendingReason)
    if (result) setProblemOpen(false)
  }

  const pushDigit = (digit: string) => setProblems((prev) => (prev.length >= 4 ? prev : `${prev}${digit}`))
  const popDigit = () => setProblems((prev) => prev.slice(0, -1))

  if (status === 'loading') {
    return (
      <div className="screen items-center justify-center bg-white">
        <Spinner className="h-8 w-8 border-navy/20 border-t-navy" />
      </div>
    )
  }

  if (status === 'idle') {
    return (
      <div className="screen bg-white px-5 pt-10">
        <p className="text-center text-navy/60">진행 중인 공부가 없어요.</p>
        {error ? <p className="mt-3 text-center text-sm text-red-500">{error}</p> : null}
        <div className="mt-6 flex flex-col gap-2">
          <button type="button" className="btn-navy" onClick={() => void timer.start()}>
            공부 시작
          </button>
          <button type="button" className="btn-outline" onClick={onExit}>
            홈으로
          </button>
        </div>
        <BrandFooter />
      </div>
    )
  }

  const isPaused = session?.status === 'paused'
  const remainingSeconds = Math.max(0, MAX_SESSION_SECONDS - elapsedSeconds)

  return (
    <div className="screen bg-gradient-to-b from-blue-soft/60 to-white">
      <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-[12px] font-bold text-navy shadow-sm">
            {student.name} · {student.grade}
          </span>
        </div>
        <span className="text-[11px] font-semibold text-navy/40">10초마다 자동 저장</span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-5">
        <Mascot variant="full" className="h-[clamp(64px,13dvh,110px)] w-auto opacity-95" />

        <div className="mt-2 text-center">
          <p className="text-[12px] font-bold tracking-wide text-navy/40">
            {isPaused ? '일시정지 중이에요' : '공부하는 중'}
          </p>
          <p className="mt-1 text-[clamp(46px,15vw,76px)] font-extrabold leading-none tracking-tight text-navy tabular">
            {formatHMS(elapsedSeconds)}
          </p>
          <p className="mt-2 text-[12px] font-semibold text-navy/45">
            최대 5시간 · 남은 시간 {formatHMS(remainingSeconds)}
          </p>
        </div>

        {isPaused ? (
          <div className="mt-3 rounded-2xl bg-white px-4 py-2 text-center text-[13px] font-semibold text-navy/70 shadow-sm">
            {notice ?? '일시정지 중이에요'} · 계속하려면 아래 버튼을 눌러주세요
          </div>
        ) : null}

        {!wakeLockOk ? (
          <div className="mt-3 rounded-2xl border border-blue-line bg-white px-4 py-2 text-center text-[12px] text-navy/60">
            화면을 켜둔 채로 공부해주세요
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 max-w-full break-words rounded-2xl bg-red-50 px-3 py-2 text-center text-[12px] text-red-500">
            {error}
          </div>
        ) : null}
      </div>

      <div className="px-5 pb-2">
        <div className="flex gap-2.5">
          {isPaused ? (
            <button type="button" onClick={() => void timer.resume()} disabled={busy} className="btn-navy h-[54px] flex-1 text-lg">
              {busy ? <Spinner className="h-5 w-5 border-white/40 border-t-white" /> : '계속'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void timer.pause(false, '일시정지했어요')}
              disabled={busy}
              className="btn-outline h-[54px] flex-1 text-lg"
            >
              일시정지
            </button>
          )}
          <button type="button" onClick={openFinishFlow} disabled={busy} className="btn-navy h-[54px] flex-1 text-lg">
            종료
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-navy/35">
          화면을 꺼도 시간은 계속 가요 · 앱을 닫으면 그 시점까지만 인정돼요
        </p>
      </div>

      <BrandFooter className="pt-1" />

      {/* 종료 확인 */}
      <Modal
        open={confirmOpen}
        title="공부를 마칠까요?"
        description={
          <span>
            지금까지 <strong className="text-navy">{formatMinutes(Math.floor(elapsedSeconds / 60))}</strong> 공부했어요.
          </span>
        }
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setConfirmOpen(false)}>
              더 공부할래요
            </button>
            <button type="button" className="btn-navy" onClick={openProblemInput}>
              마칠래요
            </button>
          </>
        }
      />

      {/* 푼 문제 수 입력 */}
      <Modal
        open={problemOpen}
        title="오늘 푼 문제 수"
        description={
          pendingReason === 'limit'
            ? '5시간이 지나 자동으로 마무리해요. 푼 문제 수를 알려주세요.'
            : '숫자 키패드로 입력하고 저장을 눌러주세요. (0도 괜찮아요)'
        }
        onClose={() => {
          if (pendingReason === 'limit') return
          setProblemOpen(false)
        }}
        footer={
          pendingReason === 'manual' ? (
            <button type="button" className="btn-outline" onClick={() => setProblemOpen(false)} disabled={busy}>
              취소
            </button>
          ) : undefined
        }
      >
        <div className="flex items-center justify-center rounded-2xl bg-blue-soft py-4">
          <span className="text-[40px] font-extrabold leading-none text-navy tabular">
            {problems === '' ? '0' : problems}
          </span>
          <span className="ml-2 text-sm font-semibold text-navy/50">문제</span>
        </div>

        {pendingReason === 'limit' ? (
          <p className="mt-2 text-center text-[12px] font-semibold text-navy/45">
            최대 공부시간 5시간을 채워서 자동 종료돼요.
          </p>
        ) : null}

        <div className="mt-4">
          <Keypad
            onDigit={pushDigit}
            onBackspace={popDigit}
            onConfirm={() => void saveAndFinish()}
            confirmLabel="저장"
            busy={busy}
          />
        </div>
      </Modal>
    </div>
  )
}
