import { useEffect, useState } from 'react'
import { BrandFooter, Mascot } from '../components/Brand'
import { KIND_EMOJI, KIND_LABEL, normalizeKind } from '../lib/kinds'
import { splitLog } from '../lib/stats'
import { hasTodayAcademy } from '../lib/problemsEdit'
import { formatMinutes } from '../lib/time'
import type { FinishResult, Student, StudyLog } from '../lib/types'
import { EditAcademyProblemsModal } from './EditAcademyProblemsModal'
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
  const [log, setLog] = useState<StudyLog | null>(result.log ?? null)
  const [editOpen, setEditOpen] = useState(false)
  const [savedProblems, setSavedProblems] = useState<number | null>(null)

  useEffect(() => {
    setLog(result.log ?? null)
    setSavedProblems(null)
    setEditOpen(false)
  }, [result])

  const sessionMinutes = Math.max(0, Math.round(result.seconds / 60))
  const kind = normalizeKind(result.kind)
  const pending = Boolean(result.pending_approval)
  /* 1분도 공부하지 않았고 문제 수도 0 — 기록에 남기지 않았다 */
  const nothing = Boolean(result.nothing)
  const todaySplit = splitLog(log)
  const hasSplit = todaySplit.academyMinutes + todaySplit.homeworkMinutes > 0
  /* 오늘 학원 공부 기록이 있으면 결과 화면에서도 문제 수를 바로 고칠 수 있다 */
  const canEditProblems =
    kind === 'academy' && !pending && !nothing && !result.discarded && hasTodayAcademy(todaySplit)
  /* 학원 공부는 훈출(등·하원)이 시작한다 — 2026-11-26 부터 여기서 학원 공부를 다시 시작하지 않는다 */
  const canAgain = kind !== 'academy'
  const totalProblems = log?.problems ?? result.total_problems

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
            <span className="font-bold tabular">{totalProblems}개</span>
          </div>
        </div>

        {/* 학원 공부 — 오늘 문제 수를 잘못 넣었으면 여기서 바로 고친다 (숙제는 승인 대상) */}
        {canEditProblems ? (
          <div className="mt-3 w-full max-w-xs">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-white/15 px-4 py-2.5 text-[13px] font-bold text-white transition active:scale-[0.99]"
            >
              ✏️ 문제 수 수정
            </button>
            {savedProblems !== null ? (
              <p className="mt-1.5 text-center text-[11px] font-semibold text-white/60">
                오늘 학원 문제 수를 {savedProblems}개로 바꿨어요
              </p>
            ) : null}
          </div>
        ) : null}

        {pending ? (
          <div className="mt-3 w-full max-w-xs rounded-3xl bg-[#E0453E]/45 px-4 py-3 text-left">
            <p className="text-[12.5px] font-extrabold text-white">
              {reason === 'admin' ? '🙌 선생님이 마무리했어요 — 확인을 기다려요' : '🙌 제출했어요 — 선생님 확인을 기다려요'}
            </p>
            <p className="mt-1 text-[11.5px] font-semibold leading-snug text-white/75">
              {reason === 'admin'
                ? '선생님이 숙제 공부를 마무리했어요. 낸 시간·문제 수는 선생님이 확인해 승인하면 오늘 기록에 들어가요.'
                : '공부한 페이지 사진과 문제 수를 냈어요. 선생님이 시간·문항수를 확인해 승인하면 오늘 기록에 들어가요.'}
            </p>
          </div>
        ) : null}

        {nothing ? (
          <div className="mt-3 w-full max-w-xs rounded-3xl bg-white/10 px-4 py-3 text-left">
            <p className="text-[12.5px] font-extrabold text-white">기록에는 남기지 않았어요</p>
            <p className="mt-1 text-[11.5px] font-semibold leading-snug text-white/75">
              1분이 안 됐고 푼 문제 수도 없어서 오늘 기록에 들어가지 않았어요. 다음에는 1분 넘게 공부해 보세요!
            </p>
          </div>
        ) : null}

        {reason === 'limit' ? (
          <p className="mt-3 text-[12px] text-white/60">최대 공부시간(5시간)을 채워 자동으로 마무리했어요.</p>
        ) : null}

        {reason === 'admin' && !pending ? (
          <p className="mt-3 text-center text-[12px] leading-snug text-white/60">
            선생님이 수업을 마무리해서 타이머를 멈췄어요.
          </p>
        ) : null}
      </div>

      <div className="px-5 pb-1">
        <div className="flex gap-2.5">
          <button type="button" onClick={onHome} className="h-[52px] flex-1 rounded-2xl bg-white/15 font-bold text-white">
            홈으로
          </button>
          {canAgain ? (
            <button
              type="button"
              onClick={onAgain}
              disabled={busy}
              className="h-[52px] flex-1 rounded-2xl bg-white font-bold text-navy disabled:opacity-60"
            >
              공부 더 하기
            </button>
          ) : null}
        </div>
      </div>

      <div className="bg-white">
        <BrandFooter />
      </div>

      <EditAcademyProblemsModal
        open={editOpen}
        studentId={student.id}
        current={todaySplit.academyProblems}
        onClose={() => setEditOpen(false)}
        onSaved={(next) => {
          setEditOpen(false)
          setLog(next ?? log)
          setSavedProblems(next?.academy_problems ?? todaySplit.academyProblems)
        }}
      />
    </div>
  )
}
