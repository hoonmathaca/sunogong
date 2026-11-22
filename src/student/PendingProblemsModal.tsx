import { useState } from 'react'
import { Keypad } from '../components/Keypad'
import { Modal } from '../components/Modal'
import { problemsFromInput, pendingProblemSummary } from '../lib/pauseWatch'
import type { StudySession } from '../lib/types'

interface PendingProblemsModalProps {
  session: StudySession
  busy?: boolean
  error?: string | null
  onSubmit: (problems: number) => void
  onSkip: () => void
}

/**
 * 자동 종료된 지난 공부의 문제 수 입력.
 * (쉬는 시간이 60분을 넘어 자동으로 마무리된 세션 — 다음 접속 때 한 번 물어본다)
 */
export function PendingProblemsModal({
  session,
  busy = false,
  error = null,
  onSubmit,
  onSkip,
}: PendingProblemsModalProps): JSX.Element {
  const [problems, setProblems] = useState('')

  const pushDigit = (digit: string) => setProblems((prev) => (prev.length >= 4 ? prev : `${prev}${digit}`))
  const popDigit = () => setProblems((prev) => prev.slice(0, -1))

  return (
    <Modal
      open
      title="지난번 푼 문제 수"
      description="자동으로 마무리된 공부예요. 푼 문제 수를 알려주면 통계와 랭킹에 바로 들어가요."
      onClose={onSkip}
      footer={
        <button type="button" className="btn-outline" onClick={onSkip} disabled={busy}>
          건너뛰기
        </button>
      }
    >
      <div className="rounded-2xl bg-blue-soft px-4 py-3 text-center text-[13px] font-semibold leading-snug text-navy/70">
        {pendingProblemSummary(session)}
      </div>

      <div className="mt-3 flex items-center justify-center rounded-2xl bg-white py-4 shadow-soft">
        <span className="text-[40px] font-extrabold leading-none text-navy tabular">
          {problems === '' ? '0' : problems}
        </span>
        <span className="ml-2 text-sm font-semibold text-navy/50">문제</span>
      </div>

      <p className="mt-2 text-center text-[12px] font-semibold text-navy/45">
        세 문제가 안 됐으면 0을 누르고 저장해도 돼요.
      </p>

      {error ? (
        <p className="mt-2 break-words rounded-2xl bg-red-50 px-3 py-2 text-center text-[12px] text-red-500">{error}</p>
      ) : null}

      <div className="mt-4">
        <Keypad
          onDigit={pushDigit}
          onBackspace={popDigit}
          onConfirm={() => onSubmit(problemsFromInput(problems))}
          confirmLabel="저장"
          busy={busy}
        />
      </div>
    </Modal>
  )
}
