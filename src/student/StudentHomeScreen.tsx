import { useCallback, useEffect, useMemo, useState } from 'react'
import { BrandFooter, Mascot } from '../components/Brand'
import { Spinner } from '../components/Keypad'
import * as api from '../lib/api'
import { addDays, formatDateKo, formatMinutes, todayKst, weekdayOf } from '../lib/time'
import type { Student, StudyLog } from '../lib/types'

interface StudentHomeScreenProps {
  student: Student
  onStart: () => void
  onExit: () => void
  busy?: boolean
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/** 학생 홈: 오늘 누적, 최근 7일, 공부 시작 */
export function StudentHomeScreen({ student, onStart, onExit, busy = false }: StudentHomeScreenProps): JSX.Element {
  const [logs, setLogs] = useState<StudyLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = todayKst()
  const start = addDays(today, -6)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await api.listStudentLogs(student.id, start, today)
    if (res.ok) {
      setLogs(res.data)
      setError(null)
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [student.id, start, today])

  useEffect(() => {
    void load()
  }, [load])

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = addDays(today, -6 + index)
        const log = logs.find((item) => item.date === date)
        return { date, log }
      }),
    [logs, today],
  )

  const todayLog = logs.find((item) => item.date === today)
  const weekMinutes = logs.reduce((sum, item) => sum + (item.minutes ?? 0), 0)
  const weekProblems = logs.reduce((sum, item) => sum + (item.problems ?? 0), 0)
  const maxMinutes = Math.max(30, ...days.map((day) => day.log?.minutes ?? 0))

  return (
    <div className="screen bg-gradient-to-b from-blue-soft/70 to-white">
      <div className="flex-1 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <header className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <Mascot variant="full" className="h-11 w-11 shrink-0" />
            <div>
              <h1 className="font-round text-[24px] leading-none text-navy">선오공</h1>
              <p className="mt-1 text-[12px] font-semibold text-navy/50">선생님, 오늘도 공부했어요!</p>
            </div>
          </div>
          <button type="button" onClick={onExit} className="btn-ghost px-2 py-1 text-[12px]">
            나가기
          </button>
        </header>

        <section className="mt-5 rounded-3xl bg-navy p-5 text-white shadow-soft">
          <p className="text-sm font-semibold text-white/70">
            {student.name} <span className="text-white/40">·</span> {student.grade}
          </p>
          <p className="mt-3 text-[13px] font-semibold text-white/60">오늘 공부한 시간</p>
          <p className="mt-1 text-[34px] font-extrabold leading-tight tabular">
            {todayLog ? formatMinutes(todayLog.minutes) : '0분'}
          </p>
          <div className="mt-3 flex items-center gap-2 text-[13px] text-white/70">
            <span className="rounded-full bg-white/10 px-2.5 py-1">푼 문제 {todayLog?.problems ?? 0}개</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1">이번 주 {formatMinutes(weekMinutes)}</span>
          </div>
        </section>

        <section className="mt-4 card">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-bold text-navy">최근 7일</h2>
            <span className="text-[11px] font-semibold text-navy/40">
              이번 주 문제 {weekProblems}개
            </span>
          </div>

          {loading ? (
            <div className="flex h-28 items-center justify-center">
              <Spinner className="h-6 w-6 border-navy/20 border-t-navy" />
            </div>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {days.map(({ date, log }) => (
                <li key={date} className="flex items-center gap-2.5 text-[12px]">
                  <span
                    className={`w-12 shrink-0 font-semibold tabular ${
                      date === today ? 'text-navy' : weekdayOf(date) === 0 ? 'text-red-400' : 'text-navy/50'
                    }`}
                  >
                    {Number(date.slice(5, 7))}/{Number(date.slice(8, 10))} ({WEEKDAY[weekdayOf(date)]})
                  </span>
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-blue-soft">
                    <span
                      className={`block h-full rounded-full ${log ? 'bg-blue-brand' : 'bg-transparent'}`}
                      style={{ width: log ? `${Math.max(6, Math.round(((log.minutes ?? 0) / maxMinutes) * 100))}%` : '0%' }}
                    />
                  </span>
                  <span className={`w-16 shrink-0 text-right font-semibold tabular ${log ? 'text-navy' : 'text-navy/25'}`}>
                    {log ? formatMinutes(log.minutes) : '—'}
                  </span>
                  <span className="w-10 shrink-0 text-right text-[11px] tabular text-navy/40">
                    {log ? `${log.problems}개` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-[11px] text-navy/35">{formatDateKo(today)} 기준</p>
        </section>

        {error ? (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-red-50 px-3 py-2 text-[12px] text-red-500">
            <span className="break-words">{error}</span>
            <button type="button" className="shrink-0 font-bold underline" onClick={() => void load()}>
              다시
            </button>
          </div>
        ) : null}
      </div>

      <div className="px-5 pb-1">
        <button type="button" onClick={onStart} disabled={busy} className="btn-navy h-[54px] w-full text-lg">
          {busy ? <Spinner className="h-5 w-5 border-white/40 border-t-white" /> : '공부 시작'}
        </button>
      </div>

      <BrandFooter />
    </div>
  )
}
