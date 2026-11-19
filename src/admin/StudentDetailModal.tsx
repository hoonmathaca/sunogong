import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { Spinner } from '../components/Keypad'
import * as api from '../lib/api'
import { addDays, formatDateKo, formatMinutes, rangeDates } from '../lib/time'
import type { Student, StudyLog } from '../lib/types'
import { TrendLineChart, type LinePoint } from './Charts'
import { LogEditorModal } from './LogEditorModal'

interface StudentDetailModalProps {
  open: boolean
  student: Student | null
  /** 그래프 기준 마지막 날 (보통 대시보드 종료일) */
  endDate: string
  onClose: () => void
  onChanged: () => void
}

/** 학생 한 명의 한 달 추이 + 기록 목록 (수정/삭제) */
export function StudentDetailModal({ open, student, endDate, onClose, onChanged }: StudentDetailModalProps): JSX.Element | null {
  const [logs, setLogs] = useState<StudyLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ date: string; log: StudyLog | null } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const start = addDays(endDate, -29)

  const load = useCallback(async () => {
    if (!student) return
    setLoading(true)
    const res = await api.listStudentLogs(student.id, start, endDate)
    if (res.ok) {
      setLogs(res.data)
      setError(null)
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [student, start, endDate])

  useEffect(() => {
    if (open) void load()
  }, [open, load, refreshKey])

  const points: LinePoint[] = useMemo(() => {
    const byDate = new Map(logs.map((log) => [log.date, log]))
    return rangeDates(start, endDate).map((date) => {
      const log = byDate.get(date)
      return { date, value: log?.minutes ?? 0, problems: log?.problems ?? 0 }
    })
  }, [logs, start, endDate])

  if (!open || !student) return null

  const totalMinutes = logs.reduce((sum, log) => sum + log.minutes, 0)
  const totalProblems = logs.reduce((sum, log) => sum + log.problems, 0)
  const recent = [...logs].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 14)

  return (
    <>
      <Modal
        open={open}
        wide
        title={`${student.name} · ${student.grade}`}
        description={`최근 30일 (${formatDateKo(start)} ~ ${formatDateKo(endDate)})`}
        onClose={onClose}
      >
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-6 w-6 border-navy/20 border-t-navy" />
          </div>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-blue-soft px-2 py-2">
                <p className="text-[10px] font-semibold text-navy/45">공부시간</p>
                <p className="text-[15px] font-extrabold text-navy tabular">{formatMinutes(totalMinutes)}</p>
              </div>
              <div className="rounded-xl bg-blue-soft px-2 py-2">
                <p className="text-[10px] font-semibold text-navy/45">푼 문제</p>
                <p className="text-[15px] font-extrabold text-navy tabular">{totalProblems}개</p>
              </div>
              <div className="rounded-xl bg-blue-soft px-2 py-2">
                <p className="text-[10px] font-semibold text-navy/45">제출 일수</p>
                <p className="text-[15px] font-extrabold text-navy tabular">{logs.length}일</p>
              </div>
            </div>

            <TrendLineChart points={points} metric="minutes" />

            <h3 className="mt-4 text-[13px] font-bold text-navy">최근 기록</h3>
            {recent.length === 0 ? (
              <p className="mt-2 rounded-xl bg-blue-soft/70 px-3 py-4 text-center text-[12px] text-navy/40">
                최근 30일 기록이 없어요.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-blue-line">
                {recent.map((log) => (
                  <li key={log.id} className="flex items-center justify-between gap-2 py-2 text-[12px]">
                    <span className="font-semibold text-navy/70">{formatDateKo(log.date)}</span>
                    <span className="tabular text-navy/60">
                      {formatMinutes(log.minutes)} · {log.problems}문제
                    </span>
                    <button
                      type="button"
                      className="rounded-lg px-2 py-1 text-[11px] font-bold text-blue-brand hover:bg-blue-soft"
                      onClick={() => setEditing({ date: log.date, log })}
                    >
                      수정
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {error ? <p className="mt-2 break-words text-[12px] text-red-500">{error}</p> : null}
          </>
        )}
      </Modal>

      <LogEditorModal
        open={Boolean(editing)}
        student={student}
        date={editing?.date ?? endDate}
        log={editing?.log ?? null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setRefreshKey((n) => n + 1)
          onChanged()
        }}
      />
    </>
  )
}
