import { useEffect, useState } from 'react'
import { Modal } from '../components/Modal'
import { Spinner } from '../components/Keypad'
import * as api from '../lib/api'
import { editTotals, editValuesFromLog, normalizeEditValues, type LogEditValues } from '../lib/logEdit'
import { formatDateKo, formatMinutes } from '../lib/time'
import type { Student, StudyLog } from '../lib/types'

interface LogEditorModalProps {
  open: boolean
  student: Student | null
  date: string
  log: StudyLog | null
  onClose: () => void
  onSaved: () => void
}

/** 하루 기록 직접 수정/삭제 — 학원 공부와 숙제 공부를 따로 고치고 합계는 자동 */
export function LogEditorModal({ open, student, date, log, onClose, onSaved }: LogEditorModalProps): JSX.Element | null {
  const [academyMinutes, setAcademyMinutes] = useState('')
  const [academyProblems, setAcademyProblems] = useState('')
  const [homeworkMinutes, setHomeworkMinutes] = useState('')
  const [homeworkProblems, setHomeworkProblems] = useState('')
  const [filledNote, setFilledNote] = useState<{ minutes: number; problems: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const initial = editValuesFromLog(log)
    setAcademyMinutes(log ? String(initial.values.academyMinutes) : '')
    setAcademyProblems(log ? String(initial.values.academyProblems) : '')
    setHomeworkMinutes(log ? String(initial.values.homeworkMinutes) : '')
    setHomeworkProblems(log ? String(initial.values.homeworkProblems) : '')
    setFilledNote(
      initial.filledFromTotal ? { minutes: initial.filledMinutes, problems: initial.filledProblems } : null,
    )
    setError(null)
  }, [open, log, date])

  if (!open || !student) return null

  const typed: LogEditValues = {
    academyMinutes: Number(academyMinutes.replace(/[^0-9]/g, '') || 0),
    academyProblems: Number(academyProblems.replace(/[^0-9]/g, '') || 0),
    homeworkMinutes: Number(homeworkMinutes.replace(/[^0-9]/g, '') || 0),
    homeworkProblems: Number(homeworkProblems.replace(/[^0-9]/g, '') || 0),
  }
  const clean = normalizeEditValues(typed)
  const totals = editTotals(typed)

  const save = async () => {
    setBusy(true)
    setError(null)
    const res = await api.upsertLog({
      student_id: student.id,
      date,
      academy_minutes: clean.academyMinutes,
      academy_problems: clean.academyProblems,
      homework_minutes: clean.homeworkMinutes,
      homework_problems: clean.homeworkProblems,
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

  const inputClass =
    'mt-1 w-full rounded-xl border border-blue-line px-3 py-2 text-[15px] font-bold text-navy tabular focus:outline-none focus:ring-2 focus:ring-blue-brand/30'

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
      {filledNote ? (
        <p className="mb-3 rounded-xl bg-blue-soft px-3 py-2 text-[12px] font-semibold text-navy/60">
          예전 기록이라 학원·숙제 구분이 없어요.
          <span className="mt-0.5 block text-[11px] font-medium text-navy/45">
            합계 {formatMinutes(filledNote.minutes)} · {filledNote.problems}문제를 학원 공부로 채워 두었어요. 나눠서 고치면
            됩니다.
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-blue-line/70 bg-blue-soft/40 p-3">
          <p className="text-[12px] font-extrabold text-navy">🏫 학원 공부</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] font-semibold text-navy/55">
              공부시간(분)
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={academyMinutes}
                onChange={(event) => setAcademyMinutes(event.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </label>
            <label className="text-[11px] font-semibold text-navy/55">
              푼 문제 수
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={academyProblems}
                onChange={(event) => setAcademyProblems(event.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-[#DCCBFF] bg-[#EDE4FF]/50 p-3">
          <p className="text-[12px] font-extrabold text-[#5B2FC0]">🏠 숙제 공부</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] font-semibold text-[#5B2FC0]/60">
              공부시간(분)
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={homeworkMinutes}
                onChange={(event) => setHomeworkMinutes(event.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </label>
            <label className="text-[11px] font-semibold text-[#5B2FC0]/60">
              푼 문제 수
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={homeworkProblems}
                onChange={(event) => setHomeworkProblems(event.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-2xl bg-navy px-3 py-2.5 text-white">
        <span className="text-[12px] font-semibold text-white/70">전체 공부시간 (자동)</span>
        <span className="text-right text-[14px] font-extrabold tabular">
          {formatMinutes(totals.minutes)}
          <span className="ml-1.5 text-[11px] font-semibold text-white/60">
            {totals.minutes}분 · {totals.problems}문제
          </span>
        </span>
      </div>

      <p className="mt-2 text-[11px] text-navy/40">
        전체 시간은 학원 + 숙제로 계산돼요. 이 학생·날짜의 기록이 없으면 새로 만들어집니다.
      </p>
      {error ? <p className="mt-2 break-words rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-500">{error}</p> : null}
    </Modal>
  )
}
