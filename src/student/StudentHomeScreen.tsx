import { useCallback, useEffect, useMemo, useState } from 'react'
import { BrandFooter, Mascot } from '../components/Brand'
import { Spinner } from '../components/Keypad'
import * as api from '../lib/api'
import { KIND_BAR_CLASS, KIND_EMOJI, KIND_LABEL, KIND_TEXT_CLASS, type SessionKind } from '../lib/kinds'
import {
  countPending,
} from '../lib/homeworkBoard'
import * as homeworkApi from '../lib/homework'
import {
  ANSWER_BANNER_ACTION,
  ANSWER_BANNER_CONFIRM,
  ANSWER_BANNER_TITLE,
  answerBannerCountText,
  answerBannerQuestionLine,
} from '../lib/questionBoard'
import { splitLog, splitPercents } from '../lib/stats'
import { hasTodayAcademy } from '../lib/problemsEdit'
import { buildDayViews, defaultSelectedDate } from '../lib/studentCalendar'
import { addDays, currentMonthKst, formatDateKo, formatMinutes, formatMinutesCompact, monthRange, todayKst } from '../lib/time'
import type { HomeworkSubmission, Student, StudyLog, StudentDayRecord, StudyQuestion } from '../lib/types'
import { EditAcademyProblemsModal } from './EditAcademyProblemsModal'
import { HomeworkSubmissionRow } from './HomeworkSubmissionRow'
import { LiveKintounCard } from './LiveKintounCard'
import { StudentStudyCalendar } from './StudentStudyCalendar'

interface StudentHomeScreenProps {
  student: Student
  onStart: (kind: SessionKind) => void
  onExit: () => void
  /** '선오공에게 질문하기' 화면 열기 */
  onQuestions: () => void
  /** 아직 열지 않은 답변 수 (배지) */
  unreadAnswers?: number
  /** 가장 최근에 달린 안 읽은 답변 — 있으면 홈 맨 위에 알림 배너를 띄운다 (2026-11-28) */
  unreadAnswer?: StudyQuestion | null
  /** 배너 '답변 보기' — 그 질문을 펼쳐 보여 준다 */
  onOpenAnswer?: (questionId: string) => void
  /** 배너 '확인했어요' — 알림만 닫고 읽음으로 남긴다 */
  onConfirmAnswer?: () => void
  /** 자동 종료된 공부 중 문제 수를 아직 넣지 않은 건수 */
  pendingProblems?: number
  /** 그중 숙제 공부가 있는지 (카드 문구) */
  pendingHomework?: boolean
  /** '지난번 푼 문제 수' 창 다시 열기 */
  onPendingProblems?: () => void
  /** 지난 공부를 마저 내면 홈 목록을 다시 읽는다 (값이 바뀌면 새로 불러옴) */
  refreshKey?: number
  /** 학원 등원 중(훈출이 연 학원 세션이 진행 중) — 숙제 공부를 시작할 수 없다 (2026-11-28) */
  academyActive?: boolean
  busy?: boolean
}

const PERIODS = [7, 30] as const
type Period = (typeof PERIODS)[number]

