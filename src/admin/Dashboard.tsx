import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildMonthGrid, cellTimeText, monthDaySums, monthLabel, sumMonth } from '../lib/calendar'
import { downloadTextFile, todayStamp, toCsv } from '../lib/csv'
import { compareName, matchesGradeFilter, normalizeGrade, type GradeFilter } from '../lib/grades'
import * as api from '../lib/api'
import {
  addDays,
  currentMonthKst,
  formatMinutes,
  formatMinutesCompact,
  isWeekend,
  monthRange,
  rangeDates,
  shiftMonth,
  todayKst,
  weekdayOf,
} from '../lib/time'
import {
  buildStats,
  groupByGrade,
  indexLogs,
  scopeLabel,
  scopeShortLabel,
  scopedDays,
  scopedMinutes,
  scopedProblems,
  sortStudents,
  splitLog,
  studentsWithoutKind,
  sumSplits,
  type StatScope,
  type StudentStat,
} from '../lib/stats'
import { KIND_BAR_CLASS } from '../lib/kinds'
import type { Student, StudyLog } from '../lib/types'
import { HorizontalBars, KindLegend, SplitBar } from './Charts'
import { DayDetailModal } from './DayDetailModal'
import { LogEditorModal } from './LogEditorModal'
import { StudentDetailModal } from './StudentDetailModal'
import {
  AdminSection,
  EmptyBlock,
  ErrorBlock,
  GradeFilterSelect,
  KindScopeSwitch,
  LoadingBlock,
  StatCard,
} from './ui'

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

interface DashboardProps {
  students: Student[]
  studentsLoading: boolean
  studentsError: string | null
  reloadStudents: () => void
}

type EmptyPeriod = 'today' | 'week' | 'month'

