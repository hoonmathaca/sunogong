import { useCallback, useEffect, useMemo, useState } from 'react'
import { downloadTextFile, todayStamp, toCsv } from '../lib/csv'
import { compareName, matchesGradeFilter, normalizeGrade, type GradeFilter } from '../lib/grades'
import * as api from '../lib/api'
import {
  addDays,
  currentMonthKst,
  formatDateShort,
  formatMinutes,
  formatMinutesCompact,
  isWeekend,
  monthRange,
  rangeDates,
  todayKst,
  weekdayOf,
} from '../lib/time'
import {
  buildStats,
  groupByGrade,
  indexLogs,
  sortStudents,
  splitLog,
  studentsWithoutLogs,
  sumSplits,
  type StudentStat,
} from '../lib/stats'
import { KIND_BAR_CLASS } from '../lib/kinds'
import type { Student, StudyLog } from '../lib/types'
import { HorizontalBars, KindLegend, SplitBar } from './Charts'
import { LogEditorModal } from './LogEditorModal'
import { StudentDetailModal } from './StudentDetailModal'
import {
  AdminSection,
  EmptyBlock,
  ErrorBlock,
  GradeFilterSelect,
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
  const [showAllBars, setShowAllBars] = useState(false)
  const [emptyPeriod, setEmptyPeriod] = useState<EmptyPeriod>('today')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [detailStudent, setDetailStudent] = useState<Student | null>(null)
  const [editingCell, setEditingCell] = useState<{ student: Student; date: string; log: StudyLog | null } | null>(null)

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

  const dates = useMemo(() => rangeDates(safeStart, safeEnd), [safeStart, safeEnd])
  const index = useMemo(() => indexLogs(logs), [logs])
  const filteredStudents = useMemo(
    () => sortStudents(students.filter((student) => matchesGradeFilter(normalizeGrade(student.grade), grade))),
    [students, grade],
  )
  const stats = useMemo(() => buildStats(filteredStudents, index, safeStart, safeEnd), [filteredStudents, index, safeStart, safeEnd])
  const statById = useMemo(() => new Map(stats.map((stat) => [stat.student.id, stat])), [stats])

  const totals = useMemo(() => sumSplits(stats), [stats])
  const totalMinutes = totals.minutes
  const totalProblems = totals.problems
  const submittedStudents = stats.filter((stat) => stat.submittedDays > 0).length
  const maxMinutes = Math.max(1, ...stats.map((stat) => stat.minutes))

  const emptyDates = useMemo(() => {
    if (emptyPeriod === 'today') return { start: today, end: today }
    if (emptyPeriod === 'week') {
      const weekday = weekdayOf(today)
      const offset = weekday === 0 ? 6 : weekday - 1
      return { start: addDays(today, -offset), end: today }
    }
    return monthRange(currentMonthKst())
  }, [emptyPeriod, today])

  const missing = useMemo(
    () => studentsWithoutLogs(filteredStudents, index, emptyDates.start, emptyDates.end).slice(0, 60),
    [filteredStudents, index, emptyDates],
  )

  const sections = useMemo(() => groupByGrade(filteredStudents), [filteredStudents])

  const barItems = useMemo(() => {
    const sorted = [...stats].sort((a, b) => {
      const diff = metric === 'minutes' ? b.minutes - a.minutes : b.problems - a.problems
      return diff !== 0 ? diff : compareName(a.student.name, b.student.name)
    })
    const list = showAllBars ? sorted : sorted.slice(0, 15)
    return list.map((stat) => ({
      key: stat.student.id,
      label: stat.student.name,
      sublabel: stat.student.grade.replace('미지정', '—'),
      value: metric === 'minutes' ? stat.minutes : stat.problems,
      segments: [
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
      ],
    }))
  }, [stats, metric, showAllBars])

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
        '학원 문제',
        '숙제 문제',
        '푼 문제 수',
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
        header.push(`${date} 공부(분)`, `${date} 문제`)
      }
      header.push('합계(분)', '학원 공부(분)', '숙제 공부(분)', '합계 문제', '학원 문제', '숙제 문제')
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

  const cellColor = (minutes: number): string => {
    if (minutes <= 0) return 'transparent'
    const alpha = 0.14 + 0.78 * Math.min(1, minutes / Math.max(60, maxMinutes))
    return `rgba(18, 41, 107, ${alpha.toFixed(3)})`
  }

  return (
    <div className="space-y-4">
      <AdminSection
        title="조회 조건"
        description="기간과 학년을 바꾸면 표와 그래프에 함께 적용돼요."
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
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <GradeFilterSelect value={grade} onChange={setGrade} />
        </div>
      </AdminSection>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="학생" value={`${filteredStudents.length}명`} sub={`기록 있음 ${submittedStudents}명`} tone="navy" />
        <StatCard label="총 공부시간" value={formatMinutes(totalMinutes)} sub={`${safeStart} ~ ${safeEnd}`} />
        <StatCard
          label="🏫 학원 공부"
          value={formatMinutes(totals.academyMinutes)}
          sub={`문제 ${totals.academyProblems}개`}
          tone="academy"
        />
        <StatCard
          label="🏠 숙제 공부"
          value={formatMinutes(totals.homeworkMinutes)}
          sub={`문제 ${totals.homeworkProblems}개`}
          tone="homework"
        />
        <StatCard label="총 푼 문제" value={`${totalProblems}개`} sub={filteredStudents.length ? `1인당 ${Math.round(totalProblems / filteredStudents.length)}개` : undefined} />
        <StatCard
          label="1인당 평균"
          value={formatMinutes(filteredStudents.length ? totalMinutes / filteredStudents.length : 0)}
          sub="기간 전체"
        />
      </div>

      {error ? <ErrorBlock message={error} onRetry={() => setRefreshKey((n) => n + 1)} /> : null}
      {studentsError ? <ErrorBlock message={studentsError} onRetry={reloadStudents} /> : null}

      <AdminSection
        title="학생 × 날짜 표"
        description="칸을 누르면 그 날 기록을 고칠 수 있어요. 시간이 길수록 진하게 표시되고, 칸 아래 막대는 학원·숙제 비율이에요."
      >
        {studentsLoading || loading ? (
          <LoadingBlock />
        ) : filteredStudents.length === 0 ? (
          <EmptyBlock message="조건에 맞는 학생이 없어요." />
        ) : (
          <div className="max-h-[66vh] overflow-auto rounded-xl border border-blue-line">
            <table className="border-collapse text-[10px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="sticky left-0 z-20 min-w-[96px] border-b border-r border-blue-line bg-white px-2 py-1.5 text-left text-[11px] font-bold text-navy">
                    학생
                  </th>
                  {dates.map((date) => (
                    <th
                      key={date}
                      className={`border-b border-blue-line px-0.5 py-1 text-center font-bold ${
                        isWeekend(date) ? 'bg-blue-soft text-blue-brand' : 'bg-white text-navy/60'
                      }`}
                    >
                      <div className="tabular">{formatDateShort(date)}</div>
                      <div className="text-[9px] font-medium opacity-60">{WEEKDAY[weekdayOf(date)]}</div>
                    </th>
                  ))}
                  <th className="sticky right-0 z-20 border-b border-l border-blue-line bg-white px-2 py-1.5 text-right text-[11px] font-bold text-navy">
                    합계
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.map((stat) => (
                  <tr key={stat.student.id} className="group">
                    <th className="sticky left-0 z-10 border-b border-r border-blue-line bg-white px-2 py-1 text-left">
                      <button
                        type="button"
                        onClick={() => setDetailStudent(stat.student)}
                        className="text-[11px] font-bold text-navy hover:underline"
                      >
                        {stat.student.name}
                      </button>
                      <span className="ml-1 text-[9px] font-medium text-navy/40">{stat.student.grade}</span>
                    </th>
                    {dates.map((date) => {
                      const log = stat.byDate.get(date)
                      const split = splitLog(log)
                      const weekend = isWeekend(date)
                      return (
                        <td key={date} className={`border-b border-blue-line p-0 text-center ${weekend && !log ? 'bg-blue-soft/60' : ''}`}>
                          <button
                            type="button"
                            onClick={() => setEditingCell({ student: stat.student, date, log: log ?? null })}
                            title={`${stat.student.name} ${date}${
                              log
                                ? ` · ${formatMinutes(log.minutes)} · ${log.problems}문제` +
                                  ((log.academy_minutes ?? 0) > 0 || (log.homework_minutes ?? 0) > 0
                                    ? ` (🏫 ${log.academy_minutes ?? 0}분 · 🏠 ${log.homework_minutes ?? 0}분)`
                                    : '')
                                : ' · 기록 없음'
                            }`}
                            className={`flex h-[42px] w-[46px] flex-col items-center justify-center transition hover:outline hover:outline-1 hover:outline-blue-brand ${
                              log ? 'text-white' : 'text-navy/25'
                            }`}
                            style={{ backgroundColor: log ? cellColor(log.minutes) : weekend ? 'transparent' : '#F3F4F6' }}
                          >
                            {log ? (
                              <>
                                <span className="text-[10px] font-bold leading-tight tabular">{log.minutes}분</span>
                                <span className="text-[9px] leading-tight opacity-85 tabular">{log.problems}문제</span>
                                {split.homeworkMinutes > 0 ? (
                                  <SplitBar
                                    academy={split.academyMinutes}
                                    homework={split.homeworkMinutes}
                                    className="mt-0.5 w-[30px]"
                                    trackClass="bg-white/30"
                                    academyClass="bg-white"
                                    homeworkClass="bg-[#B9A6DE]"
                                  />
                                ) : null}
                              </>
                            ) : (
                              <span className="text-[11px]">·</span>
                            )}
                          </button>
                        </td>
                      )
                    })}
                    <td className="sticky right-0 z-10 min-w-[92px] whitespace-nowrap border-b border-l border-blue-line bg-white px-2 py-1 text-right tabular">
                      <span className="block text-[10px] font-bold text-navy">{formatMinutes(stat.minutes)}</span>
                      {stat.academyMinutes + stat.homeworkMinutes > 0 ? (
                        <>
                          <span className="block text-[9px] font-semibold text-navy/55">
                            🏫 {formatMinutesCompact(stat.academyMinutes)}
                          </span>
                          <span className="block text-[9px] font-semibold text-[#5B2FC0]/85">
                            🏠 {formatMinutesCompact(stat.homeworkMinutes)}
                          </span>
                        </>
                      ) : null}
                      {stat.otherMinutes > 0 ? (
                        <span className="block text-[9px] font-medium text-navy/35">직접 수정 {stat.otherMinutes}분</span>
                      ) : null}
                      <span className="block text-[9px] font-medium text-navy/40">{stat.problems}문제</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <KindLegend className="mt-2.5" />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-navy/45">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: 'rgba(18,41,107,0.2)' }} /> 짧게
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: 'rgba(18,41,107,0.9)' }} /> 길게
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: '#F3F4F6' }} /> 미제출
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-blue-soft ring-1 ring-blue-line" /> 주말
          </span>
        </div>
      </AdminSection>

      <AdminSection title="학생별 요약" description="학년별로 묶어 평균을 보여줘요. 이름을 누르면 한 달 추이를 볼 수 있어요.">
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
              const avgMinutes = count ? sectionTotals.minutes / count : 0
              const avgProblems = count ? sectionTotals.problems / count : 0
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
                      평균 {formatMinutes(avgMinutes)} · {Math.round(avgProblems)}문제
                      <span className="mt-0.5 block text-[10px] font-bold">
                        <span className="text-navy/60">🏫 {formatMinutesCompact(count ? sectionTotals.academyMinutes / count : 0)}</span>
                        <span className="text-navy/20"> · </span>
                        <span className="text-[#5B2FC0]/85">🏠 {formatMinutesCompact(count ? sectionTotals.homeworkMinutes / count : 0)}</span>
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
                        <span className="text-right">문제</span>
                        <span className="text-right">제출</span>
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
                            <span className="text-right font-semibold tabular text-navy/80">
                              {formatMinutes(stat.academyMinutes)}
                            </span>
                            <span className="text-right font-semibold tabular text-[#5B2FC0]">
                              {formatMinutes(stat.homeworkMinutes)}
                            </span>
                            <span className="text-right tabular">
                              <span className="font-bold text-navy">{formatMinutes(stat.minutes)}</span>
                              <span className="block text-[9px] font-medium text-navy/40">
                                하루 {stat.submittedDays ? formatMinutesCompact(stat.minutes / stat.submittedDays) : '—'}
                              </span>
                            </span>
                            <span className="text-right tabular text-navy/70">{stat.problems}개</span>
                            <span className="text-right tabular text-navy/50">{stat.submittedDays}일</span>
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
                                {formatMinutes(stat.minutes)}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] font-semibold tabular">
                              <span className="text-navy/75">🏫 학원 {formatMinutesCompact(stat.academyMinutes)}</span>
                              <span className="text-[#5B2FC0]/85">🏠 숙제 {formatMinutesCompact(stat.homeworkMinutes)}</span>
                              <span className="text-navy/40">
                                {stat.problems}문제 · {stat.submittedDays}일
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
        description="기간 동안의 기록을 학생별로 비교해요. 막대는 학원 공부(남색)와 숙제 공부(보라색)로 나뉘어 쌓입니다."
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
                문제수
              </button>
            </div>
            <button type="button" className="btn-ghost border border-blue-line text-[11px]" onClick={() => setShowAllBars((v) => !v)}>
              {showAllBars ? '상위 15명만' : '전체 보기'}
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
            />
            <KindLegend className="mt-3" />
          </>
        )}
      </AdminSection>

      <AdminSection
        title="미제출 학생"
        description="선택한 기간에 기록이 하나도 없는 학생이에요."
        actions={
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
        }
      >
        {loading ? (
          <LoadingBlock />
        ) : missing.length === 0 ? (
          <EmptyBlock message="모두 기록을 남겼어요." />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {missing.map((student) => (
              <span key={student.id} className="rounded-full border border-blue-line px-2.5 py-1 text-[11px] font-semibold text-navy/70">
                {student.name}
                <span className="ml-1 text-[9px] text-navy/35">{student.grade}</span>
              </span>
            ))}
            {missing.length >= 60 ? <span className="text-[11px] text-navy/40">외 더 있음</span> : null}
          </div>
        )}
        <p className="mt-2 text-[10px] text-navy/40">
          {emptyDates.start === emptyDates.end ? emptyDates.start : `${emptyDates.start} ~ ${emptyDates.end}`} 기준
        </p>
      </AdminSection>

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
