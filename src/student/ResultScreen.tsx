import { BrandFooter, Mascot } from '../components/Brand'
import { KIND_EMOJI, KIND_LABEL, normalizeKind } from '../lib/kinds'
import { splitLog } from '../lib/stats'
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
  const kind = normalizeKind(result.kind)
  const pending = Boolean(result.pending_approval)
  const todaySplit = splitLog(result.log)
  const hasSplit = todaySplit.academyMinutes + todaySplit.homeworkMinutes > 0

  return (
    <div className="screen bg-gradient-to-b from-navy to-blue-brand text-white">
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="flex h-[clamp(96px,20dvh,150px)] w-[clamp(96px,20dvh,150px)] items-center justify-center rounded-full bg-white p-3 shadow-lg">
          <Mascot variant="full" className="h-full w-full" />
        </div>

        <p className="mt-4 text-[13px] font-bold tracking-wide text-white/60">{student.name} · 수고했어요!</p>

        <h1 className="mt-2 text-[26px] font-extrabold leading-snug">
          {KIND_EMOJI[kind]} {KIND_LABEL[kind]} <span className="text-white">{formatMinutes(sessionMinutes)}</span> 했어요
        </h1>

        <div className="mt-5 w-full max-w-xs rounded-3xl bg-white/10 px-5 py-4 backdrop-blur-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">{pending ? '오늘 기록(승인된 것)' : '오늘 합계'}</span>
            <span className="font-bold tabular">{formatMinutes(result.total_minutes)}</span>
          </div>
          {hasSplit ? (
            <>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-white/60">{KIND_EMOJI.academy} 오늘 학원 공부</span>
                <span className="font-bold tabular">{formatMinutes(todaySplit.academyMinutes)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-white/60">{KIND_EMOJI.homework} 오늘 숙제 공부</span>
                <span className="font-bold tabular">{formatMinutes(todaySplit.homeworkMinutes)}</span>
              </div>
            </>
          ) : null}
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-white/60">푼 문제</span>
            <span className="font-bold tabular">{result.problems}개</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-white/60">오늘 문제 합계</span>
            <span className="font-bold tabular">{result.total_problems}개</span>
          </div>
        </div>

        {pending ? (
          <div className="mt-3 w-full max-w-xs rounded-3xl bg-[#6D3BD6]/40 px-4 py-3 text-left">
            <p className="text-[12.5px] font-extrabold text-white">🙌 제출했어요 — 선생님 확인을 기다려요</p>
            <p className="mt-1 text-[11.5px] font-semibold leading-snug text-white/75">
              공부한 페이지 사진과 문제 수를 냈어요. 선생님이 시간·문항수를 확인해 승인하면 오늘 기록에 들어가요.
            </p>
          </div>
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
