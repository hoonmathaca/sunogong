import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { Dragonball } from '../components/KintounCloud'
import * as api from '../lib/kintoun'
import { listLogs } from '../lib/api'
import { individualSentText, sendDragonballs } from '../lib/dragonballSend'
import { splitLog } from '../lib/stats'
import type { SessionKind } from '../lib/kinds'
import type { StudyLog } from '../lib/types'
import { formatDateKo, formatHMS, todayKst } from '../lib/time'
import {
  DRAGONBALL_MAX_AMOUNT,
  dragonTotal,
  endStudyAlreadyText,
  endStudyDoneText,
  GRANT_MODE_LABEL,
  grantResultText,
  grantTargets,
  LIVE_REFRESH_MS,
  normalizeGrantAmount,
  normalizeTicketCount,
  parseEndProblems,
  SECRET_TICKET,
  starListText,
  TICKET_BY_KEY,
  ticketChips,
  ticketCounts,
  ticketTotal,
  type TicketKey,
} from '../lib/kintounBoard'
import type { Student } from '../lib/types'
import { AdminSection, EmptyBlock, ErrorBlock, LoadingBlock, StatCard } from './ui'
import { DragonballBulk } from './DragonballBulk'
import { EndStudyModal } from './EndStudyModal'
import { LiveSessionRow } from './LiveSessionRow'

interface KintounPanelProps {
  students: Student[]
  studentsLoading: boolean
  studentsError: string | null
  reloadStudents: () => void
}

/** 교환권 이름 찾기 — 시크릿쿠폰은 가진 학생에게만 나오므로 따로 더한다 */
const TICKET_META: Record<TicketKey, (typeof TICKET_BY_KEY)[TicketKey]> = {
  ...TICKET_BY_KEY,
  secret: SECRET_TICKET,
}

/** 드래곤볼이 날아가는 애니메이션 (쏠 때마다 다시 시작) */
function DragonballShot({ burstKey }: { burstKey: number }): JSX.Element | null {
  if (burstKey <= 0) return null
  return (
    <span key={burstKey} className="pointer-events-none absolute right-3 top-2 flex gap-1" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((index) => (
        <span
          key={index}
          className="dragonball-shot"
          style={{ animationDelay: `${index * 0.08}s` }}
        >
          <Dragonball size="md" />
        </span>
      ))}
    </span>
  )
}

/** 교환권 한 장을 사용 처리하기 전 확인 */
interface UseTarget {
  student: Student
  ticket: TicketKey
}

/** 오늘 공부 이력 한 줄 — 오늘 기록(학원·숙제)과 지금 공부 중인 세션을 합친 것 */
interface TodayStudyRow {
  studentId: string
  name: string
  grade: string
  academyMinutes: number
  academyProblems: number
  homeworkMinutes: number
  homeworkProblems: number
  liveStatus: 'running' | 'paused' | null
  liveKind: SessionKind | null
  liveSeconds: number
}

/**
 * 관리자 '실시간' — 지금 공부 중인 학생 목록과 선오공이 드래곤볼 쏘기,
 * 그리고 학원에서 실제로 준 교환권을 사용 처리하는 칸.
 */