export function Dashboard({ students, studentsLoading, studentsError, reloadStudents }: DashboardProps): JSX.Element {
  const today = todayKst()
  const [start, setStart] = useState(addDays(today, -29))
  const [end, setEnd] = useState(today)
  const [grade, setGrade] = useState<GradeFilter>('전체')
  const [logs, setLogs] = useState<StudyLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [metric, setMetric] = useState<'minutes' | 'problems'>('minutes')
  const [scope, setScope] = useState<StatScope>('all')
  const [showAllBars, setShowAllBars] = useState(false)
  const [emptyPeriod, setEmptyPeriod] = useState<EmptyPeriod>('today')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [detailStudent, setDetailStudent] = useState<Student | null>(null)
  const [editingCell, setEditingCell] = useState<{ student: Student; date: string; log: StudyLog | null } | null>(null)
  /* 공부기록 달력 — 조회 기간과 따로 움직이는 한 달 (2026-11-28) */
  const [month, setMonth] = useState(() => todayKst().slice(0, 7))
  const [monthLogs, setMonthLogs] = useState<StudyLog[]>([])
  const [monthLoading, setMonthLoading] = useState(true)
  const [monthError, setMonthError] = useState<string | null>(null)
  const [dayDate, setDayDate] = useState<string | null>(null)

  const safeStart = start <= end ? start : end
  const safeEnd = start <= end ? end : start

  const loadLogs = useCallback(async () => {
    setLoading(true)
    const res = await api.listLogs(safeStart, safeEnd)
    if (res.ok) {
      setLogs(res.data)
      setError(null)
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [safeStart, safeEnd])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs, refreshKey])

  /* 조회 기간의 끝이 바뀌면 달력도 그 달로 — 달력은 따로 넘겨 볼 수 있다 */
  useEffect(() => {
    setMonth(safeEnd.slice(0, 7))
  }, [safeEnd])

  const loadMonthLogs = useCallback(async () => {
    setMonthLoading(true)
    const range = monthRange(month)
    const res = await api.listLogs(range.start, range.end)
    if (res.ok) {
      setMonthLogs(res.data)
      setMonthError(null)
    } else {
      setMonthError(res.error)
    }
    setMonthLoading(false)
  }, [month])

  useEffect(() => {
    void loadMonthLogs()
  }, [loadMonthLogs, refreshKey])

  const dates = useMemo(() => rangeDates(safeStart, safeEnd), [safeStart, safeEnd])
  const index = useMemo(() => indexLogs(logs), [logs])
  const monthIndex = useMemo(() => indexLogs(monthLogs), [monthLogs])
  const filteredStudents = useMemo(
    () => sortStudents(students.filter((student) => matchesGradeFilter(normalizeGrade(student.grade), grade))),
    [students, grade],
  )
  const stats = useMemo(() => buildStats(filteredStudents, index, safeStart, safeEnd), [filteredStudents, index, safeStart, safeEnd])
  const statById = useMemo(() => new Map(stats.map((stat) => [stat.student.id, stat])), [stats])

  const totals = useMemo(() => sumSplits(stats), [stats])
  /* 선택한 구분(전체 / 학원 / 숙제)만의 합계 — 요약 카드·학생 비교·미제출에 함께 쓴다 */
  const scopeMinutesTotal = useMemo(() => stats.reduce((sum, stat) => sum + scopedMinutes(stat, scope), 0), [stats, scope])
  const scopeProblemsTotal = useMemo(
    () => stats.reduce((sum, stat) => sum + scopedProblems(stat, scope), 0),
    [stats, scope],
  )
  const submittedStudents = stats.filter((stat) => scopedDays(stat, scope) > 0).length

  const emptyDates = useMemo(() => {
    if (emptyPeriod === 'today') return { start: today, end: today }
    if (emptyPeriod === 'week') {
      const weekday = weekdayOf(today)
      const offset = weekday === 0 ? 6 : weekday - 1
      return { start: addDays(today, -offset), end: today }
    }
    return monthRange(currentMonthKst())
  }, [emptyPeriod, today])

  const missingCounts = useMemo(
    () => ({
      all: studentsWithoutKind(filteredStudents, index, emptyDates.start, emptyDates.end, 'all').length,
      academy: studentsWithoutKind(filteredStudents, index, emptyDates.start, emptyDates.end, 'academy').length,
      homework: studentsWithoutKind(filteredStudents, index, emptyDates.start, emptyDates.end, 'homework').length,
    }),
    [filteredStudents, index, emptyDates],
  )

  const missing = useMemo(
    () => studentsWithoutKind(filteredStudents, index, emptyDates.start, emptyDates.end, scope).slice(0, 60),
    [filteredStudents, index, emptyDates, scope],
  )

  const sections = useMemo(() => groupByGrade(filteredStudents), [filteredStudents])

  /* 달력 칸·달 요약 — 학년 필터가 적용된 학생만 센다 */
  const calendarCells = useMemo(() => buildMonthGrid(month), [month])
  const daySums = useMemo(() => monthDaySums(filteredStudents, monthIndex, month), [filteredStudents, monthIndex, month])
  const monthTotal = useMemo(() => sumMonth(daySums.values()), [daySums])
  const monthToday = todayKst()

  const barItems = useMemo(() => {
    const valueOf = (stat: StudentStat) => (metric === 'minutes' ? scopedMinutes(stat, scope) : scopedProblems(stat, scope))
    const sorted = [...stats]
      .filter((stat) => scope === 'all' || valueOf(stat) > 0)
      .sort((a, b) => {
        const diff = valueOf(b) - valueOf(a)
        return diff !== 0 ? diff : compareName(a.student.name, b.student.name)
      })
    const list = showAllBars ? sorted : sorted.slice(0, 15)
    return list.map((stat) => ({
      key: stat.student.id,
      label: stat.student.name,
      sublabel: stat.student.grade.replace('미지정', '—'),
      value: valueOf(stat),
      segments:
        scope === 'all'
          ? [
              {
                value: metric === 'minutes' ? stat.academyMinutes : stat.academyProblems,
                className: KIND_BAR_CLASS.academy,
                label: '🏫 학원',
              },
              {
                value: metric === 'minutes' ? stat.homeworkMinutes : stat.homeworkProblems,
                className: KIND_BAR_CLASS.homework,
                label: '🏠 숙제',
              },
            ]
          : [
              {
                value: valueOf(stat),
                className: KIND_BAR_CLASS[scope],
                label: scopeShortLabel(scope),
              },
            ],
    }))
  }, [stats, metric, showAllBars, scope])

  const downloadCsv = (shape: 'long' | 'matrix') => {
    const rows: (string | number)[][] = []
    if (shape === 'long') {
      rows.push([
        '학년',
        '이름',
        '코드',
        '날짜',
        '학원 공부(분)',
        '숙제 공부(분)',
        '공부시간(분)',
        '공부시간',
        '학원 푼 숙제',
        '숙제 공부 푼 숙제',
        '푼 숙제 수',
      ])
      for (const stat of stats) {
        for (const date of dates) {
          const log = stat.byDate.get(date)
          if (!log) continue
          const split = splitLog(log)
          rows.push([
            normalizeGrade(stat.student.grade),
            stat.student.name,
            stat.student.code,
            date,
            split.academyMinutes,
            split.homeworkMinutes,
            log.minutes,
            formatMinutes(log.minutes),
            split.academyProblems,
            split.homeworkProblems,
            log.problems,
          ])
        }
      }
    } else {
      const header: string[] = ['학년', '이름', '코드']
      for (const date of dates) {
        header.push(`${date} 공부(분)`, `${date} 푼 숙제`)
      }
      header.push('합계(분)', '학원 공부(분)', '숙제 공부(분)', '합계 푼 숙제', '학원 푼 숙제', '숙제 공부 푼 숙제')
      rows.push(header)
      for (const stat of stats) {
        const row: (string | number)[] = [normalizeGrade(stat.student.grade), stat.student.name, stat.student.code]
        for (const date of dates) {
          const log = stat.byDate.get(date)
          row.push(log ? log.minutes : '', log ? log.problems : '')
        }
        row.push(
          stat.minutes,
          stat.academyMinutes,
          stat.homeworkMinutes,
          stat.problems,
          stat.academyProblems,
          stat.homeworkProblems,
        )
        rows.push(row)
      }
    }
    downloadTextFile(`선오공_학습기록_${safeStart}_${safeEnd}_${todayStamp()}.csv`, toCsv(rows))
  }

  return (
    <div className="space-y-4">
      <AdminSection
        title="조회 조건"
        description="기간·학년·구분을 바꾸면 아래 표와 모든 통계에 함께 적용돼요."
        actions={
          <>
            <button type="button" className="btn-ghost border border-blue-line" onClick={() => setRefreshKey((n) => n + 1)}>
              새로고침
            </button>
            <button type="button" className="btn-navy px-4 py-2 text-[12px]" onClick={() => downloadCsv('long')}>
              엑셀(CSV) 다운로드
            </button>
            <button type="button" className="btn-outline px-3 py-2 text-[12px]" onClick={() => downloadCsv('matrix')}>
              표 형식 CSV
            </button>
          </>
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[12px] font-semibold text-navy/60">
            시작
            <input type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} className="mt-1 block" />
          </label>
          <label className="text-[12px] font-semibold text-navy/60">
            끝
            <input type="date" value={end} min={start} max={today} onChange={(event) => setEnd(event.target.value)} className="mt-1 block" />
          </label>
          <div className="flex gap-1.5">
            {[
              { label: '최근 7일', start: addDays(today, -6), end: today },
              { label: '최근 30일', start: addDays(today, -29), end: today },
              { label: '이번 달', start: monthRange(currentMonthKst()).start, end: today },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="rounded-full border border-blue-line px-3 py-1.5 text-[11px] font-bold text-navy/60 hover:bg-blue-soft"
                onClick={() => {
                  setStart(preset.start)
                  setEnd(preset.end)
                  /* 기간을 고르면 달력도 그 끝 날짜의 달로 (2026-11-28) */
                  setMonth(preset.end.slice(0, 7))
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <GradeFilterSelect value={grade} onChange={setGrade} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-blue-line pt-3">
          <span className="text-[12px] font-semibold text-navy/60">구분</span>
          <KindScopeSwitch value={scope} onChange={setScope} label="통계 구분" />
          <span className="text-[10.5px] font-semibold text-navy/40">
            {scope === 'all'
              ? '학원·숙제를 합쳐 집계해요. 한쪽만 보려면 골라 주세요.'
              : `${scopeLabel(scope)} 기록만 집계해요.`}
          </span>
        </div>
      </AdminSection>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="학생" value={`${filteredStudents.length}명`} sub={`기록 있음 ${submittedStudents}명`} tone="navy" />
        <StatCard
          label="🏫 학원 공부"
          value={formatMinutes(totals.academyMinutes)}
          sub={`푼 숙제 ${totals.academyProblems}개`}
          tone="academy"
        />
        <StatCard
          label="🏠 숙제 공부"
          value={formatMinutes(totals.homeworkMinutes)}
          sub={`푼 숙제 ${totals.homeworkProblems}개`}
          tone="homework"
        />
        <StatCard
          label={scope === 'all' ? '합계' : `${scopeShortLabel(scope)} 합계`}
          value={formatMinutes(scopeMinutesTotal)}
          sub={`푼 숙제 ${scopeProblemsTotal}개`}
        />
        <StatCard
          label={scope === 'all' ? '1인당 평균' : `${scopeShortLabel(scope)} 1인당`}
          value={formatMinutes(filteredStudents.length ? scopeMinutesTotal / filteredStudents.length : 0)}
          sub={scope === 'all' ? '기간 전체' : '선택한 구분'}
        />
      </div>

      {error ? <ErrorBlock message={error} onRetry={() => setRefreshKey((n) => n + 1)} /> : null}
      {studentsError ? <ErrorBlock message={studentsError} onRetry={reloadStudents} /> : null}

      <AdminSection
        title="공부기록 달력"
        description="날짜 칸에 그날 공부한 인원과 시간이 🏫 학원공부(파랑)·🏠 숙제공부(빨강)로 나옵니다. 날짜를 누르면 그날 공부한/안 한 학생과 학원·숙제 일괄 드래곤볼 쏘기를 할 수 있어요."
        actions={
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <button
              type="button"
              aria-label="이전 달"
              className="rounded-lg border border-blue-line px-2 py-1 text-[12px] font-bold text-navy/60 hover:bg-blue-soft"
              onClick={() => setMonth((value) => shiftMonth(value, -1))}
            >
              ‹
            </button>
            <span className="w-[86px] text-center text-[12px] font-extrabold text-navy tabular">{monthLabel(month)}</span>
            <button
              type="button"
              aria-label="다음 달"
              className="rounded-lg border border-blue-line px-2 py-1 text-[12px] font-bold text-navy/60 hover:bg-blue-soft"
              onClick={() => setMonth((value) => shiftMonth(value, 1))}
            >
              ›
            </button>
            <button
              type="button"
              className="ml-0.5 rounded-full bg-blue-soft px-2.5 py-1 text-[11px] font-bold text-navy/60 hover:text-navy"
              onClick={() => setMonth(monthToday.slice(0, 7))}
            >
              이번 달
            </button>
          </div>
        }
      >
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] font-semibold">
          <span className="rounded-full bg-[#EEF4FF] px-2.5 py-1 text-[#1D4A9B] tabular">
            🏫 학원공부 연인원 {monthTotal.academyStudents}명 · {formatMinutes(monthTotal.academyMinutes)}
          </span>
          <span className="rounded-full bg-[#FFF1F0] px-2.5 py-1 text-[#D9382F] tabular">
            🏠 숙제공부 연인원 {monthTotal.homeworkStudents}명 · {formatMinutes(monthTotal.homeworkMinutes)}
          </span>
          <span className="text-navy/35">날짜를 누르면 상세</span>
        </div>

        {monthError ? <ErrorBlock message={monthError} onRetry={() => void loadMonthLogs()} /> : null}
        {studentsLoading || monthLoading ? (
          <LoadingBlock />
        ) : filteredStudents.length === 0 ? (
          <EmptyBlock message="조건에 맞는 학생이 없어요." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-blue-line p-1.5">
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY.map((label, weekday) => (
                <div
                  key={label}
                  className={`pb-1 text-center text-[10px] font-extrabold ${
                    weekday === 0 ? 'text-[#D9382F]' : weekday === 6 ? 'text-[#1D4A9B]' : 'text-navy/45'
                  }`}
                >
                  {label}
                </div>
              ))}
              {calendarCells.map((cell) => {
                const sum = daySums.get(cell.date)
                const future = cell.date > monthToday
                const isToday = cell.date === monthToday
                const weekend = isWeekend(cell.date)
                return (
                  <button
                    key={cell.date}
                    type="button"
                    disabled={future}
                    onClick={() => setDayDate(cell.date)}
                    aria-label={`${cell.date} 상세${
                      sum ? ` · 학원 ${sum.academyStudents}명 ${sum.academyMinutes}분 · 숙제 ${sum.homeworkStudents}명 ${sum.homeworkMinutes}분` : ''
                    }`}
                    className={`flex min-h-[66px] flex-col rounded-lg border px-0.5 pb-1 pt-0.5 text-left transition sm:min-h-[88px] sm:px-1.5 ${
                      cell.inMonth ? 'border-blue-line bg-white' : 'border-blue-line/50 bg-blue-soft/30'
                    } ${future ? 'opacity-40' : 'hover:border-blue-brand hover:bg-blue-soft/60'} ${
                      isToday ? 'ring-2 ring-[#F08C00]' : ''
                    }`}
                  >
                    <span
                      className={`whitespace-nowrap text-[10px] font-extrabold tabular ${
                        cell.inMonth ? (weekend ? (weekdayOf(cell.date) === 0 ? 'text-[#D9382F]' : 'text-[#1D4A9B]') : 'text-navy/70') : 'text-navy/25'
                      }`}
                    >
                      {cell.day}
                      {isToday ? <span className="ml-0.5 hidden text-[8px] font-bold text-[#B07200] sm:inline">오늘</span> : null}
                    </span>
                    {sum ? (
                      <span className="mt-0.5 block min-w-0">
                        {sum.academyStudents > 0 ? (
                          <span className="block whitespace-nowrap text-[8.5px] font-extrabold leading-[1.25] text-[#1D4A9B] sm:text-[10px] sm:leading-[1.1]">
                            🏫 {sum.academyStudents}
                            <span className="hidden sm:inline">명</span>
                            <span className="block whitespace-nowrap text-[7.5px] font-semibold text-[#1D4A9B]/80 sm:ml-1 sm:inline sm:text-[9.5px]">
                              <span className="sm:hidden">{cellTimeText(sum.academyMinutes)}</span>
                              <span className="hidden sm:inline">{formatMinutesCompact(sum.academyMinutes)}</span>
                            </span>
                          </span>
                        ) : null}
                        {sum.homeworkStudents > 0 ? (
                          <span className="mt-1 block whitespace-nowrap text-[8.5px] font-extrabold leading-[1.25] text-[#D9382F] sm:mt-1 sm:text-[10px] sm:leading-[1.1]">
                            🏠 {sum.homeworkStudents}
                            <span className="hidden sm:inline">명</span>
                            <span className="block whitespace-nowrap text-[7.5px] font-semibold text-[#D9382F]/80 sm:ml-1 sm:inline sm:text-[9.5px]">
                              <span className="sm:hidden">{cellTimeText(sum.homeworkMinutes)}</span>
                              <span className="hidden sm:inline">{formatMinutesCompact(sum.homeworkMinutes)}</span>
                            </span>
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-navy/45">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#1D4A9B]" /> 🏫 학원공부 인원·시간
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#D9382F]" /> 🏠 숙제공부 인원·시간
          </span>
          <span>오늘 {monthToday}</span>
        </div>
      </AdminSection>

      <AdminSection title="학생별 요약" description="학년별로 묶어 평균을 보여줘요. 학생마다 🏫 학원 · 🏠 숙제 시간을 따로 보여주고, 이름을 누르면 한 달 추이를 볼 수 있어요.">
        {loading ? (
          <LoadingBlock />
        ) : sections.length === 0 ? (
          <EmptyBlock message="조건에 맞는 학생이 없어요." />
        ) : (
          <div className="space-y-2.5">
            {sections.map((section) => {
              const sectionStats = section.students.map((student) => statById.get(student.id)).filter(Boolean) as StudentStat[]
              const count = sectionStats.length
              const sectionTotals = sumSplits(sectionStats)
              const avgMinutes = count ? sectionStats.reduce((sum, stat) => sum + scopedMinutes(stat, scope), 0) / count : 0
              const avgProblems = count
                ? sectionStats.reduce((sum, stat) => sum + scopedProblems(stat, scope), 0) / count
                : 0
              const problemHeading = scope === 'all' ? '푼 숙제' : scope === 'academy' ? '🏫 푼 숙제' : '🏠 푼 숙제'
              const isCollapsed = Boolean(collapsed[section.grade])
              return (
                <div key={section.grade} className="overflow-hidden rounded-2xl border border-blue-line">
                  <button
                    type="button"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [section.grade]: !prev[section.grade] }))}
                    className="flex w-full items-center justify-between gap-2 bg-blue-soft/70 px-3 py-2 text-left"
                  >
                    <span className="flex items-center gap-2 text-[13px] font-extrabold text-navy">
                      <span
                        className="inline-block transition-transform"
                        style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}
                      >
                        ▸
                      </span>
                      {section.grade}
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-navy/60">{count}명</span>
                    </span>
                    <span className="text-right text-[11px] font-semibold text-navy/55 tabular">
                      {scope === 'all' ? '평균' : `${scopeShortLabel(scope)} 평균`} {formatMinutes(avgMinutes)} ·{' '}
                      푼 숙제 {Math.round(avgProblems)}개
                      <span className="mt-0.5 block text-[10px] font-bold">
                        <span className={scope === 'homework' ? 'text-[#1D4A9B]/30' : 'text-[#1D4A9B]/85'}>
                          🏫 {formatMinutesCompact(count ? sectionTotals.academyMinutes / count : 0)}
                        </span>
                        <span className="text-navy/20"> · </span>
                        <span className={scope === 'academy' ? 'text-[#D9382F]/30' : 'text-[#D9382F]/85'}>
                          🏠 {formatMinutesCompact(count ? sectionTotals.homeworkMinutes / count : 0)}
                        </span>
                      </span>
                    </span>
                  </button>

                  {isCollapsed ? null : (
                    <div className="divide-y divide-blue-line">
                      {/* PC: 학원·숙제를 각각 한 칸으로 나눠 보여준다 */}
                      <div className="hidden grid-cols-[1.3fr_1fr_1fr_1.2fr_0.8fr_0.7fr] gap-1 px-3 py-1 text-[10px] font-semibold text-navy/40 sm:grid">
                        <span>이름</span>
                        <span className="text-right">🏫 학원</span>
                        <span className="text-right">🏠 숙제</span>
                        <span className="text-right">합계</span>
                        <span className="text-right">{problemHeading}</span>
                        <span className="text-right">
                          {scope === 'all' ? '제출' : scope === 'academy' ? '🏫 제출' : '🏠 제출'}
                        </span>
                      </div>
                      {sectionStats.map((stat) => (
                        <div key={stat.student.id}>
                          {/* PC */}
                          <div className="hidden grid-cols-[1.3fr_1fr_1fr_1.2fr_0.8fr_0.7fr] items-center gap-1 px-3 py-1.5 text-[11px] sm:grid">
                            <button
                              type="button"
                              onClick={() => setDetailStudent(stat.student)}
                              className="truncate text-left font-bold text-navy hover:underline"
                            >
                              {stat.student.name}
                            </button>
                            <span className={`text-right font-semibold tabular ${scope === 'homework' ? 'text-[#1D4A9B]/30' : 'text-[#1D4A9B]'}`}>
                              {formatMinutes(stat.academyMinutes)}
                            </span>
                            <span className={`text-right font-semibold tabular ${scope === 'academy' ? 'text-[#D9382F]/30' : 'text-[#D9382F]'}`}>
                              {formatMinutes(stat.homeworkMinutes)}
                            </span>
                            <span className="text-right tabular">
                              <span className="font-bold text-navy">{formatMinutes(scopedMinutes(stat, scope))}</span>
                              <span className="block text-[9px] font-medium text-navy/40">
                                하루{' '}
                                {scopedDays(stat, scope)
                                  ? formatMinutesCompact(scopedMinutes(stat, scope) / scopedDays(stat, scope))
                                  : '—'}
                              </span>
                              {scope === 'all' ? null : (
                                <span className="block text-[9px] font-medium text-navy/35">
                                  합계 {formatMinutesCompact(stat.minutes)}
                                </span>
                              )}
                            </span>
                            <span className={`text-right tabular ${scope === 'all' ? 'text-navy/70' : 'font-bold text-navy'}`}>
                              {scopedProblems(stat, scope)}개
                            </span>
                            <span className="text-right tabular text-navy/50">{scopedDays(stat, scope)}일</span>
                          </div>
                          {/* 스마트폰: 한 줄에 이름·합계, 아래에 학원/숙제 */}
                          <div className="px-3 py-2 sm:hidden">
                            <div className="flex items-baseline justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => setDetailStudent(stat.student)}
                                className="truncate text-left text-[12px] font-bold text-navy"
                              >
                                {stat.student.name}
                              </button>
                              <span className="shrink-0 text-[12px] font-extrabold tabular text-navy">
                                {formatMinutes(scopedMinutes(stat, scope))}
                                {scope === 'all' ? null : (
                                  <span className="ml-1 text-[9px] font-semibold text-navy/40">
                                    합계 {formatMinutesCompact(stat.minutes)}
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] font-semibold tabular">
                              <span className={scope === 'homework' ? 'text-[#1D4A9B]/35' : 'text-[#1D4A9B]/85'}>
                                🏫 학원 {formatMinutesCompact(stat.academyMinutes)}
                              </span>
                              <span className={scope === 'academy' ? 'text-[#D9382F]/35' : 'text-[#D9382F]/85'}>
                                🏠 숙제 {formatMinutesCompact(stat.homeworkMinutes)}
                              </span>
                              <span className="text-navy/40">
                                푼 숙제 {scopedProblems(stat, scope)}개 · {scopedDays(stat, scope)}일
                              </span>
                            </div>
                            <SplitBar
                              academy={stat.academyMinutes}
                              homework={stat.homeworkMinutes}
                              className="mt-1.5"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </AdminSection>

      <AdminSection
        title="학생 비교"
        description={
          scope === 'all'
            ? '기간 동안의 기록을 학생별로 비교해요. 막대는 학원 공부(파랑)와 숙제 공부(빨강)로 나뉘어 쌓입니다.'
            : `${scopeLabel(scope)} 기록만으로 학생을 비교해요. 구분을 바꾸면 학원 공부와 숙제 공부를 따로 비교할 수 있어요.`
        }
        actions={
          <>
            <div className="flex rounded-full bg-blue-soft p-0.5">
              <button
                type="button"
                onClick={() => setMetric('minutes')}
                className={`rounded-full px-3 py-1 text-[11px] font-bold ${metric === 'minutes' ? 'bg-navy text-white' : 'text-navy/50'}`}
              >
                공부시간
              </button>
              <button
                type="button"
                onClick={() => setMetric('problems')}
                className={`rounded-full px-3 py-1 text-[11px] font-bold ${metric === 'problems' ? 'bg-navy text-white' : 'text-navy/50'}`}
              >
                푼 숙제
              </button>
            </div>
            <KindScopeSwitch value={scope} onChange={setScope} label="학생 비교 구분" />
            <button type="button" className="btn-ghost border border-blue-line text-[11px]" onClick={() => setShowAllBars((v) => !v)}>
              {showAllBars ? '상위 15명만' : '모두 보기'}
            </button>
          </>
        }
      >
        {loading ? (
          <LoadingBlock />
        ) : (
          <>
            <HorizontalBars
              items={barItems}
              format={(value) => (metric === 'minutes' ? formatMinutes(value) : `${value}개`)}
              emptyText={scope === 'all' ? '표시할 기록이 없어요' : `${scopeLabel(scope)} 기록이 없어요`}
            />
            {scope === 'all' ? (
              <KindLegend className="mt-3" />
            ) : (
              <p className="mt-3 text-[10px] font-semibold text-navy/45">
                {scope === 'academy' ? '🏫 학원 공부' : '🏠 숙제 공부'} 기록이 있는 학생만 보여줘요.
              </p>
            )}
          </>
        )}
      </AdminSection>

      <AdminSection
        title="미제출 학생"
        description={
          scope === 'all'
            ? '선택한 기간에 기록이 하나도 없는 학생이에요. 아래 숫자로 학원·숙제를 따로 볼 수 있어요.'
            : `선택한 기간에 ${scopeLabel(scope)} 기록이 하나도 없는 학생이에요.`
        }
        actions={
          <>
            <KindScopeSwitch value={scope} onChange={setScope} label="미제출 구분" />
            <div className="flex rounded-full bg-blue-soft p-0.5">
              {(
                [
                  { key: 'today', label: '오늘' },
                  { key: 'week', label: '이번 주' },
                  { key: 'month', label: '이번 달' },
                ] as { key: EmptyPeriod; label: string }[]
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setEmptyPeriod(option.key)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                    emptyPeriod === option.key ? 'bg-navy text-white' : 'text-navy/50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </>
        }
      >
        {loading ? (
          <LoadingBlock />
        ) : (
          <>
            <div className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`rounded-full px-2.5 py-1 ${
                  scope === 'all' ? 'bg-navy text-white' : 'bg-blue-soft text-navy/50'
                }`}
              >
                기록 없음 {missingCounts.all}명
              </button>
              <button
                type="button"
                onClick={() => setScope('academy')}
                className={`rounded-full px-2.5 py-1 ${
                  scope === 'academy' ? 'bg-[#1D4A9B] text-white' : 'bg-blue-soft text-navy/50'
                }`}
              >
                🏫 학원 미제출 {missingCounts.academy}명
              </button>
              <button
                type="button"
                onClick={() => setScope('homework')}
                className={`rounded-full px-2.5 py-1 ${
                  scope === 'homework' ? 'bg-[#E0453E] text-white' : 'bg-[#FFF1F0] text-[#D9382F]/70'
                }`}
              >
                🏠 숙제 미제출 {missingCounts.homework}명
              </button>
            </div>

            {missing.length === 0 ? (
              <EmptyBlock message={scope === 'all' ? '모두 기록을 남겼어요.' : `모두 ${scopeLabel(scope)} 기록이 있어요.`} />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {missing.map((student) => (
                  <span
                    key={student.id}
                    className="rounded-full border border-blue-line px-2.5 py-1 text-[11px] font-semibold text-navy/70"
                  >
                    {student.name}
                    <span className="ml-1 text-[9px] text-navy/35">{student.grade}</span>
                  </span>
                ))}
                {missing.length >= 60 ? <span className="text-[11px] text-navy/40">외 더 있음</span> : null}
              </div>
            )}
          </>
        )}
        <p className="mt-2 text-[10px] text-navy/40">
          {emptyDates.start === emptyDates.end ? emptyDates.start : `${emptyDates.start} ~ ${emptyDates.end}`} 기준
        </p>
      </AdminSection>

      <DayDetailModal
        open={Boolean(dayDate)}
        date={dayDate}
        students={filteredStudents}
        index={monthIndex}
        onClose={() => setDayDate(null)}
        onSent={() => {
          setRefreshKey((n) => n + 1)
          reloadStudents()
        }}
      />

      <StudentDetailModal
        open={Boolean(detailStudent)}
        student={detailStudent}
        endDate={safeEnd}
        onClose={() => setDetailStudent(null)}
        onChanged={() => setRefreshKey((n) => n + 1)}
      />

      <LogEditorModal
        open={Boolean(editingCell)}
        student={editingCell?.student ?? null}
        date={editingCell?.date ?? today}
        log={editingCell?.log ?? null}
        onClose={() => setEditingCell(null)}
        onSaved={() => setRefreshKey((n) => n + 1)}
      />
    </div>
  )
}
