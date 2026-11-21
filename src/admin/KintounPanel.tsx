import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dragonball } from '../components/KintounCloud'
import * as api from '../lib/kintoun'
import {
  DRAGONBALL_MAX_AMOUNT,
  dragonballKinds,
  formatLiveClock,
  GRANT_MODE_LABEL,
  grantResultText,
  grantTargets,
  LIVE_REFRESH_MS,
  normalizeGrantAmount,
  RAINBOW_BALL_ICON,
  starListText,
} from '../lib/kintounBoard'
import type { Student } from '../lib/types'
import { AdminSection, EmptyBlock, ErrorBlock, LoadingBlock, StatCard } from './ui'

interface KintounPanelProps {
  students: Student[]
  studentsLoading: boolean
  studentsError: string | null
  reloadStudents: () => void
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

/**
 * 관리자 '근두운' — 지금 공부 중인 학생 목록과 선오공이 드래곤볼 쏘기.
 * 전체 일괄 지급과 개별 지급을 모두 할 수 있다.
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

  const load = useCallback(async () => {
    setLoading(true)
    const [live, grants] = await Promise.all([api.listLiveSessions(), api.listDragonballGrants(12)])
    if (live.ok) {
      setRows(live.data.rows)
      setFetchedAt(Date.now())
      setNow(Date.now())
      setError(null)
    } else {
      setError(live.error)
    }
    if (grants.ok) setHistory(grants.data)
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
        description="공부 중인 학생에게 드래곤볼을 쏩니다. 개수마다 1~7성구가 랜덤으로 나와요. 전체 일괄과 개별 지급 모두 할 수 있어요."
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

      <AdminSection title="지금 공부 중인 학생" description={`${LIVE_REFRESH_MS / 1000}초마다 새로 읽어요. 이름 옆 회색 글씨가 근두운에 보이는 닉네임이에요. 🌈 는 칠성구를 합쳐 만든 무지개 볼이에요.`}>
        {studentsLoading || (loading && rows.length === 0) ? (
          <LoadingBlock />
        ) : liveRows.length === 0 ? (
          <EmptyBlock message="지금 공부 중인 학생이 없어요." />
        ) : (
          <ul className="divide-y divide-blue-line">
            {[...running, ...paused].map((row) => (
              <li
                key={row.sessionId}
                className={`flex flex-wrap items-center gap-2 px-1 py-2 transition ${
                  flashId === row.studentId ? 'bg-[#FFF3D6]' : ''
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-soft text-[12px]">
                  {row.status === 'running' ? (row.kind === 'homework' ? '🏠' : '🏫') : '😴'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-navy">
                    {row.name}
                    <span className="ml-1.5 text-[10px] font-semibold text-navy/40">{row.grade}</span>
                    <span className="ml-1.5 text-[10.5px] font-semibold text-navy/35">({row.displayName})</span>
                  </p>
                  <p className="text-[10.5px] font-semibold text-navy/45">
                    {row.status === 'running' ? '공부 중' : '잠깐 쉬는 중'} · {formatLiveClock(row.seconds)}
                  </p>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-[#FFF3D6] px-2 py-1">
                  <Dragonball size="sm" stars={4} />
                  <span className="text-[11px] font-extrabold text-[#8A5400] tabular">
                    {row.dragonballCount}개
                    <span className="ml-1 text-[10px] font-bold text-[#B07200]/70">{dragonballKinds(row.dragonballs)}/7종</span>
                  </span>
                </span>
                <span
                  className={`flex items-center gap-1 rounded-full px-2 py-1 ${
                    row.rainbowBallCount > 0 ? 'bg-[#F2EEFF]' : 'bg-blue-soft/70'
                  }`}
                  title="칠성구를 합쳐 만든 무지개 볼"
                >
                  <img src={RAINBOW_BALL_ICON} alt="" className="h-4 w-4" aria-hidden="true" />
                  <span
                    className={`text-[11px] font-extrabold tabular ${
                      row.rainbowBallCount > 0 ? 'text-[#5B4B8A]' : 'text-navy/35'
                    }`}
                  >
                    🌈 {row.rainbowBallCount}개
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void grant([row.studentId], 'single', row.name)}
                  className="shrink-0 rounded-xl bg-[#F08C00] px-3 py-1.5 text-[11.5px] font-extrabold text-white transition active:scale-[0.98] disabled:opacity-40"
                >
                  ☄️ {amount}개 쏘기
                </button>
              </li>
            ))}
          </ul>
        )}
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
          학생 {students.length}명 · 드래곤볼은 제한 없이 쌓이고, 1~7성구를 하나씩 모으면 학생이 직접 무지개 볼을 만들어요.
        </p>
      </AdminSection>
    </div>
  )
}
