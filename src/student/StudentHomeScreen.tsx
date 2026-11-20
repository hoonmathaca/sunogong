import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrandFooter, Mascot } from '../components/Brand'
import { Spinner } from '../components/Keypad'
import * as api from '../lib/api'
import { KIND_BAR_CLASS, KIND_EMOJI, KIND_LABEL, KIND_TEXT_CLASS, type SessionKind } from '../lib/kinds'
import { splitLog, splitPercents } from '../lib/stats'
import { addDays, formatDateKo, formatMinutes, formatMinutesCompact, todayKst, weekdayOf } from '../lib/time'
import type { Student, StudyLog } from '../lib/types'

interface StudentHomeScreenProps {
  student: Student
  onStart: (kind: SessionKind) => void
  onExit: () => void
  /** '선오공에게 질문하기' 화면 열기 */
  onQuestions: () => void
  /** 아직 열지 않은 답변 수 (배지) */
  unreadAnswers?: number
  busy?: boolean
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
const PERIODS = [7, 30] as const
type Period = (typeof PERIODS)[number]

/** 학생 홈: 오늘 누적(학원/숙제 따로), 기간별 그래프, 공부 시작 */
export function StudentHomeScreen({
  student,
  onStart,
  onExit,
  onQuestions,
  unreadAnswers = 0,
  busy = false,
}: StudentHomeScreenProps): JSX.Element {
  const [logs, setLogs] = useState<StudyLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>(7)
  const listRef = useRef<HTMLUListElement | null>(null)

  const today = todayKst()
  // 30일치를 한 번에 받아 두고, 기간(7일/30일)만 바꿔서 보여준다
  const loadStart = addDays(today, -29)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await api.listStudentLogs(student.id, loadStart, today)
    if (res.ok) {
      setLogs(res.data)
      setError(null)
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [student.id, loadStart, today])

  useEffect(() => {
    void load()
  }, [load])

  const periodStart = addDays(today, -(period - 1))

  const days = useMemo(
    () =>
      Array.from({ length: period }, (_, index) => {
        const date = addDays(periodStart, index)
        const log = logs.find((item) => item.date === date)
        return { date, log }
      }),
    [logs, period, periodStart],
  )

  const totals = useMemo(() => {
    return logs
      .filter((log) => log.date >= periodStart && log.date <= today)
      .reduce(
        (acc, log) => {
          const split = splitLog(log)
          return {
            minutes: acc.minutes + (log.minutes ?? 0),
            problems: acc.problems + (log.problems ?? 0),
            academy: acc.academy + split.academyMinutes,
            homework: acc.homework + split.homeworkMinutes,
            academyProblems: acc.academyProblems + split.academyProblems,
            homeworkProblems: acc.homeworkProblems + split.homeworkProblems,
          }
        },
        { minutes: 0, problems: 0, academy: 0, homework: 0, academyProblems: 0, homeworkProblems: 0 },
      )
  }, [logs, periodStart, today])

  const todayLog = logs.find((item) => item.date === today)
  const todaySplit = splitLog(todayLog)
  const weekMinutes = logs
    .filter((log) => log.date >= addDays(today, -6))
    .reduce((sum, item) => sum + (item.minutes ?? 0), 0)
  const maxMinutes = Math.max(30, ...days.map((day) => day.log?.minutes ?? 0))
  const percents = splitPercents(totals.academy, totals.homework)
  const hasSplit = totals.academy + totals.homework > 0

  /* 30일은 상자가 넘쳐서, 열 때 가장 최근(맨 아래)이 보이게 */
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [period, loading])