export function KintounPanel({ students, studentsLoading, studentsError, reloadStudents }: KintounPanelProps): JSX.Element {
  const [rows, setRows] = useState<api.AdminLiveSession[]>([])
  const [fetchedAt, setFetchedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [amount, setAmount] = useState(1)
  const [includePaused, setIncludePaused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [shotKey, setShotKey] = useState(0)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [history, setHistory] = useState<api.DragonballGrant[]>([])
  const [ticketUses, setTicketUses] = useState<api.TicketUse[]>([])
  const [ticketQuery, setTicketQuery] = useState('')
  const [useTarget, setUseTarget] = useState<UseTarget | null>(null)
  const [using, setUsing] = useState(false)
  const [useError, setUseError] = useState<string | null>(null)
  const [useMessage, setUseMessage] = useState<string | null>(null)
  /* 수업 종료 — 활성 세션을 선생님이 직접 마무리한다 */
  const [endTarget, setEndTarget] = useState<api.AdminLiveSession | null>(null)
  const [endProblems, setEndProblems] = useState('')
  const [ending, setEnding] = useState(false)
  const [endError, setEndError] = useState<string | null>(null)
  const [endMessage, setEndMessage] = useState<string | null>(null)
  /* 오늘 공부 이력 — 오늘 기록한 학생 전부 (2026-11-28) */
  const today = todayKst()
  const [todayLogs, setTodayLogs] = useState<StudyLog[]>([])
  const [todayAmount, setTodayAmount] = useState(1)
  const [todaySending, setTodaySending] = useState<string | null>(null)
  const [todayMessage, setTodayMessage] = useState<string | null>(null)
  const [todayError, setTodayError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [live, grants, uses, logs] = await Promise.all([
      api.listLiveSessions(),
      api.listDragonballGrants(12),
      api.listTicketUses(12),
      listLogs(today, today),
    ])
    if (logs.ok) setTodayLogs(logs.data)
    if (live.ok) {
      setRows(live.data.rows)
      setFetchedAt(Date.now())
      setNow(Date.now())
      setError(null)
    } else {
      setError(live.error)
    }
    if (grants.ok) setHistory(grants.data)
    if (uses.ok) setTicketUses(uses.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const refresh = window.setInterval(() => void load(), LIVE_REFRESH_MS)
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.clearInterval(refresh)
      window.clearInterval(tick)
    }
  }, [load])

  /* 받은 뒤 흐른 시간만큼 진행 시간을 늘린다 */
  const liveRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        seconds:
          row.status === 'running'
            ? Math.min(18000, row.seconds + Math.floor(Math.max(0, now - fetchedAt) / 1000))
            : row.seconds,
      })),
    [rows, fetchedAt, now],
  )

  const running = liveRows.filter((row) => row.status === 'running')
  const paused = liveRows.filter((row) => row.status === 'paused')
  /* 지금 공부 중인 학생을 학원 공부·숙제 공부로 따로 */
  const runningAcademy = running.filter((row) => row.kind !== 'homework').length
  const runningHomework = running.length - runningAcademy
  const targets = grantTargets(liveRows, includePaused)

  /* 오늘 공부 이력 — 오늘 남긴 기록 + 지금 공부 중인 세션을 학생별로 합친다 */
  const todayRows = useMemo(() => {
    const map = new Map<string, TodayStudyRow>()
    const blank = (studentId: string): TodayStudyRow => ({
      studentId,
      name: '',
      grade: '',
      academyMinutes: 0,
      academyProblems: 0,
      homeworkMinutes: 0,
      homeworkProblems: 0,
      liveStatus: null,
      liveKind: null,
      liveSeconds: 0,
    })
    for (const log of todayLogs) {
      const split = splitLog(log)
      const row = map.get(log.student_id) ?? blank(log.student_id)
      row.academyMinutes = split.academyMinutes
      row.academyProblems = split.academyProblems
      row.homeworkMinutes = split.homeworkMinutes
      row.homeworkProblems = split.homeworkProblems
      map.set(log.student_id, row)
    }
    for (const live of liveRows) {
      const row = map.get(live.studentId) ?? blank(live.studentId)
      row.name = live.name
      row.grade = live.grade
      row.liveStatus = live.status === 'running' ? 'running' : 'paused'
      row.liveKind = live.kind
      row.liveSeconds = live.seconds
      map.set(live.studentId, row)
    }
    const byId = new Map(students.map((student) => [student.id, student]))
    for (const row of map.values()) {
      if (row.name) continue
      const student = byId.get(row.studentId)
      if (student) {
        row.name = student.name
        row.grade = student.grade
      }
    }
    return [...map.values()]
      .map((row) => ({ ...row, name: row.name || '학생', grade: row.grade || '미지정' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [todayLogs, liveRows, students])

  const studiedAcademy = (row: TodayStudyRow) =>
    row.academyMinutes > 0 || row.academyProblems > 0 || (row.liveStatus !== null && row.liveKind === 'academy')
  const studiedHomework = (row: TodayStudyRow) =>
    row.homeworkMinutes > 0 || row.homeworkProblems > 0 || (row.liveStatus !== null && row.liveKind === 'homework')
  const todayAcademyIds = todayRows.filter(studiedAcademy).map((row) => row.studentId)
  const todayHomeworkIds = todayRows.filter(studiedHomework).map((row) => row.studentId)

  /** 오늘 공부 이력에서 한 학생에게 바로 쏘기 */
  const sendTodayOne = async (row: TodayStudyRow, kind: SessionKind) => {
    if (todaySending) return
    setTodaySending(`${row.studentId}:${kind}`)
    setTodayMessage(null)
    setTodayError(null)
    const res = await sendDragonballs([row.studentId], normalizeGrantAmount(todayAmount), {
      kind,
      date: today,
      individualName: row.name,
    })
    setTodaySending(null)
    if (res.ok) {
      setTodayMessage(`${row.name} · ${individualSentText(res.data.amount, res.data.stars)}`)
      await load()
      reloadStudents()
    } else {
      setTodayError(res.error)
    }
  }

  /* 교환권을 가진 학생 — 많이 가진 학생부터 */
  const ticketStudents = useMemo(() => {
    const withTickets = students
      .map((student) => ({ student, counts: ticketCounts(student) }))
      .filter((item) => ticketTotal(item.counts) > 0)
    const query = ticketQuery.trim()
    const list = query
      ? students
          .filter((student) => student.name.includes(query) || (student.nickname ?? '').includes(query))
          .map((student) => ({ student, counts: ticketCounts(student) }))
      : withTickets
    return [...list].sort((a, b) => {
      const diff = ticketTotal(b.counts) - ticketTotal(a.counts)
      return diff !== 0 ? diff : a.student.name.localeCompare(b.student.name, 'ko')
    })
  }, [students, ticketQuery])

  const ticketStudentCount = useMemo(
    () => students.filter((student) => ticketTotal(ticketCounts(student)) > 0).length,
    [students],
  )

  const flash = (id: string) => {
    setFlashId(id)
    window.setTimeout(() => setFlashId((current) => (current === id ? null : current)), 1400)
  }

  const grant = async (ids: string[], mode: 'all' | 'single', label?: string) => {
    if (ids.length === 0 || busy) return
    const count = normalizeGrantAmount(amount)
    setBusy(true)
    setMessage(null)
    const res = await api.grantDragonballs(ids, count, mode, mode === 'all' ? '공부 중 전체' : label ?? null)
    setBusy(false)
    if (res.ok) {
      setMessage(grantResultText(res.data.granted, res.data.amount, res.data.mode, res.data.stars))
      setShotKey((key) => key + 1)
      if (ids.length === 1) flash(ids[0])
      await load()
      /* 랭킹·학생 목록의 드래곤볼 개수도 바로 맞춘다 */
      reloadStudents()
    } else {
      setError(res.error)
    }
  }

  /** 실제로 지급한 교환권 사용 처리 — 확인 창에서 한 번 더 */
  const useTicket = async () => {
    if (!useTarget || using) return
    setUsing(true)
    setUseError(null)
    const res = await api.useTicket(useTarget.student.id, useTarget.ticket, 1)
    setUsing(false)
    if (res.ok) {
      setUseMessage(
        `${useTarget.student.name} · ${TICKET_META[useTarget.ticket].name} 1장 사용 처리했어요. 남은 교환권은 ${ticketSummaryAfter(ticketCounts(res.data))}`,
      )
      setUseTarget(null)
      await load()
      reloadStudents()
    } else {
      setUseError(res.error)
    }
  }

  const openUse = (student: Student, ticket: TicketKey) => {
    setUseError(null)
    setUseTarget({ student, ticket })
  }

  /* 수업 종료 — 확인 창을 열고, 확정하면 지금까지의 시간으로 마무리한다 */
  const openEnd = (row: api.AdminLiveSession) => {
    setEndError(null)
    setEndProblems('')
    setEndTarget(row)
  }

  const confirmEnd = async () => {
    if (!endTarget || ending) return
    const row = endTarget
    setEnding(true)
    setEndError(null)
    const res = await api.adminEndStudySession(row.sessionId, parseEndProblems(endProblems))
    setEnding(false)
    if (!res.ok) {
      setEndError(res.error)
      return
    }
    const data = res.data
    setEndTarget(null)
    setEndMessage(
      data.already_finished
        ? endStudyAlreadyText(row.name)
        : data.discarded
          ? `${row.name} · 자정을 넘긴 공부라 기록하지 않고 정리했어요.`
          : endStudyDoneText(row, data.minutes, data.problems, Boolean(data.pending_approval)),
    )
    await load()
    reloadStudents()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard
          label="지금 공부 중"
          value={`${running.length}명`}
          sub={`🏫 학원 ${runningAcademy}명 · 🏠 숙제 ${runningHomework}명`}
          tone="navy"
        />
        <StatCard label="잠깐 쉬는 중" value={`${paused.length}명`} sub="일시정지 상태" />
        <StatCard label="드래곤볼 쏠 대상" value={`${targets.length}명`} sub={includePaused ? '쉬는 중 포함' : '공부 중만'} tone="homework" />
        <StatCard
          label="오늘 쏜 드래곤볼"
          value={`${history.reduce((sum, item) => sum + Math.max(0, Number(item.amount ?? 0)), 0)}개`}
          sub={`${history.length}번 기록`}
        />
      </div>

      <AdminSection
        title="🐉 선오공이 드래곤볼 쏘기"
        description="공부 중인 학생에게 드래곤볼을 쏩니다. 개수마다 1~7성구가 랜덤으로 나와요. 전체 일괄과 개별 쏘기를 모두 할 수 있어요."
        actions={
          <button type="button" className="btn-ghost border border-blue-line" onClick={() => void load()}>
            새로고침
          </button>
        }
      >
        <div className="relative overflow-hidden rounded-2xl border border-[#F3C978] bg-gradient-to-br from-[#FFF8E8] to-[#FFE7B8] p-4">
          <DragonballShot burstKey={shotKey} />
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[12px] font-bold text-[#7A4A00]">
              한 학생에게
              <span className="ml-2 inline-flex items-center gap-1 align-middle">
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-[15px] font-extrabold text-[#7A4A00]"
                  onClick={() => setAmount((value) => Math.max(1, value - 1))}
                  aria-label="1개 줄이기"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={DRAGONBALL_MAX_AMOUNT}
                  value={amount}
                  onChange={(event) => setAmount(normalizeGrantAmount(event.target.value))}
                  className="w-14 rounded-xl border border-[#E8C57E] bg-white px-2 py-1.5 text-center text-[15px] font-extrabold text-[#7A4A00] tabular focus:outline-none focus:ring-2 focus:ring-[#F7A93B]/40"
                />
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-[15px] font-extrabold text-[#7A4A00]"
                  onClick={() => setAmount((value) => Math.min(DRAGONBALL_MAX_AMOUNT, value + 1))}
                  aria-label="1개 늘리기"
                >
                  +
                </button>
                <span className="ml-1 text-[13px]">개</span>
              </span>
            </label>

            <label className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#8A5400]">
              <input
                type="checkbox"
                checked={includePaused}
                onChange={(event) => setIncludePaused(event.target.checked)}
                className="h-4 w-4 accent-[#F08C00]"
              />
              쉬는 중인 학생도 포함
            </label>

            <button
              type="button"
              disabled={busy || targets.length === 0}
              onClick={() => void grant(targets.map((row) => row.studentId), 'all')}
              className="ml-auto inline-flex items-center gap-2 rounded-2xl bg-[#F08C00] px-4 py-2.5 text-[13px] font-extrabold text-white shadow-soft transition active:scale-[0.98] disabled:opacity-40"
            >
              {busy ? '쏘는 중…' : `☄️ 공부 중 ${targets.length}명에게 쏘기`}
            </button>
          </div>

          <p className="mt-2 text-[10.5px] font-semibold text-[#A97516]">
            🎲 한 개마다 <b>1성구~7성구</b>가 랜덤으로 나와요 · 모은 성구는 학생 홈 도감에 쌓입니다
          </p>

          {message ? (
            <p className="mt-2 rounded-xl bg-white/80 px-3 py-2 text-[12px] font-bold text-[#7A4A00]">{message}</p>
          ) : null}
        </div>

        {error ? <ErrorBlock message={error} onRetry={() => void load()} /> : null}
        {studentsError ? <ErrorBlock message={studentsError} onRetry={reloadStudents} /> : null}
      </AdminSection>

      <AdminSection
        title="지금 공부 중인 학생"
        description={`${LIVE_REFRESH_MS / 1000}초마다 새로 읽어요. 이름 옆 회색 글씨가 근두운에 보이는 닉네임이에요. 🐲 는 1~7성구를 합성해 얻은 일반용, 🌈 는 무지개용이에요. «수업 종료» 로 그 학생의 공부를 지금까지의 시간으로 마무리할 수 있어요.`}
      >
        {studentsLoading || (loading && rows.length === 0) ? (
          <LoadingBlock />
        ) : liveRows.length === 0 ? (
          <EmptyBlock message="지금 공부 중인 학생이 없어요." />
        ) : (
          <ul className="divide-y divide-blue-line">
            {[...running, ...paused].map((row) => (
              <LiveSessionRow
                key={row.sessionId}
                row={row}
                amount={amount}
                busy={busy || ending}
                flash={flashId === row.studentId}
                onGrant={() => void grant([row.studentId], 'single', row.name)}
                onEnd={() => openEnd(row)}
              />
            ))}
          </ul>
        )}

        {endMessage ? (
          <p className="mt-2 rounded-xl bg-[#F0FAF0] px-3 py-2 text-[11.5px] font-bold text-[#2E6B34]">{endMessage}</p>
        ) : null}
      </AdminSection>

      <AdminSection
        title="오늘 공부 이력"
        description={`오늘(${formatDateKo(today)}) 공부한 학생 전부예요. 학원공부와 숙제공부를 나눠 인원·시간·푼 숙제를 보여 주고, 학원공부 일괄 · 숙제공부 일괄로 드래곤볼을 쏠 수 있어요.`}
        actions={
          <button type="button" className="btn-ghost border border-blue-line" onClick={() => void load()}>
            새로고침
          </button>
        }
      >
        {studentsLoading || (loading && todayLogs.length === 0 && liveRows.length === 0) ? (
          <LoadingBlock />
        ) : todayRows.length === 0 ? (
          <EmptyBlock message="오늘은 아직 공부 기록이 없어요." />
        ) : (
          <>
            <DragonballBulk
              academyIds={todayAcademyIds}
              homeworkIds={todayHomeworkIds}
              amount={todayAmount}
              onAmountChange={setTodayAmount}
              date={today}
              onSent={() => {
                void load()
                reloadStudents()
              }}
            />

            <ul className="mt-2 divide-y divide-blue-line rounded-2xl border border-blue-line">
              {todayRows.map((row) => {
                const academy = studiedAcademy(row)
                const homework = studiedHomework(row)
                const liveText =
                  row.liveStatus === null
                    ? null
                    : `${row.liveKind === 'homework' ? '🏠 숙제' : '🏫 학원'} ${
                        row.liveStatus === 'running' ? '공부 중' : '쉬는 중'
                      } ${formatHMS(row.liveSeconds)}`
                return (
                  <li key={row.studentId} className="flex items-center gap-2 px-2.5 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-bold text-navy">
                        {row.name}
                        <span className="ml-1 text-[10px] font-semibold text-navy/35">{row.grade}</span>
                        {liveText ? (
                          <span className="ml-1.5 rounded-full bg-[#FFF6E3] px-1.5 py-0.5 text-[9.5px] font-bold text-[#8A5400]">
                            {liveText}
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-[10.5px] font-semibold tabular">
                        <span className={academy ? 'text-[#1D4A9B]' : 'text-navy/25'}>
                          🏫 {row.academyMinutes}분 · {row.academyProblems}문제
                        </span>
                        <span className="text-navy/20"> · </span>
                        <span className={homework ? 'text-[#D9382F]' : 'text-navy/25'}>
                          🏠 {row.homeworkMinutes}분 · {row.homeworkProblems}문제
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        disabled={!academy || todaySending !== null}
                        onClick={() => void sendTodayOne(row, 'academy')}
                        aria-label={`${row.name} 학원공부 드래곤볼 쏘기`}
                        className="rounded-lg bg-[#1D4A9B] px-2 py-1 text-[10px] font-extrabold text-white transition active:scale-[0.97] disabled:opacity-25"
                      >
                        {todaySending === `${row.studentId}:academy` ? '쏘는 중…' : '🏫 쏘기'}
                      </button>
                      <button
                        type="button"
                        disabled={!homework || todaySending !== null}
                        onClick={() => void sendTodayOne(row, 'homework')}
                        aria-label={`${row.name} 숙제공부 드래곤볼 쏘기`}
                        className="rounded-lg bg-[#D9382F] px-2 py-1 text-[10px] font-extrabold text-white transition active:scale-[0.97] disabled:opacity-25"
                      >
                        {todaySending === `${row.studentId}:homework` ? '쏘는 중…' : '🏠 쏘기'}
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>

            {todayMessage ? (
              <p className="mt-2 rounded-xl bg-[#F0FAF0] px-3 py-2 text-[11.5px] font-bold text-[#2E6B34]">{todayMessage}</p>
            ) : null}
            {todayError ? (
              <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[11.5px] font-bold text-red-500">{todayError}</p>
            ) : null}
          </>
        )}
      </AdminSection>

      <AdminSection
        title="🎟 교환권 지급 확인 · 사용 처리"
        description="학원에서 실제로 준 뒤, 그 학생의 교환권을 사용 처리(차감)합니다. 일반용 1마리 = 1,000P, 무지개용 1마리 = 10,000P, 성구 2개 = 사탕교환권 1장."
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#FFF6E3] px-2.5 py-1 text-[11px] font-bold text-[#8A5400]">
            교환권을 가진 학생 {ticketStudentCount}명
          </span>
          <input
            value={ticketQuery}
            onChange={(event) => setTicketQuery(event.target.value)}
            placeholder="이름으로 찾기"
            className="ml-auto w-32 rounded-xl border border-blue-line bg-white px-2.5 py-1.5 text-[12px] font-semibold text-navy focus:outline-none focus:ring-2 focus:ring-blue-brand/30"
          />
          {ticketQuery ? (
            <button type="button" className="text-[11px] font-bold text-navy/40 underline" onClick={() => setTicketQuery('')}>
              지우기
            </button>
          ) : null}
        </div>

        {studentsLoading ? (
          <LoadingBlock />
        ) : ticketStudents.length === 0 ? (
          <EmptyBlock
            message={ticketQuery ? '그 이름의 학생이 없어요.' : '아직 학생이 바꾼 교환권이 없어요. 학생이 성구·일반용을 바꾸면 여기에 나와요.'}
          />
        ) : (
          <ul className="mt-2 divide-y divide-blue-line">
            {ticketStudents.map(({ student, counts }) => (
              <li key={student.id} className="py-2.5">
                <p className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate text-[13.5px] font-extrabold text-navy">{student.name}</span>
                  <span className="shrink-0 text-[10.5px] font-semibold text-navy/35">{student.grade}</span>
                </p>
                <p className="mt-0.5 text-[10.5px] font-semibold text-navy/40">
                  일반용 {dragonTotal(student.dragons)}마리 · 무지개용 {normalizeTicketCount(student.rainbow_dragon_count)}마리 · 성구{' '}
                  {student.dragonball_count ?? 0}개
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {ticketChips(counts).map((ticket) => {
                    const count = counts[ticket.key]
                    return (
                      <button
                        key={ticket.key}
                        type="button"
                        disabled={count < 1 || using}
                        onClick={() => openUse(student, ticket.key)}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-extrabold transition active:scale-[0.97] disabled:opacity-35 ${
                          ticket.key === 'candy'
                            ? 'bg-[#FFF0F5] text-[#B0265B] ring-1 ring-[#F5B9CE]'
                            : ticket.key === 'point1000'
                              ? 'bg-[#FFF6E3] text-[#8A5400] ring-1 ring-[#F3C978]'
                              : ticket.key === 'secret'
                                ? 'bg-[#252A38] text-white ring-1 ring-[#252A38]'
                                : 'bg-[#F3EDFF] text-[#5B3FB8] ring-1 ring-[#D9CCFF]'
                        }`}
                        aria-label={`${student.name}의 ${ticket.name} ${count}장 중 1장 사용 처리`}
                      >
                        <img src={ticket.icon} alt="" className="h-4 w-4" aria-hidden="true" />
                        {ticket.short} {count}
                      </button>
                    )
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}

        {useMessage ? (
          <p className="mt-2 rounded-xl bg-[#F0FAF0] px-3 py-2 text-[11.5px] font-bold text-[#2E6B34]">{useMessage}</p>
        ) : null}

        {ticketUses.length > 0 ? (
          <div className="mt-3 rounded-2xl bg-blue-soft/40 p-2.5">
            <p className="text-[11px] font-extrabold text-navy/60">최근 사용 처리</p>
            <ul className="mt-1 space-y-1">
              {ticketUses.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="min-w-0 flex-1 truncate font-bold text-navy">
                    {api.ticketUseStudentName(item)}
                    <span className="ml-1.5 font-semibold text-navy/45">
                      {TICKET_META[item.ticket as TicketKey]?.name ?? item.ticket} {item.amount}장
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-navy/35 tabular">
                    {new Date(item.created_at).toLocaleString('ko-KR', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Seoul',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </AdminSection>

      <AdminSection title="드래곤볼 지급 이력" description="최근 12건 — 누구에게 몇 개를 쏘았는지 남겨 둡니다.">
        {history.length === 0 ? (
          <EmptyBlock message="아직 드래곤볼을 쏜 기록이 없어요." />
        ) : (
          <ul className="divide-y divide-blue-line text-[11.5px]">
            {history.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate font-bold text-navy">
                  {api.grantStudentName(item)}
                  <span className="mx-1.5 inline-block align-middle rounded-full bg-blue-soft px-1.5 py-0.5 text-[10px] font-bold text-navy/50">
                    {GRANT_MODE_LABEL[item.mode] ?? item.mode}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] font-semibold text-navy/45 tabular">
                  {new Date(item.created_at).toLocaleString('ko-KR', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Seoul',
                  })}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-extrabold text-[#B07200] tabular">+{item.amount}개</span>
                  {starListText(item.stars) ? (
                    <span className="block text-[10px] font-semibold text-[#B07200]/70">{starListText(item.stars)}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] text-navy/40">
          학생 {students.length}명 · 드래곤볼은 제한 없이 쌓이고, 1~7성구를 하나씩 모으면 학생이 직접 일반용을 뽑아요.
          7종을 다 모으면 무지개용이 돼요.
        </p>
      </AdminSection>

      {/* 수업 종료 확인 — 학생 이름·지금까지의 시간·문제 수 */}
      <EndStudyModal
        open={endTarget !== null}
        row={endTarget}
        problems={endProblems}
        onProblemsChange={setEndProblems}
        busy={ending}
        error={endError}
        onClose={() => {
          if (!ending) setEndTarget(null)
        }}
        onConfirm={() => void confirmEnd()}
      />

      {/* 교환권 사용 처리 확인 */}
      <Modal
        open={useTarget !== null}
        title="교환권 사용 처리"
        onClose={() => {
          if (!using) setUseTarget(null)
        }}
        footer={
          <>
            <button type="button" className="btn-outline px-4" disabled={using} onClick={() => setUseTarget(null)}>
              취소
            </button>
            <button type="button" className="btn-navy px-4" disabled={using} onClick={() => void useTicket()}>
              {using ? '처리 중…' : '사용 처리'}
            </button>
          </>
        }
      >
        {useTarget ? (
          <>
            <div className="flex items-center gap-2 rounded-2xl bg-[#FFF8E8] px-3 py-2.5">
              <img
                src={TICKET_META[useTarget.ticket].icon}
                alt=""
                className="h-8 w-8"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-[13px] font-extrabold text-navy">
                  {useTarget.student.name} · {TICKET_META[useTarget.ticket].name} 1장
                </p>
                <p className="text-[11px] font-semibold text-navy/45">
                  지금 {ticketCounts(useTarget.student)[useTarget.ticket]}장 있어요
                </p>
              </div>
            </div>
            <p className="mt-2 text-[12px] font-semibold text-navy/60">
              학원에서 <b>실제로 지급한 뒤</b> 눌러 주세요. 누르면 이 학생의 교환권 1장이 줄어들고,
              사용 처리한 기록이 남아요.
            </p>
            {useError ? <p className="mt-1.5 text-[11.5px] font-bold text-red-500">{useError}</p> : null}
          </>
        ) : null}
      </Modal>
    </div>
  )
}

/** 사용 처리 뒤 남은 교환권을 짧게 — '사탕 1장 · 1,000P 0장' */
function ticketSummaryAfter(counts: { candy: number; point1000: number; point10000: number; secret: number }): string {
  const base = `${TICKET_BY_KEY.candy.short} ${counts.candy}장 · ${TICKET_BY_KEY.point1000.short} ${counts.point1000}장 · ${TICKET_BY_KEY.point10000.short} ${counts.point10000}장`
  return counts.secret > 0 ? `${base} · ${SECRET_TICKET.short} ${counts.secret}장` : base
}
