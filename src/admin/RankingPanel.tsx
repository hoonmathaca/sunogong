import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { downloadBlob, todayStamp } from '../lib/csv'
import { matchesGradeFilter, normalizeGrade, type GradeFilter } from '../lib/grades'
import * as api from '../lib/api'
import {
  currentMonthKst,
  formatMinutes,
  monthRange,
  shiftMonth,
  todayKst,
} from '../lib/time'
import {
  buildStats,
  indexLogs,
  longestStreakAllTime,
  longestStreakInRange,
  rankByKind,
  rankEntries,
  sortStudents,
  type RankedEntry,
} from '../lib/stats'
import { displayNickname, normalizeNickname } from '../lib/kintounBoard'
import type { Student, StudyLog } from '../lib/types'
import { AdminSection, EmptyBlock, ErrorBlock, GradeFilterSelect, LoadingBlock } from './ui'

type Period = 'this' | 'last' | 'pick' | 'all'

interface RankingPanelProps {
  students: Student[]
  studentsLoading: boolean
  studentsError: string | null
  reloadStudents: () => void
}

const MEDALS = ['bg-amber-400 text-white', 'bg-slate-300 text-white', 'bg-amber-600/80 text-white']

function periodRange(period: Period, pickedMonth: string, today: string): { start: string; end: string; label: string } {
  const current = currentMonthKst()
  const clamp = (end: string) => (end > today ? today : end)
  if (period === 'this') {
    const range = monthRange(current)
    return { start: range.start, end: clamp(range.end), label: `${current.slice(0, 4)}년 ${Number(current.slice(5, 7))}월` }
  }
  if (period === 'last') {
    const last = shiftMonth(current, -1)
    const range = monthRange(last)
    return { start: range.start, end: clamp(range.end), label: `${last.slice(0, 4)}년 ${Number(last.slice(5, 7))}월` }
  }
  if (period === 'pick') {
    const range = monthRange(pickedMonth)
    return { ...range, label: `${pickedMonth.slice(0, 4)}년 ${Number(pickedMonth.slice(5, 7))}월` }
  }
  return { start: '2000-01-01', end: today, label: '전체 누적' }
}