  return (
    <div className="screen bg-gradient-to-b from-blue-soft/70 to-white">
      <div className="flex-1 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <header className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <Mascot variant="full" className="h-11 w-11 shrink-0" />
            <div>
              <h1 className="font-round text-[24px] font-extrabold leading-none text-navy">선오공</h1>
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
          <div className="mt-2 flex flex-wrap gap-1.5 text-[12px] font-bold">
            <span className="rounded-full bg-white/12 px-2.5 py-1">
              {KIND_EMOJI.academy} {KIND_LABEL.academy} {formatMinutes(todaySplit.academyMinutes)}
            </span>
            <span className="rounded-full bg-[#6D3BD6]/45 px-2.5 py-1">
              {KIND_EMOJI.homework} {KIND_LABEL.homework} {formatMinutes(todaySplit.homeworkMinutes)}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[13px] text-white/70">
            <span className="rounded-full bg-white/10 px-2.5 py-1">푼 문제 {todayLog?.problems ?? 0}개</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1">이번 주 {formatMinutes(weekMinutes)}</span>
          </div>
        </section>

        <section className="mt-4 card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold text-navy">공부 기록</h2>
            <div className="flex rounded-full bg-blue-soft p-0.5" role="group" aria-label="기간 선택">
              {PERIODS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={period === option}
                  onClick={() => setPeriod(option)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                    period === option ? 'bg-navy text-white' : 'text-navy/50'
                  }`}
                >
                  최근 {option}일
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner className="h-6 w-6 border-navy/20 border-t-navy" />
            </div>
          ) : (
            <>
              {/* 인바디처럼 한 줄로 보는 학원·숙제 비율 */}
              <div className="mt-3 rounded-2xl bg-blue-soft/70 px-3.5 py-3">
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold text-navy/45">최근 {period}일 합계</p>
                    <p className="mt-0.5 text-[22px] font-extrabold leading-none text-navy tabular">
                      {formatMinutesCompact(totals.minutes)}
                    </p>
                  </div>
                  <div className="text-right text-[11px] font-bold tabular">
                    <p className={KIND_TEXT_CLASS.academy}>
                      {KIND_EMOJI.academy} {formatMinutesCompact(totals.academy)}
                      <span className="ml-1 text-[10px] font-semibold opacity-70">{percents.academy}%</span>
                    </p>
                    <p className={`mt-0.5 ${KIND_TEXT_CLASS.homework}`}>
                      {KIND_EMOJI.homework} {formatMinutesCompact(totals.homework)}
                      <span className="ml-1 text-[10px] font-semibold opacity-70">{percents.homework}%</span>
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-white">
                  {hasSplit ? (
                    <>
                      {percents.academy > 0 ? (
                        <span
                          className={`block h-full ${KIND_BAR_CLASS.academy}`}
                          style={{ width: `${percents.academy}%` }}
                        />
                      ) : null}
                      {percents.homework > 0 ? (
                        <span
                          className={`block h-full ${KIND_BAR_CLASS.homework}`}
                          style={{ width: `${percents.homework}%` }}
                        />
                      ) : null}
                    </>
                  ) : null}
                </div>
                <p className="mt-1.5 text-[10px] font-semibold text-navy/35">
                  {hasSplit
                    ? `푼 문제 ${totals.problems}개 · ${formatDateKo(periodStart)} ~ ${formatDateKo(today)}`
                    : '아직 이 기간 기록이 없어요. 공부를 시작해 볼까요?'}
                </p>
              </div>

              <ul
                ref={listRef}
                className={`mt-3 space-y-1.5 ${period === 30 ? 'max-h-[248px] overflow-y-auto pr-1' : ''}`}
              >
                {days.map(({ date, log }) => {
                  const split = splitLog(log)
                  const minutes = log?.minutes ?? 0
                  const width = minutes > 0 ? Math.max(6, Math.round((minutes / maxMinutes) * 100)) : 0
                  const academyShare = minutes > 0 ? (split.academyMinutes / minutes) * 100 : 0
                  const isToday = date === today
                  return (
                    <li key={date} className="flex items-center gap-2 text-[12px]">
                      <span
                        className={`w-[62px] shrink-0 whitespace-nowrap text-[11px] font-semibold tabular ${
                          isToday ? 'text-navy' : weekdayOf(date) === 0 ? 'text-red-400' : 'text-navy/45'
                        }`}
                      >
                        {Number(date.slice(5, 7))}/{Number(date.slice(8, 10))} ({WEEKDAY[weekdayOf(date)]})
                      </span>
                      <span className="h-3 flex-1 overflow-hidden rounded-full bg-blue-soft">
                        {width > 0 ? (
                          <span className="flex h-full overflow-hidden rounded-full" style={{ width: `${width}%` }}>
                            {split.academyMinutes > 0 ? (
                              <span className={`block h-full ${KIND_BAR_CLASS.academy}`} style={{ width: `${academyShare}%` }} />
                            ) : null}
                            {split.homeworkMinutes > 0 ? (
                              <span
                                className={`block h-full ${KIND_BAR_CLASS.homework}`}
                                style={{ width: `${100 - academyShare}%` }}
                              />
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                      <span className={`w-14 shrink-0 text-right font-semibold tabular ${log ? 'text-navy' : 'text-navy/25'}`}>
                        {log ? formatMinutesCompact(minutes) : '—'}
                      </span>
                      <span className="w-9 shrink-0 text-right text-[11px] tabular text-navy/40">
                        {log ? `${log.problems}개` : ''}
                      </span>
                    </li>
                  )
                })}
              </ul>

              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[10px] font-semibold text-navy/45">
                <span className={`flex items-center gap-1 ${KIND_TEXT_CLASS.academy}`}>
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${KIND_BAR_CLASS.academy}`} />
                  {KIND_LABEL.academy}
                </span>
                <span className={`flex items-center gap-1 ${KIND_TEXT_CLASS.homework}`}>
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${KIND_BAR_CLASS.homework}`} />
                  {KIND_LABEL.homework}
                </span>
              </div>
            </>
          )}

          <p className="mt-2 text-[11px] text-navy/35">{formatDateKo(today)} 기준</p>
        </section>

        {/* 선오공에게 질문하기 — 홈에서 바로 들어간다. 새 답변이 있으면 배지 */}
        <button
          type="button"
          onClick={onQuestions}
          className="mt-4 flex w-full items-center gap-3 rounded-3xl border border-[#6D3BD6]/15 bg-[#F5F0FF] px-4 py-3.5 text-left shadow-card transition active:scale-[0.99]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[20px] shadow-sm" aria-hidden="true">
            💬
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="font-round text-[15px] font-extrabold text-[#4A28A0]">선오공에게 질문하기</span>
              {unreadAnswers > 0 ? (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white tabular">
                  새 답변 {unreadAnswers}
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block text-[11.5px] font-semibold text-[#5B2FC0]/65">
              문제 사진을 올리면 선오공이가 답해줘요
            </span>
          </span>
          <span className="shrink-0 text-[20px] leading-none text-[#6D3BD6]/40" aria-hidden="true">
            ›
          </span>
        </button>

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
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onStart('academy')}
            disabled={busy}
            className="btn-navy h-[54px] w-full text-lg"
          >
            {busy ? <Spinner className="h-5 w-5 border-white/40 border-t-white" /> : `${KIND_EMOJI.academy} ${KIND_LABEL.academy} 시작`}
          </button>
          <button
            type="button"
            onClick={() => onStart('homework')}
            disabled={busy}
            className="h-[54px] w-full rounded-2xl bg-[#6D3BD6] text-lg font-bold text-white shadow-soft transition active:opacity-90 disabled:opacity-60"
          >
            {busy ? <Spinner className="h-5 w-5 border-white/40 border-t-white" /> : `${KIND_EMOJI.homework} ${KIND_LABEL.homework} 시작`}
          </button>
          <p className="text-center text-[11px] font-semibold text-navy/40">
            🏠 숙제 공부는 화면을 끄거나 나가면 멈춰요
          </p>
        </div>
      </div>

      <BrandFooter />
    </div>
  )
}