/** 학생 홈: 오늘 누적(학원/숙제 따로), 기간별 그래프, 공부 시작 */
export function StudentHomeScreen({
  student,
  onStart,
  onExit,
  onQuestions,
  unreadAnswers = 0,
  unreadAnswer = null,
  onOpenAnswer,
  onConfirmAnswer,
  pendingProblems = 0,
  pendingHomework = false,
  onPendingProblems,
  refreshKey = 0,
  academyActive = false,
  busy = false,
}: StudentHomeScreenProps): JSX.Element {
  const [logs, setLogs] = useState<StudyLog[]>([])
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>(7)
  const [editProblemsOpen, setEditProblemsOpen] = useState(false)
  /* 문제 수를 고친 뒤 잠깐 보여 주는 안내 */
  const [savedProblems, setSavedProblems] = useState<number | null>(null)
  /* 공부 기록 달력 — 보고 있는 달, 그 달 날짜별 값, 고른 날 (2026-11-28) */
  const [month, setMonth] = useState<string>(() => currentMonthKst())
  const [dayRecords, setDayRecords] = useState<StudentDayRecord[]>([])
  const [dayRecordsLoading, setDayRecordsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(() => todayKst())

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
    // 숙제 제출 상태(승인 대기·승인·반려) — 기능이 아직 없어도 홈은 그대로
    const submitted = await homeworkApi.listMyHomeworkSubmissions(student.id, 30)
    if (submitted.ok) setSubmissions(submitted.data ?? [])
    setLoading(false)
  }, [student.id, loadStart, today])

  useEffect(() => {
    void load()
    // refreshKey — 지난 공부를 마저 내면 그 자리에서 목록을 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshKey])

  const periodStart = addDays(today, -(period - 1))

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
  /* 오늘 학원 공부 기록이 있으면 학생이 문제 수를 직접 고칠 수 있다 */
  const todaySplit = splitLog(todayLog)
  const canEditProblems = hasTodayAcademy(todaySplit)
  const recentSubmissions = submissions.slice(0, 5)
  const waitingSubmissions = countPending(submissions)
  const weekMinutes = logs
    .filter((log) => log.date >= addDays(today, -6))
    .reduce((sum, item) => sum + (item.minutes ?? 0), 0)
  const percents = splitPercents(totals.academy, totals.homework)
  const hasSplit = totals.academy + totals.homework > 0

  /* 달력에서 그릴 날짜별 값 — DB 함수 값(등·하원 포함)이 있으면 그것을, 없으면 공부 기록을 쓴다 */
  const dayViews = useMemo(() => buildDayViews(dayRecords, logs), [dayRecords, logs])

  /* 보고 있는 달의 날짜별 등·하원·공부 기록 (한 달에 한 번) */
  const loadMonth = useCallback(async () => {
    const { start, end } = monthRange(month)
    setDayRecordsLoading(true)
    const res = await api.studentDayRecords(student.id, start, end)
    if (res.ok) {
      setDayRecords(res.data ?? [])
    } else {
      // 함수가 아직 없는 DB(마이그레이션 전)에서도 달력은 공부 기록만으로 그린다
      console.warn('[sunogong] student_day_records:', res.error)
      setDayRecords([])
    }
    setDayRecordsLoading(false)
  }, [month, student.id])

  useEffect(() => {
    void loadMonth()
    // refreshKey — 지난 공부를 마저 내면 달력도 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMonth, refreshKey])

  /* 달을 바꾸면 그 달에서 볼 날짜를 다시 고른다 (이번 달 → 오늘, 지난 달 → 마지막 날) */
  useEffect(() => {
    setSelectedDate((prev) => (prev && prev.slice(0, 7) === month ? prev : defaultSelectedDate(month, today)))
  }, [month, today])

  /* 저장 안내는 5초 뒤 사라진다 */
  useEffect(() => {
    if (savedProblems === null) return undefined
    const timer = window.setTimeout(() => setSavedProblems(null), 5000)
    return () => window.clearTimeout(timer)
  }, [savedProblems])

  return (
    <div className="screen bg-gradient-to-b from-blue-soft/70 to-white">
      <div className="flex-1 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <header className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <Mascot variant="face" className="h-11 w-11 shrink-0" />
            <div>
              <h1 className="font-round text-[24px] font-extrabold leading-none text-navy">선오공</h1>
              <p className="mt-1 text-[12px] font-semibold text-navy/50">선생님, 오늘도 공부했어요!</p>
            </div>
          </div>
          <button type="button" onClick={onExit} className="btn-ghost px-2 py-1 text-[12px]">
            나가기
          </button>
        </header>

        {/* 선생님 답변이 도착하면 로그인 직후 맨 위에서 바로 알린다 (2026-11-28) */}
        {unreadAnswer ? (
          <section
            aria-label="선생님 답변 알림"
            data-answer-banner="true"
            className="mt-4 overflow-hidden rounded-3xl border-2 border-[#6D3BD6]/30 bg-gradient-to-br from-[#F5F0FF] to-[#EADDFF] px-4 py-3.5 shadow-card"
          >
            <div className="flex items-start gap-2.5">
              <span
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[20px] shadow-sm"
                aria-hidden="true"
              >
                💬
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 font-round text-[15px] font-extrabold leading-snug text-[#4A28A0]">
                  {ANSWER_BANNER_TITLE}
                  {unreadAnswers > 1 ? (
                    <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white tabular">
                      {answerBannerCountText(unreadAnswers)}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 line-clamp-2 break-keep text-[12px] font-semibold leading-snug text-[#5B2FC0]/75">
                  {answerBannerQuestionLine(unreadAnswer)}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenAnswer?.(unreadAnswer.id)}
                    className="rounded-full bg-[#4A28A0] px-4 py-1.5 text-[12px] font-bold text-white shadow-sm transition active:scale-[0.98]"
                  >
                    {ANSWER_BANNER_ACTION}
                  </button>
                  <button
                    type="button"
                    onClick={() => onConfirmAnswer?.()}
                    className="rounded-full border border-[#4A28A0]/25 bg-white/70 px-3 py-1.5 text-[11.5px] font-bold text-[#4A28A0]/80 transition active:scale-[0.98]"
                  >
                    {ANSWER_BANNER_CONFIRM}
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

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
            <span className="rounded-full bg-[#E0453E]/60 px-2.5 py-1">
              {KIND_EMOJI.homework} {KIND_LABEL.homework} {formatMinutes(todaySplit.homeworkMinutes)}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[13px] text-white/70">
            <span className="rounded-full bg-white/10 px-2.5 py-1">푼 문제 {todayLog?.problems ?? 0}개</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1">이번 주 {formatMinutes(weekMinutes)}</span>
          </div>
          {/* 오늘 학원 공부를 했으면 학생이 문제 수를 직접 고칠 수 있다 (숙제 문제 수는 승인 대상) */}
          {canEditProblems || savedProblems !== null ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {canEditProblems ? (
                <button
                  type="button"
                  onClick={() => setEditProblemsOpen(true)}
                  className="rounded-full border border-white/25 px-2.5 py-1 text-[11.5px] font-bold text-white/90 transition active:scale-[0.98]"
                >
                  ✏️ 문제 수 수정
                </button>
              ) : null}
              {savedProblems !== null ? (
                <span className="text-[11px] font-semibold text-white/60">
                  오늘 학원 문제 수를 {savedProblems}개로 바꿨어요
                </span>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* 쉬는 시간이 길어 자동으로 마무리된 공부 — 문제 수를 아직 넣지 않았으면 여기서 들어간다 */}
        {pendingProblems > 0 && onPendingProblems ? (
          <button
            type="button"
            onClick={onPendingProblems}
            className="mt-3 flex w-full items-center gap-3 rounded-3xl border border-[#E9A400]/35 bg-[#FFF6DA] px-4 py-3 text-left shadow-card transition active:scale-[0.99]"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[18px] shadow-sm"
              aria-hidden="true"
            >
              ✏️
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-round text-[14.5px] font-extrabold text-[#7A5B00]">
                  {pendingHomework ? '지난 숙제 공부 제출' : '지난번 푼 문제 수'}
                </span>
                <span className="rounded-full bg-[#E9A400] px-2 py-0.5 text-[10px] font-bold text-white tabular">
                  {`${pendingProblems}개`}
                </span>
              </span>
              <span className="mt-0.5 block text-[11.5px] font-semibold text-[#8A6A00]/70">
                {pendingHomework
                  ? '자동으로 마무리된 숙제가 있어요 · 사진과 문제 수 올리기'
                  : '자동으로 마무리된 공부가 있어요 · 눌러서 입력'}
              </span>
            </span>
            <span className="shrink-0 text-[20px] leading-none text-[#B8860B]/50" aria-hidden="true">
              ›
            </span>
          </button>
        ) : null}

        {/* 근두운 — 지금 공부 중인 친구들과 내 드래곤볼 */}
        <LiveKintounCard studentId={student.id} />

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

              {/* 달력에서 날짜를 누르면 그날 등·하원과 학원·숙제 기록이 보인다 */}
              <StudentStudyCalendar
                month={month}
                today={today}
                selectedDate={selectedDate}
                views={dayViews}
                loading={dayRecordsLoading}
                onSelect={setSelectedDate}
                onMonthChange={setMonth}
              />
            </>
          )}

          <p className="mt-2 text-[11px] text-navy/35">{formatDateKo(today)} 기준</p>
        </section>

        {/* 숙제 제출 — 승인 대기 / 승인 / 반려(사유)를 학생도 볼 수 있게 */}
        {recentSubmissions.length > 0 ? (
          <section className="mt-4 card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold text-navy">숙제 제출</h2>
              <span className="text-[11px] font-semibold text-navy/45">
                {waitingSubmissions > 0 ? `선생님 확인 기다리는 중 ${waitingSubmissions}건` : '최근 제출'}
              </span>
            </div>
            <ul className="mt-2 space-y-1.5">
              {recentSubmissions.map((submission) => (
                <HomeworkSubmissionRow key={submission.id} submission={submission} />
              ))}
            </ul>
            <p className="mt-2 text-[10.5px] leading-snug text-navy/40">
              사진과 문제 수를 내면 선생님이 확인해요 · 승인된 시간·문항수만 오늘 기록에 들어가요
            </p>
          </section>
        ) : null}

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

      {/* 학원 공부는 훈출(등·하원)이 자동으로 시작한다 — 2026-11-26 시작 버튼 제거 */}
      <div className="px-5 pb-1">
        <div className="flex flex-col gap-2">
          {/* 학원 등원 중에는 숙제 공부를 시작할 수 없다 — DB(start_session)도 같은 규칙으로 거부한다 */}
          {academyActive ? (
            <div className="rounded-2xl bg-[#FFF4D6] px-4 py-3 text-center">
              <p className="text-[13px] font-extrabold text-[#8A5A00]">🏫 학원 등원 중이에요</p>
              <p className="mt-1 text-[11.5px] font-semibold leading-snug text-[#8A5A00]/80">
                학원 등원 중에는 숙제 공부를 시작할 수 없어요. 하원한 뒤에 시작해 주세요.
              </p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => onStart('homework')}
            disabled={busy || academyActive}
            className={`h-[56px] w-full rounded-2xl text-lg font-bold text-white shadow-soft transition active:opacity-90 disabled:opacity-100 ${
              academyActive ? 'bg-[#E0453E]/35' : 'bg-[#E0453E]'
            }`}
          >
            {busy ? <Spinner className="h-5 w-5 border-white/40 border-t-white" /> : `${KIND_EMOJI.homework} ${KIND_LABEL.homework} 시작`}
          </button>
          {academyActive ? null : (
            <p className="text-center text-[11px] font-semibold text-navy/40">
              🏠 숙제 공부는 화면을 끄거나 나가면 멈춰요
            </p>
          )}
        </div>
      </div>

      <BrandFooter />

      {/* 오늘 학원 공부 문제 수 직접 수정 — 오늘 기록이 있을 때만 열린다 */}
      <EditAcademyProblemsModal
        open={editProblemsOpen}
        studentId={student.id}
        current={todaySplit.academyProblems}
        onClose={() => setEditProblemsOpen(false)}
        onSaved={(log) => {
          setEditProblemsOpen(false)
          setSavedProblems(log?.academy_problems ?? todaySplit.academyProblems)
          void load()
          void loadMonth()
        }}
      />
    </div>
  )
}
