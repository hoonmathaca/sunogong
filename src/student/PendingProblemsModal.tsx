import { useState } from 'react'
import { Keypad } from '../components/Keypad'
import { Modal } from '../components/Modal'
import { HOMEWORK_SUBMIT_GUIDE, formatSubmissionTime, homeworkSubmitProblem, submissionLine } from '../lib/homeworkBoard'
import { problemsFromInput, pendingProblemSummary } from '../lib/pauseWatch'
import type { PendingItem } from './usePendingProblems'
import { HomeworkPhotoPicker } from './HomeworkPhotoPicker'

interface PendingProblemsModalProps {
  item: PendingItem
  busy?: boolean
  error?: string | null
  onSubmit: (problems: number, photos: File[]) => void
  onSkip: () => void
}

/**
 * 쉬는 시간이 60분을 넘어 자동으로 마무리된 지난 공부 — 다음 접속 때 한 번 물어본다.
 * · 학원 공부: 푼 문제 수만 넣는다.
 * · 숙제 공부: 공부한 페이지 사진과 문제 수를 함께 내서 선생님 확인(승인)을 받는다.
 */
export function PendingProblemsModal({
  item,
  busy = false,
  error = null,
  onSubmit,
  onSkip,
}: PendingProblemsModalProps): JSX.Element {
  const [problems, setProblems] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [photoWarn, setPhotoWarn] = useState(false)
  const isHomework = item.type === 'homework'
  const submission = item.type === 'homework' ? item.submission : null

  const pushDigit = (digit: string) => setProblems((prev) => (prev.length >= 4 ? prev : `${prev}${digit}`))
  const popDigit = () => setProblems((prev) => prev.slice(0, -1))

  const save = () => {
    const count = problemsFromInput(problems)
    if (isHomework) {
      const invalid = homeworkSubmitProblem(count, photos.length)
      if (invalid) {
        setPhotoWarn(true)
        return
      }
    }
    onSubmit(count, isHomework ? photos : [])
  }

  return (
    <Modal
      open
      title={isHomework ? '지난 숙제 공부 제출' : '지난번 푼 문제 수'}
      description={
        isHomework
          ? HOMEWORK_SUBMIT_GUIDE
          : '자동으로 마무리된 공부예요. 푼 문제 수를 알려주면 통계와 랭킹에 바로 들어가요.'
      }
      onClose={onSkip}
      footer={
        <button type="button" className="btn-outline" onClick={onSkip} disabled={busy}>
          건너뛰기
        </button>
      }
    >
      <div className="rounded-2xl bg-blue-soft px-4 py-3 text-center text-[13px] font-semibold leading-snug text-navy/70">
        {isHomework && submission ? (
          <>
            {submissionLine(submission)}
            <br />
            <span className="text-[11.5px] font-semibold text-navy/50">
              낸 뒤 선생님이 확인하면 오늘 기록에 들어가요 · {formatSubmissionTime(submission.ended_at ?? submission.submitted_at)} 마무리
            </span>
          </>
        ) : item.type === 'academy' ? (
          pendingProblemSummary(item.session)
        ) : null}
      </div>

      {isHomework ? (
        <div className="mt-3 rounded-2xl bg-[#F5F0FF] px-3 py-2.5">
          <HomeworkPhotoPicker
            files={photos}
            onChange={(next) => {
              setPhotos(next)
              if (next.length > 0) setPhotoWarn(false)
            }}
            disabled={busy}
            warn={photoWarn}
          />
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-center rounded-2xl bg-white py-4 shadow-soft">
        <span className="text-[40px] font-extrabold leading-none text-navy tabular">
          {problems === '' ? '0' : problems}
        </span>
        <span className="ml-2 text-sm font-semibold text-navy/50">문제</span>
      </div>

      <p className="mt-2 text-center text-[12px] font-semibold text-navy/45">
        {isHomework
          ? '세 문제가 안 됐으면 0을 누르고 사진 없이 저장해도 돼요.'
          : '세 문제가 안 됐으면 0을 누르고 저장해도 돼요.'}
      </p>

      {photoWarn && photos.length === 0 ? (
        <p className="mt-2 rounded-2xl bg-[#FFF6DA] px-3 py-2 text-center text-[12px] font-semibold text-[#7A5B00]">
          푼 문제가 있으면 공부한 페이지 사진을 1장 이상 올려주세요.
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 break-words rounded-2xl bg-red-50 px-3 py-2 text-center text-[12px] text-red-500">{error}</p>
      ) : null}

      <div className="mt-4">
        <Keypad
          onDigit={pushDigit}
          onBackspace={popDigit}
          onConfirm={save}
          confirmLabel={isHomework ? '제출' : '저장'}
          busy={busy}
        />
      </div>
    </Modal>
  )
}
