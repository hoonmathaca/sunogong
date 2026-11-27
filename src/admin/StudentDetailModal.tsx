import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { Spinner } from '../components/Keypad'
import * as api from '../lib/api'
import { hasScopedLog, splitLog, type StatScope } from '../lib/stats'
import { addDays, formatDateKo, formatMinutes, formatMinutesCompact, rangeDates } from '../lib/time'
import type { Student, StudyLog } from '../lib/types'
import { DualTrendChart, type DualPoint } from './Charts'
import { LogEditorModal } from './LogEditorModal'
import { KindScopeSwitch } from './ui'

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
  const [scope, setScope] = useState<StatScope>('all')
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

  /* 학원(파랑)·숙제(빨강) 두 선 — 구분을 고르면 그 선만 보인다 (2026-11-28) */
  const points: DualPoint[] = useMemo(() => {
    const byDate = new Map(logs.map((log) => [log.date, log]))
    return rangeDates(start, endDate).map((date) => {
      const split = splitLog(byDate.get(date))
      return { date, academy: split.academyMinutes, homework: split.homeworkMinutes }
    })
  }, [logs, start, endDate])

  if (!open || !student) return null

  const totalMinutes = logs.reduce((sum, log) => sum + log.minutes, 0)
  const totalProblems = logs.reduce((sum, log) => sum + log.problems, 0)
  const totalAcademyMinutes = logs.reduce((sum, log) => sum + splitLog(log).academyMinutes, 0)
  const totalHomeworkMinutes = logs.reduce((sum, log) => sum + splitLog(log).homeworkMinutes, 0)
  const totalAcademyProblems = logs.reduce((sum, log) => sum + splitLog(log).academyProblems, 0)
  const totalHomeworkProblems = logs.reduce((sum, log) => sum + splitLog(log).homeworkProblems, 0)
  const submittedDays = logs.filter((log) => hasScopedLog(log, scope)).length
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
            <div className="mb-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <div className="rounded-xl bg-blue-soft px-2 py-2">
                <p className="text-[10px] font-semibold text-navy/45">총 공부시간</p>
                <p className="text-[14px] font-extrabold text-navy tabular">{formatMinutesCompact(totalMinutes)}</p>
                <p className="text-[10px] font-semibold text-navy/35 tabular">{totalProblems}문제</p>
              </div>
              <div className="rounded-xl bg-blue-soft px-2 py-2">
                <p className="text-[10px] font-semibold text-navy/45">🏫 학원 공부</p>
                <p className="text-[14px] font-extrabold text-navy tabular">{formatMinutesCompact(totalAcademyMinutes)}</p>
                <p className="text-[10px] font-semibold text-navy/35 tabular">{totalAcademyProblems}문제</p>
              </div>
              <div className="rounded-xl bg-[#EDE4FF]/70 px-2 py-2">
                <p className="text-[10px] font-semibold text-[#5B2FC0]/60">🏠 숙제 공부</p>
                <p className="text-[14px] font-extrabold text-[#5B2FC0] tabular">
                  {formatMinutesCompact(totalHomeworkMinutes)}
                </p>
                <p className="text-[10px] font-semibold text-[#5B2FC0]/45 tabular">{totalHomeworkProblems}문제</p>
              </div>
              <div className="rounded-xl bg-blue-soft px-2 py-2">
                <p className="text-[10px] font-semibold text-navy/45">기록한 날</p>
                <p className="text-[14px] font-extrabold text-navy tabular">
                  {submittedDays}일
                </p>
                <p className="text-[10px] font-semibold text-navy/35">
                  {scope === 'all' ? '학원·숙제 모두' : scope === 'academy' ? '🏫 학원 기록' : '🏠 숙제 기록'}
                </p>
              </div>
            </div>

            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[13px] font-bold text-navy">최근 30일 추이</h3>
              <KindScopeSwitch value={scope} onChange={setScope} label="추이 구분" />
            </div>
            <DualTrendChart
              points={points}
              metric="minutes"
              showAcademy={scope !== 'homework'}
              showHomework={scope !== 'academy'}
            />

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
                    <span className="text-right tabular text-navy/60">
                      {formatMinutes(log.minutes)} · {log.problems}문제
                      {(log.academy_minutes ?? 0) > 0 || (log.homework_minutes ?? 0) > 0 ? (
                        <span className="block text-[11px] text-navy/40">
                          🏫 {log.academy_minutes ?? 0}분 · 🏠 {log.homework_minutes ?? 0}분
                        </span>
                      ) : null}
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