export function RankingPanel({ students, studentsLoading, studentsError, reloadStudents }: RankingPanelProps): JSX.Element {
  const today = todayKst()
  const [period, setPeriod] = useState<Period>('this')
  const [pickedMonth, setPickedMonth] = useState(currentMonthKst())
  const [grade, setGrade] = useState<GradeFilter>('전체')
  const [logs, setLogs] = useState<StudyLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const captureRef = useRef<HTMLDivElement>(null)

  const { start, end, label } = useMemo(() => periodRange(period, pickedMonth, today), [period, pickedMonth, today])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await api.listLogs(start, end)
    if (res.ok) {
      setLogs(res.data)
      setError(null)
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [start, end])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  /* 화면이 다시 보이면 최신 기록으로 다시 집계 */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setRefreshKey((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const filtered = useMemo(
    () => sortStudents(students.filter((student) => matchesGradeFilter(normalizeGrade(student.grade), grade))),
    [students, grade],
  )
  const index = useMemo(() => indexLogs(logs), [logs])
  const stats = useMemo(() => buildStats(filtered, index, start, end), [filtered, index, start, end])

  const streakRanking = useMemo<RankedEntry[]>(() => {
    const items = stats.map((stat) => {
      const dates = index.get(stat.student.id)?.keys() ?? []
      const value =
        period === 'all' ? longestStreakAllTime(dates) : longestStreakInRange(dates, start, end)
      return { student: stat.student, value, days: stat.submittedDays }
    })
    return rankEntries(items)
  }, [stats, index, period, start, end])

  /* 공부시간 랭킹 — 전체 / 학원 공부 / 숙제 공부 따로 */
  const totalMinuteRanking = useMemo(() => rankByKind(stats, 'all'), [stats])
  const academyMinuteRanking = useMemo(() => rankByKind(stats, 'academy'), [stats])
  const homeworkMinuteRanking = useMemo(() => rankByKind(stats, 'homework'), [stats])
  /* 🐉 드래곤볼 랭킹 — students.dragonball_count (기간과 무관한 현재 보유) */
  const dragonballRanking = useMemo(() => rankByKind(stats, 'dragonball'), [stats])

  const problemRanking = useMemo(
    () => rankEntries(stats.map((stat) => ({ student: stat.student, value: stat.problems, days: stat.submittedDays }))),
    [stats],
  )

  const saveImage = async () => {
    if (!captureRef.current || saving) return
    setSaving(true)
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      })
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(`선오공_랭킹_${label.replace(/\s/g, '')}_${todayStamp()}.png`, blob)
      }, 'image/png')
    } catch (captureError) {
      console.error('[sunogong] 랭킹 이미지 저장 실패:', captureError)
      setError('이미지로 저장하지 못했어요. 화면 캡처를 이용해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  const renderRanking = (
    title: string,
    subtitle: string,
    entries: RankedEntry[],
    format: (value: number) => string,
    emptyText = '아직 기록이 없어요',
  ): JSX.Element => (
    <div className="rounded-2xl border border-blue-line bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[14px] font-extrabold text-navy">{title}</h3>
        <span className="text-[10px] font-semibold text-navy/40">{subtitle}</span>
      </div>

      {entries.length === 0 ? (
        <p className="mt-3 rounded-xl bg-blue-soft/70 px-3 py-5 text-center text-[12px] text-navy/40">{emptyText}</p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {entries.map((entry) => (
            <li key={entry.student.id} className="flex items-center gap-2.5">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
                  MEDALS[entry.rank - 1] ?? 'bg-blue-soft text-navy/70'
                }`}
              >
                {entry.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-navy">
                {entry.student.name}
                <span className="ml-1 text-[10px] font-medium text-navy/40">{entry.student.grade}</span>
                {normalizeNickname(entry.student.nickname) ? (
                  <span className="ml-1 text-[10px] font-semibold text-[#8A5400]/70">({displayNickname(entry.student.nickname)})</span>
                ) : null}
              </span>
              <span className="shrink-0 text-[12px] font-extrabold tabular text-blue-brand">{format(entry.value)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <AdminSection
        title="기간"
        description="매달 1일에 이번 달 기준으로 자동 바뀌어요."
        actions={
          <>
            <button type="button" className="btn-ghost border border-blue-line" onClick={() => setRefreshKey((n) => n + 1)}>
              새로고침
            </button>
            <button type="button" className="btn-navy px-4 py-2 text-[12px]" onClick={() => void saveImage()} disabled={saving}>
              {saving ? '저장 중…' : '이미지로 저장'}
            </button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { key: 'this', label: '이번 달' },
              { key: 'last', label: '지난달' },
              { key: 'pick', label: '월 선택' },
              { key: 'all', label: '전체 누적' },
            ] as { key: Period; label: string }[]
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setPeriod(option.key)}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-bold transition ${
                period === option.key ? 'bg-navy text-white shadow-soft' : 'border border-blue-line text-navy/60 hover:bg-blue-soft'
              }`}
            >
              {option.label}
            </button>
          ))}

          {period === 'pick' ? (
            <input type="month" value={pickedMonth} onChange={(event) => setPickedMonth(event.target.value || currentMonthKst())} />
          ) : null}

          <GradeFilterSelect value={grade} onChange={setGrade} className="ml-auto" />
        </div>
      </AdminSection>

      {error ? <ErrorBlock message={error} onRetry={() => setRefreshKey((n) => n + 1)} /> : null}
      {studentsError ? <ErrorBlock message={studentsError} onRetry={reloadStudents} /> : null}

      {studentsLoading || loading ? (
        <LoadingBlock label="랭킹을 계산하는 중…" />
      ) : filtered.length === 0 ? (
        <EmptyBlock message="조건에 맞는 학생이 없어요." />
      ) : (
        <div ref={captureRef} className="space-y-3 rounded-3xl bg-white p-3 sm:p-4">
          <div className="rounded-2xl bg-navy px-5 py-4 text-white">
            <p className="text-[11px] font-semibold text-white/60">선오공 랭킹</p>
            <p className="mt-1 text-[26px] font-extrabold leading-tight">{label}</p>
            <p className="mt-1 text-[11px] text-white/50">
              {grade === '전체' ? '전체 학년' : grade} · {start} ~ {end}
              {period === 'all' ? ' (역대 최장 연속)' : ''}
            </p>
          </div>

          {renderRanking('연속 공부 TOP3', period === 'all' ? '역대 최장' : '기간 내 최장', streakRanking, (value) => `${value}일`)}
          {renderRanking('전체 공부시간 TOP3', '학원+숙제 합계', totalMinuteRanking, (value) => formatMinutes(value))}
          {renderRanking('🏫 학원 공부 TOP3', '기간 합계', academyMinuteRanking, (value) => formatMinutes(value))}
          {renderRanking('🏠 숙제 공부 TOP3', '기간 합계', homeworkMinuteRanking, (value) => formatMinutes(value))}
          {renderRanking('🐉 드래곤볼 TOP3', '지금 보유 · 기간과 무관', dragonballRanking, (value) => `${value}개`, '아직 드래곤볼을 받은 학생이 없어요')}
          {renderRanking('문제 풀이 TOP3', '기간 합계', problemRanking, (value) => `${value}개`)}

          <p className="px-1 text-[10px] text-navy/35">
            동점이면 같은 순위로 표시하고, 그 안에서는 기록을 많이 남긴 학생을 먼저 보여줘요.
          </p>
        </div>
      )}
    </div>
  )
}
