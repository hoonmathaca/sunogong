import { BrandFooter, Mascot } from '../components/Brand'
import { formatMinutes } from '../lib/time'
import type { FinishResult, Student } from '../lib/types'
import type { FinishReason } from './useStudyTimer'

interface ResultScreenProps {
  student: Student
  result: FinishResult
  reason: FinishReason
  onHome: () => void
  onAgain: () => void
  busy?: boolean
}

/** 공부 종료 결과 */
export function ResultScreen({ student, result, reason, onHome, onAgain, busy = false }: ResultScreenProps): JSX.Element {
  const sessionMinutes = Math.max(0, Math.round(result.seconds / 60))

  return (
    <div className="screen bg-gradient-to-b from-navy to-blue-brand text-white">
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <Mascot variant="full" className="h-[clamp(96px,20dvh,150px)] w-auto drop-shadow-lg" />

        <p className="mt-4 text-[13px] font-bold tracking-wide text-white/60">{student.name} · 수고했어요!</p>

        <h1 className="mt-2 text-[26px] font-extrabold leading-snug">
          오늘 <span className="text-white">{formatMinutes(sessionMinutes)}</span> 공부했어요
        </h1>

        <div className="mt-5 w-full max-w-xs rounded-3xl bg-white/10 px-5 py-4 backdrop-blur-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">오늘 합계</span>
            <span className="font-bold tabular">{formatMinutes(result.total_minutes)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-white/60">푼 문제</span>
            <span className="font-bold tabular">{result.problems}개</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-white/60">오늘 문제 합계</span>
            <span className="font-bold tabular">{result.total_problems}개</span>
          </div>
        </div>

        {reason === 'midnight' ? (
          <p className="mt-3 text-[12px] text-white/60">자정이 지나 자동으로 마무리했어요.</p>
        ) : null}
        {reason === 'limit' ? (
          <p className="mt-3 text-[12px] text-white/60">최대 공부시간(5시간)을 채워 자동으로 마무리했어요.</p>
        ) : null}
      </div>

      <div className="px-5 pb-1">
        <div className="flex gap-2.5">
          <button type="button" onClick={onHome} className="h-[52px] flex-1 rounded-2xl bg-white/15 font-bold text-white">
            홈으로
          </button>
          <button
            type="button"
            onClick={onAgain}
            disabled={busy}
            className="h-[52px] flex-1 rounded-2xl bg-white font-bold text-navy disabled:opacity-60"
          >
            공부 더 하기
          </button>
        </div>
      </div>

      <div className="bg-white">
        <BrandFooter />
      </div>
    </div>
  )
}
