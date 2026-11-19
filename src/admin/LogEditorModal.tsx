import { useEffect, useState } from 'react'
import { Modal } from '../components/Modal'
import { Spinner } from '../components/Keypad'
import * as api from '../lib/api'
import { formatDateKo } from '../lib/time'
import type { Student, StudyLog } from '../lib/types'

interface LogEditorModalProps {
  open: boolean
  student: Student | null
  date: string
  log: StudyLog | null
  onClose: () => void
  onSaved: () => void
}

/** 하루 기록 직접 수정/삭제 */
export function LogEditorModal({ open, student, date, log, onClose, onSaved }: LogEditorModalProps): JSX.Element | null {
  const [minutes, setMinutes] = useState('')
  const [problems, setProblems] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMinutes(log ? String(log.minutes) : '')
    setProblems(log ? String(log.problems) : '')
    setError(null)
  }, [open, log, date])

  if (!open || !student) return null

  const toNumber = (value: string) => {
    const n = Number(value.replace(/[^0-9]/g, ''))
    return Number.isFinite(n) ? n : 0
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    const res = await api.upsertLog({
      student_id: student.id,
      date,
      minutes: toNumber(minutes),
      problems: toNumber(problems),
    })
    setBusy(false)
    if (res.ok) {
      onSaved()
      onClose()
    } else {
      setError(res.error)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    const res = log ? await api.deleteLog(log.id) : await api.deleteLogByKey(student.id, date)
    setBusy(false)
    if (res.ok) {
      onSaved()
      onClose()
    } else {
      setError(res.error)
    }
  }

  return (
    <Modal
      open={open}
      title="기록 수정"
      description={
        <span>
          {student.name} · {formatDateKo(date)}
        </span>
      }
      onClose={onClose}
      footer={
        <>
          {log ? (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="mr-auto rounded-xl px-3 py-2 text-[12px] font-bold text-red-500 hover:bg-red-50"
            >
              기록 삭제
            </button>
          ) : null}
          <button type="button" className="btn-outline" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button type="button" className="btn-navy" onClick={() => void save()} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : '저장'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[12px] font-semibold text-navy/60">
          공부시간(분)
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            className="mt-1 w-full rounded-xl border border-blue-line px-3 py-2 text-[15px] font-bold text-navy tabular focus:outline-none focus:ring-2 focus:ring-blue-brand/30"
            placeholder="0"
          />
        </label>
        <label className="text-[12px] font-semibold text-navy/60">
          푼 문제 수
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={problems}
            onChange={(event) => setProblems(event.target.value)}
            className="mt-1 w-full rounded-xl border border-blue-line px-3 py-2 text-[15px] font-bold text-navy tabular focus:outline-none focus:ring-2 focus:ring-blue-brand/30"
            placeholder="0"
          />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-navy/40">이 학생·날짜의 기록이 없으면 새로 만들어집니다.</p>
      {error ? <p className="mt-2 break-words rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-500">{error}</p> : null}
    </Modal>
  )
}
