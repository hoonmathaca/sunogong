import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dragonball, KintounCloud } from '../components/KintounCloud'
import { Modal } from '../components/Modal'
import { Spinner } from '../components/Keypad'
import * as api from '../lib/kintoun'
import {
  cloudItems,
  displayNickname,
  dragonballCountText,
  dragonballIconCount,
  formatLiveClock,
  LIVE_REFRESH_MS,
  liveRanking,
  myLivePosition,
  NICKNAME_MAX,
  pausedLabels,
  tickRows,
  validateNickname,
  type LiveBoard,
  type LiveRow,
} from '../lib/kintounBoard'

interface LiveKintounCardProps {
  studentId: string
}

const MEDAL = ['bg-amber-400 text-white', 'bg-slate-300 text-white', 'bg-amber-600/80 text-white']

/**
 * 근두운 — 지금 공부 중인 친구들(닉네임 + 시간)과 실시간 연속 공부 순위.
 * 내 드래곤볼 개수와 닉네임 바꾸기도 여기서 한다.
 */
export function LiveKintounCard({ studentId }: LiveKintounCardProps): JSX.Element {
  const [board, setBoard] = useState<LiveBoard | null>(null)
  const [nickname, setNickname] = useState<string | null>(null)
  const [dragonballs, setDragonballs] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())

  const [nicknameOpen, setNicknameOpen] = useState(false)
  const [nicknameInput, setNicknameInput] = useState('')
  const [nicknameError, setNicknameError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  /** 화면에 그릴 줄 — 받은 뒤 흐른 시간만큼 진행 시간을 늘린다 */
  const rows: LiveRow[] = useMemo(() => (board ? tickRows(board.students, fetchedAt, now) : []), [board, fetchedAt, now])

  const load = useCallback(async () => {
    setLoading(true)
    const [live, profile] = await Promise.all([api.liveStudyBoard(studentId), api.getStudentProfile(studentId)])
    if (live.ok) {
      setBoard(live.data)
      setFetchedAt(Date.now())
      setNow(Date.now())
      setError(null)
    } else {
      setError(live.error)
    }
    if (profile.ok) {
      setNickname(profile.data.nickname ?? null)
      setDragonballs(Math.max(0, Number(profile.data.dragonball_count ?? 0)))
    }
    setLoading(false)
  }, [studentId])

  useEffect(() => {
    void load()
  }, [load])

  /* 15초마다 새로 읽고, 1초마다 시간만 흘려 보낸다 */
  useEffect(() => {
    const refresh = window.setInterval(() => void load(), LIVE_REFRESH_MS)
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.clearInterval(refresh)
      window.clearInterval(tick)
    }
  }, [load])

  /* 앱으로 돌아오면 바로 새로 읽는다 */
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const clouds = useMemo(() => cloudItems(rows), [rows])
  const ranking = useMemo(() => liveRanking(rows), [rows])
  const myPosition = useMemo(() => myLivePosition(rows), [rows])
  const resting = useMemo(() => pausedLabels(rows), [rows])
  const runningCount = board?.running_count ?? 0
  const icons = dragonballIconCount(dragonballs)

  const openNickname = () => {
    setNicknameInput(nickname ?? '')
    setNicknameError(null)
    setNicknameOpen(true)
  }

  const saveNickname = async (value: string | null) => {
    const check = validateNickname(value ?? '')
    if (!check.ok) {
      setNicknameError(check.error)
      return
    }
    setSaving(true)
    setNicknameError(null)
    const res = await api.setStudentNickname(studentId, check.value)
    setSaving(false)
    if (res.ok) {
      setNickname(res.data.nickname ?? null)
      setDragonballs(Math.max(0, Number(res.data.dragonball_count ?? 0)))
      setNicknameOpen(false)
      void load()
    } else {
      setNicknameError(res.error)
    }
  }

  return (
    <>
      <section className="mt-4 rounded-3xl border border-blue-line bg-gradient-to-b from-[#EFF6FF] to-white p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 font-round text-[15px] font-extrabold text-navy">
            <span aria-hidden="true">☁️</span> 근두운
          </h2>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-full px-2 py-1 text-[11px] font-bold text-navy/40 transition hover:bg-white disabled:opacity-40"
            aria-label="근두운 새로고침"
          >
            {loading ? '불러오는 중…' : '새로고침'}
          </button>
        </div>

        <div className="mt-2 flex items-end justify-between gap-2">
          <p className="text-[12px] font-semibold text-navy/50">지금 공부 중인 친구</p>
          <p className="font-round text-[26px] font-extrabold leading-none text-navy tabular">
            {runningCount}
            <span className="ml-0.5 text-[13px] font-bold text-navy/45">명</span>
          </p>
        </div>

        {error ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl bg-red-50 px-3 py-2 text-[11px] text-red-500">
            <span className="break-words">{error}</span>
            <button type="button" className="shrink-0 font-bold underline" onClick={() => void load()}>
              다시
            </button>
          </div>
        ) : null}

        {!board && !error ? (
          <div className="mt-3 flex h-[92px] items-center justify-center gap-2 text-[12px] text-navy/40">
            <Spinner className="h-4 w-4 border-navy/20 border-t-navy" />
            근두운을 불러오는 중…
          </div>
        ) : !board ? (
          <div className="mt-3 rounded-2xl bg-white/80 px-3 py-6 text-center text-[12px] font-semibold text-navy/40">
            근두운을 불러오지 못했어요. 위의 <b>다시</b>를 눌러 주세요.
          </div>
        ) : clouds.clouds.length === 0 ? (
          <div className="mt-3 rounded-2xl bg-white/80 px-3 py-6 text-center text-[12px] font-semibold text-navy/40">
            지금은 공부 중인 친구가 없어요.
            <br />
            내가 첫 번째로 근두운을 타 볼까요?
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-x-1.5 gap-y-2.5 pb-1 pt-2">
            {clouds.clouds.map((cloud, index) => (
              <KintounCloud
                key={`${cloud.label}-${index}`}
                label={cloud.label}
                seconds={cloud.seconds}
                isMe={cloud.isMe}
                index={index}
              />
            ))}
            {clouds.hidden > 0 ? (
              <span className="inline-flex items-center rounded-full border border-dashed border-blue-line px-2.5 py-1 text-[11px] font-bold text-navy/40">
                외 {clouds.hidden}명
              </span>
            ) : null}
          </div>
        )}

        {resting.length > 0 ? (
          <p className="mt-1.5 truncate text-[11px] font-semibold text-navy/35">
            😴 잠깐 쉬는 중 · {resting.slice(0, 4).join(', ')}
            {resting.length > 4 ? ` 외 ${resting.length - 4}명` : ''}
          </p>
        ) : null}

        {/* 실시간 연속 공부 순위 — 멈추지 않고 이어서 공부 중인 시간 */}
        <div className="mt-3 rounded-2xl bg-white/90 p-3 shadow-sm ring-1 ring-blue-line/60">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-bold text-navy">🔥 실시간 연속 공부 순위</p>
            {myPosition ? (
              <p className="text-[11px] font-bold text-[#B07200] tabular">
                내 순위 {myPosition.position}위 / {myPosition.total}명
              </p>
            ) : (
              <p className="text-[11px] font-semibold text-navy/35">공부를 시작하면 순위에 들어요</p>
            )}
          </div>

          {!board ? (
            <p className="mt-2 text-[11px] font-semibold text-navy/35">근두운을 불러오는 중이에요.</p>
          ) : ranking.length === 0 ? (
            <p className="mt-2 text-[11px] font-semibold text-navy/35">아직 이어서 공부 중인 친구가 없어요.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {ranking.map((item) => (
                <li
                  key={`${item.position}-${item.label}`}
                  className={`flex items-center gap-2 rounded-xl px-2 py-1 text-[12px] ${
                    item.isMe ? 'bg-[#FFF6E0]' : ''
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold tabular ${
                      MEDAL[item.position - 1] ?? 'bg-blue-soft text-navy/60'
                    }`}
                  >
                    {item.position}
                  </span>
                  <span className={`min-w-0 flex-1 truncate font-bold ${item.isMe ? 'text-[#8A5400]' : 'text-navy/80'}`}>
                    {item.label}
                    {item.isMe ? <span className="ml-1 text-[10px] font-extrabold text-[#B07200]">나</span> : null}
                  </span>
                  <span className="shrink-0 font-extrabold tabular text-navy/70">{formatLiveClock(item.seconds)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 다른 친구들에게 보이는 내 이름 */}
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white/80 px-3 py-2">
          <span className="text-[11px] font-semibold text-navy/45">근두운에 보이는 내 이름</span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-extrabold text-navy">
            {displayNickname(nickname)}
          </span>
          <button
            type="button"
            onClick={openNickname}
            className="shrink-0 rounded-full bg-navy px-3 py-1 text-[11px] font-bold text-white"
          >
            바꾸기
          </button>
        </div>
      </section>

      {/* 내 드래곤볼 — 제한 없이 계속 쌓인다 (7개 교환은 아직 없음) */}
      <section className="mt-4 rounded-3xl border border-[#F3C978] bg-gradient-to-br from-[#FFF8E8] via-[#FFEFC9] to-[#FFE1A8] p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 font-round text-[15px] font-extrabold text-[#7A4A00]">
            <span aria-hidden="true">🐉</span> 내 드래곤볼
          </h2>
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-[#9A6400]">계속 쌓여요</span>
        </div>
        <div className="mt-2 flex items-end gap-2">
          <p className="font-round text-[34px] font-extrabold leading-none text-[#7A4A00] tabular">
            {dragonballs}
          </p>
          <p className="pb-1 text-[13px] font-bold text-[#9A6400]">개</p>
          {icons.extra > 0 ? (
            <p className="pb-1 text-[11px] font-bold text-[#A97516]">외 {icons.extra}개</p>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {icons.filled === 0 ? (
            <span className="text-[11px] font-semibold text-[#A97516]">
              선오공이가 드래곤볼을 쏘면 여기에 쌓여요
            </span>
          ) : (
            Array.from({ length: icons.filled }, (_, index) => <Dragonball key={index} size="md" />)
          )}
        </div>
        <p className="mt-2 text-[10.5px] font-semibold text-[#A97516]/80">
          공부를 이어 가면 선오공이가 드래곤볼을 쏴 줘요 · {dragonballCountText(dragonballs)}
        </p>
      </section>

      <Modal
        open={nicknameOpen}
        title="근두운 닉네임"
        description={
          <>
            실명 대신 별명을 써 주세요. 근두운과 순위에는 <b>{displayNickname(nicknameInput)}</b> 로 보여요.
          </>
        }
        onClose={() => setNicknameOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn-ghost border border-blue-line"
              disabled={saving}
              onClick={() => void saveNickname(null)}
            >
              지우기
            </button>
            <button type="button" className="btn-outline px-4" onClick={() => setNicknameOpen(false)} disabled={saving}>
              취소
            </button>
            <button
              type="button"
              className="btn-navy px-4"
              disabled={saving}
              onClick={() => void saveNickname(nicknameInput)}
            >
              {saving ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : '저장'}
            </button>
          </>
        }
      >
        <label className="block text-[12px] font-semibold text-navy/60" htmlFor="nickname-input">
          닉네임 (최대 {NICKNAME_MAX}자)
        </label>
        <input
          id="nickname-input"
          value={nicknameInput}
          maxLength={NICKNAME_MAX}
          onChange={(event) => {
            setNicknameInput(event.target.value)
            setNicknameError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void saveNickname(nicknameInput)
          }}
          placeholder="예: 수학왕"
          autoComplete="off"
          className="mt-1 w-full rounded-2xl border border-blue-line bg-white px-3 py-2.5 text-[15px] font-bold text-navy focus:outline-none focus:ring-2 focus:ring-blue-brand/30"
        />
        <p className="mt-1.5 text-[11px] font-semibold text-navy/40">
          비워 두면 <b>수련생</b> 으로 보여요. 같은 이름을 쓴 친구가 있으면 A·B 로 구분해 보여 줘요.
        </p>
        {nicknameError ? <p className="mt-1.5 text-[11px] font-bold text-red-500">{nicknameError}</p> : null}
      </Modal>
    </>
  )
}
