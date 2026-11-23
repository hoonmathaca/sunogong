import { useEffect, useState } from 'react'
import { Keypad } from '../components/Keypad'
import { Modal } from '../components/Modal'
import * as api from '../lib/api'
import {
  appendProblemDigit,
  MAX_PROBLEMS,
  PROBLEMS_LIMIT_MESSAGE,
  problemsFromInput,
  problemsOverLimit,
} from '../lib/pauseWatch'
import { formatDateKo, todayKst } from '../lib/time'
import type { StudyLog } from '../lib/types'

interface EditAcademyProblemsModalProps {
  open: boolean
  studentId: string
  /** 지금 오늘 기록에 들어 있는 학원 공부 문제 수 */
  current: number
  onClose: () => void
  /** 저장에 성공하면 서버가 돌려준 오늘 기록 (화면 숫자를 바로 고친다) */
  onSaved: (log: StudyLog | null) => void
}

/**
 * 학생이 오늘(KST) 학원 공부 문제 수를 직접 고치는 창.
 *
 * · 학원 공부 문제 수(academy_problems)만 0~999 로 바꾼다.
 * · 숙제 공부 문제 수는 선생님 확인(승인) 대상이라 손대지 않는다.
 * · 저장은 DB 함수(student_update_today_academy_problems)가 오늘 기록 한 줄을 잠그고
 *   합계(problems = 학원 + 숙제)까지 한 번에 다시 계산한다.
 */
export function EditAcademyProblemsModal({
  open,
  studentId,
  current,
  onClose,
  onSaved,
}: EditAcademyProblemsModalProps): JSX.Element | null {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  /* 창을 열 때마다 지금 기록 값으로 채운다 */
  useEffect(() => {
    if (!open) return
    const start = Math.max(0, Math.min(MAX_PROBLEMS, Math.floor(Number(current) || 0)))
    setText(String(start))
    setBusy(false)
    setError(null)
    setNotice(null)
  }, [open, current])

  const pushDigit = (digit: string) => {
    const next = appendProblemDigit(text, digit)
    if (next.blocked) {
      setNotice(PROBLEMS_LIMIT_MESSAGE)
      return
    }
    setNotice(null)
    setText(next.text)
  }
  const popDigit = () => {
    setNotice(null)
    setText(text.slice(0, -1))
  }

  const save = async () => {
    if (problemsOverLimit(text)) {
      setNotice(PROBLEMS_LIMIT_MESSAGE)
      return
    }
    const count = problemsFromInput(text)
    setBusy(true)
    setError(null)
    const res = await api.updateTodayAcademyProblems(studentId, count)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onSaved(res.data?.log ?? null)
  }

  const shown = text === '' ? '0' : text
  const changed = problemsFromInput(text) !== Math.max(0, Math.floor(Number(current) || 0))

  return (
    <Modal
      open={open}
      title="오늘 학원 공부 문제 수"
      description={`${formatDateKo(todayKst())} 학원 공부 문제 수를 고쳐요. 숙제 공부 문제 수는 선생님 확인 뒤에 들어가요.`}
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <button type="button" className="btn-outline" onClick={onClose} disabled={busy}>
          취소
        </button>
      }
    >
      <div className="rounded-2xl bg-blue-soft px-4 py-3 text-center text-[12.5px] font-semibold leading-snug text-navy/70">
        지금 기록 <b className="text-navy">{Math.max(0, Math.floor(Number(current) || 0))}문제</b>
        <br />
        <span className="text-[11.5px] font-semibold text-navy/50">
          0~999문제까지 넣을 수 있어요. 고치면 오늘 문제 합계도 같이 바뀌어요.
        </span>
      </div>

      <div className="mt-3 flex items-center justify-center rounded-2xl bg-white py-4 shadow-soft">
        <span className="text-[40px] font-extrabold leading-none text-navy tabular">{shown}</span>
        <span className="ml-2 text-sm font-semibold text-navy/50">문제</span>
      </div>

      {notice ? (
        <p className="mt-2 break-words rounded-2xl bg-[#FFF6DA] px-3 py-2 text-center text-[11.5px] font-semibold leading-snug text-[#7A5B00]">
          {notice}
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 break-words rounded-2xl bg-red-50 px-3 py-2 text-center text-[12px] text-red-500">{error}</p>
      ) : null}

      <div className="mt-4">
        <Keypad
          onDigit={pushDigit}
          onBackspace={popDigit}
          onConfirm={() => void save()}
          confirmLabel="저장"
          busy={busy}
          confirmDisabled={!changed}
        />
      </div>
      <p className="mt-2 text-center text-[11px] font-semibold text-navy/35">
        {changed ? '저장을 누르면 오늘 기록에 바로 반영돼요.' : '숫자를 고치면 저장할 수 있어요.'}
      </p>
    </Modal>
  )
}
