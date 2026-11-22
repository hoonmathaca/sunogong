import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dragonball, KintounCloud } from '../components/KintounCloud'
import { Modal } from '../components/Modal'
import { Spinner } from '../components/Keypad'
import * as api from '../lib/kintoun'
import {
  BLACK_DRAGON,
  canExchangeSecretTicket,
  CANDY_TICKET_COST,
  canCraftColorDragon,
  canCraftRainbowDragon,
  canExchangeCandy,
  candyExchangeText,
  cloudItems,
  displayNickname,
  dragonballDex,
  dragonballKinds,
  dragonballTotal,
  dragonCraftText,
  dragonDex,
  dragonName,
  dragonSummaryText,
  dragonTotal,
  DRAGON_BY_KEY,
  EMPTY_DRAGONBALLS,
  EMPTY_DRAGONS,
  formatLiveClock,
  LIVE_REFRESH_MS,
  liveRanking,
  myLivePosition,
  NICKNAME_MAX,
  normalizeBlackDragon,
  normalizeDragonMap,
  normalizeTicketCount,
  pausedLabels,
  RAINBOW_DRAGON,
  SHENRON_ICON,
  SHENRON_SUMMON_TITLE,
  summonMessage,
  ticketChips,
  ticketCounts,
  ticketSummaryText,
  tickRows,
  validateNickname,
  type DragonMap,
  type LiveBoard,
  type LiveRow,
  type TicketCounts,
} from '../lib/kintounBoard'

interface LiveKintounCardProps {
  studentId: string
}

const MEDAL = ['bg-amber-400 text-white', 'bg-slate-300 text-white', 'bg-amber-600/80 text-white']

const EMPTY_TICKETS: TicketCounts = { candy: 0, point1000: 0, point10000: 0, secret: 0 }

/** 교환 버튼 한 개 — 두 줄(이름 + 무엇을 내고 바꾸는지)로 모바일에서도 읽기 쉽게 */
function ExchangeButton({
  title,
  sub,
  tone,
  disabled,
  busy,
  onClick,
}: {
  title: string
  sub: string
  tone: 'candy' | 'dragon' | 'rainbow' | 'point' | 'pointBig'
  disabled: boolean
  busy: boolean
  onClick: () => void
}): JSX.Element {
  const toneClass: Record<typeof tone, string> = {
    candy: 'bg-[#FFF0F5] text-[#B0265B] ring-1 ring-[#F5B9CE]',
    dragon: 'bg-gradient-to-r from-[#F08C00] to-[#E1578A] text-white shadow-soft',
    rainbow: 'bg-gradient-to-r from-[#8B5CF6] to-[#5B8DEF] text-white shadow-soft',
    point: 'bg-[#FFF8E8] text-[#8A5400] ring-1 ring-[#F3C978]',
    pointBig: 'bg-[#F7F3FF] text-[#5B3FB8] ring-1 ring-[#D9CCFF]',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`flex min-h-[52px] flex-col items-center justify-center rounded-2xl px-2 py-2 text-center transition active:scale-[0.98] disabled:opacity-40 ${toneClass[tone]}`}
    >
      <span className="text-[12.5px] font-extrabold leading-tight">{busy ? '바꾸는 중…' : title}</span>
      <span className="mt-0.5 text-[9.5px] font-semibold opacity-70">{sub}</span>
    </button>
  )
}

/**
 * 근두운 — 지금 공부 중인 친구들(닉네임 + 시간)과 실시간 연속 공부 순위.
 * 내 드래곤볼·일반용 7종·무지개용·교환권도 여기서 본다.
 */
export function LiveKintounCard({ studentId }: LiveKintounCardProps): JSX.Element {
  const [board, setBoard] = useState<LiveBoard | null>(null)
  const [nickname, setNickname] = useState<string | null>(null)
  const [dragonballs, setDragonballs] = useState(0)
  /* 1~7성구 도감 — 성구별 보유 개수 */
  const [dexMap, setDexMap] = useState<Record<string, number>>(EMPTY_DRAGONBALLS)
  /* 일반용 7종 · 무지개용 · 교환권 */
  const [dragons, setDragons] = useState<DragonMap>(EMPTY_DRAGONS)
  const [rainbow, setRainbow] = useState(0)
  /* 히든 검은용 — 가진 학생에게만 화면에 보인다 */
  const [black, setBlack] = useState(0)
  const [secretReveal, setSecretReveal] = useState(false)
  const [tickets, setTickets] = useState<TicketCounts>(EMPTY_TICKETS)
  const [working, setWorking] = useState<string | null>(null)
  const [cardError, setCardError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /* 일반용이 태어난 순간 */
  const [born, setBorn] = useState<{ color: string } | null>(null)
  /* 무지개용이 나타난 순간 */
  const [summon, setSummon] = useState<{ rainbow: number; total: number } | null>(null)
  /* 포인트 교환권으로 바꾸기 전 확인 */
  const [confirmPoint, setConfirmPoint] = useState<{ kind: 'dragon' | 'rainbow' | 'secret' } | null>(null)
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
      setDexMap(profile.data.dragonballs ?? EMPTY_DRAGONBALLS)
      setDragons(normalizeDragonMap(profile.data.dragons))
      setRainbow(normalizeTicketCount(profile.data.rainbow_dragon_count))
      setBlack(normalizeBlackDragon(profile.data.black_dragon_count))
      setTickets(ticketCounts(profile.data))
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
  const dex = useMemo(() => dragonballDex(dexMap), [dexMap])
  const collected = useMemo(() => dragonballKinds(dexMap), [dexMap])
  const dexTotal = useMemo(() => dragonballTotal(dexMap), [dexMap])
  /* 도감에 담긴 합계와 총 개수가 다르면(서버가 아직 성구를 안 보낸 경우) 총 개수를 따른다 */
  const totalBalls = Math.max(dragonballs, dexTotal)
  const myDragons = useMemo(() => dragonDex(dragons), [dragons])
  const dragonCount = useMemo(() => dragonTotal(dragons), [dragons])

  const canCandy = canExchangeCandy(dexMap)
  const canColor = canCraftColorDragon(dexMap)
  const canRainbow = canCraftRainbowDragon(dragons)
  const canSecret = canExchangeSecretTicket(black)
  const missingStars = dex.filter((slot) => !slot.owned).map((slot) => `${slot.stars}성구`)
  const missingColors = myDragons.filter((slot) => !slot.owned).map((slot) => slot.name.replace('용', ''))

  /** 성구 2개 → 사탕교환권 */
  const exchangeCandy = async () => {
    if (working || !canCandy) return
    setWorking('candy')
    setCardError(null)
    setNotice(null)
    const res = await api.exchangeCandyTicket(studentId)
    setWorking(null)
    if (res.ok) {
      setDragonballs(Math.max(0, Number(res.data.total ?? 0)))
      setDexMap(res.data.dragonballs ?? EMPTY_DRAGONBALLS)
      setTickets((current) => ({ ...current, candy: normalizeTicketCount(res.data.candy_tickets) }))
      setNotice(candyExchangeText(res.data.used))
      void load()
    } else {
      setCardError(res.error)
      void load()
    }
  }

  /** 1~7성구 하나씩 → 일반용 7종 중 랜덤 1마리 */
  const craftColor = async () => {
    if (working || !canColor) return
    setWorking('color')
    setCardError(null)
    setNotice(null)
    const res = await api.craftColorDragon(studentId)
    setWorking(null)
    if (res.ok) {
      setDragonballs(Math.max(0, Number(res.data.total ?? 0)))
      setDexMap(res.data.dragonballs ?? EMPTY_DRAGONBALLS)
      setDragons(normalizeDragonMap(res.data.dragons))
      setRainbow(normalizeTicketCount(res.data.rainbow_dragon_count))
      setBlack(normalizeBlackDragon(res.data.black_dragon_count))
      setBorn({ color: res.data.color })
      if (res.data.bonus_black) setSecretReveal(true)
      void load()
    } else {
      setCardError(res.error)
      void load()
    }
  }

  /** 일반용 7종 하나씩 → 무지개용 */
  const craftRainbow = async () => {
    if (working || !canRainbow) return
    setWorking('rainbow')
    setCardError(null)
    setNotice(null)
    const res = await api.craftRainbowDragon(studentId)
    setWorking(null)
    if (res.ok) {
      setDragons(normalizeDragonMap(res.data.dragons))
      setRainbow(normalizeTicketCount(res.data.rainbow_dragon_count))
      setBlack(normalizeBlackDragon(res.data.black_dragon_count))
      setSummon({ rainbow: res.data.rainbow_dragon_count, total: res.data.dragon_total })
      if (res.data.bonus_black) setSecretReveal(true)
      void load()
    } else {
      setCardError(res.error)
      void load()
    }
  }

  /** 일반용 → 1,000포인트 / 무지개용 → 10,000포인트 교환권 */
  const exchangePoint = async (kind: 'dragon' | 'rainbow') => {
    if (working) return
    setConfirmPoint(null)
    setWorking(kind === 'rainbow' ? 'point10000' : 'point1000')
    setCardError(null)
    setNotice(null)
    const res = await api.exchangePointTicket(studentId, kind)
    setWorking(null)
    if (res.ok) {
      setDragons(normalizeDragonMap(res.data.dragons))
      setRainbow(normalizeTicketCount(res.data.rainbow_dragon_count))
      setTickets(ticketCounts(res.data))
      setNotice(
        kind === 'rainbow'
          ? '무지개용 1마리를 10,000포인트 교환권 1장으로 바꿨어요!'
          : `${res.data.color ? dragonName(res.data.color) : '일반용'} 1마리를 1,000포인트 교환권 1장으로 바꿨어요!`,
      )
      void load()
    } else {
      setCardError(res.error)
      void load()
    }
  }

  /** 검은용 1마리 → 시크릿쿠폰 1장 */
  const exchangeSecret = async () => {
    if (working) return
    setConfirmPoint(null)
    setWorking('secret')
    setCardError(null)
    setNotice(null)
    const res = await api.exchangeSecretTicket(studentId)
    setWorking(null)
    if (res.ok) {
      setBlack(normalizeBlackDragon(res.data.black_dragon_count))
      setTickets((current) => ({ ...current, secret: normalizeTicketCount(res.data.secret_tickets) }))
      setNotice('검은용 1마리를 시크릿쿠폰 1장으로 바꿨어요!')
      void load()
    } else {
      setCardError(res.error)
      void load()
    }
  }

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
      if (res.data.dragonballs) setDexMap(res.data.dragonballs)
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

      {/* 내 드래곤볼 · 일반용 7종 · 무지개용 · 교환권 */}
      <section className="mt-4 rounded-3xl border border-[#F3C978] bg-gradient-to-br from-[#FFF8E8] via-[#FFEFC9] to-[#FFE1A8] p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 font-round text-[15px] font-extrabold text-[#7A4A00]">
            <span aria-hidden="true">🐉</span> 내 드래곤볼
          </h2>
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-[#9A6400]">1~7성구 도감</span>
        </div>

        {/* 교환권 — 학원에서 실제로 받은 뒤 관리자가 사용 처리한다 */}
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {ticketChips(tickets).map((ticket) => {
            const count = tickets[ticket.key]
            return (
              <div
                key={ticket.key}
                className={`flex items-center gap-1.5 rounded-2xl px-2 py-1.5 shadow-sm ring-1 ${
                  count > 0 ? 'bg-white/95 ring-white' : 'bg-white/55 ring-white/60'
                }`}
                title={ticket.name}
              >
                <img src={ticket.icon} alt="" className={`h-6 w-6 shrink-0 ${count > 0 ? '' : 'opacity-45'}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[9.5px] font-bold text-[#9A6400]">{ticket.short}</span>
                  <span
                    className={`block text-[12px] font-extrabold leading-none tabular ${
                      count > 0 ? 'text-[#7A4A00]' : 'text-[#A97516]/50'
                    }`}
                  >
                    {count}장
                  </span>
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-end gap-x-2 gap-y-1">
          <p className="font-round text-[34px] font-extrabold leading-none text-[#7A4A00] tabular">{totalBalls}</p>
          <p className="pb-1 text-[13px] font-bold text-[#9A6400]">개</p>
          <p className="pb-1 text-[11.5px] font-extrabold text-[#A97516]">{`${collected}/7종 수집`}</p>
          {totalBalls === 0 ? (
            <p className="pb-1 text-[11px] font-semibold text-[#A97516]">선오공이가 쏘면 여기에 모여요</p>
          ) : null}
        </div>

        {/* 7칸 도감 — 모은 성구는 컬러, 못 모은 성구는 흐리게 */}
        <ul className="mt-3 grid grid-cols-7 gap-1">
          {dex.map((slot) => (
            <li
              key={slot.stars}
              className={`relative flex flex-col items-center rounded-2xl px-0.5 pb-1 pt-1.5 ${
                slot.owned ? 'bg-white/85 shadow-sm ring-1 ring-[#F3C978]' : 'bg-white/35 ring-1 ring-white/50'
              }`}
            >
              <Dragonball size="lg" stars={slot.stars} filled={slot.owned} />
              <span className={`mt-0.5 text-[9.5px] font-extrabold ${slot.owned ? 'text-[#7A4A00]' : 'text-[#A97516]/60'}`}>
                {`${slot.stars}성`}
              </span>
              <span
                className={`mt-0.5 rounded-full px-1 text-[9.5px] font-extrabold tabular ${
                  slot.owned ? 'bg-[#F08C00] text-white' : 'bg-white/60 text-[#A97516]/60'
                }`}
              >
                {slot.owned ? `×${slot.count}` : '–'}
              </span>
            </li>
          ))}
        </ul>

        {/* 성구·드래곤 바꾸기 */}
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <ExchangeButton
            title="사탕교환권"
            sub={`성구 ${CANDY_TICKET_COST}개 → 1장`}
            tone="candy"
            disabled={!canCandy}
            busy={working === 'candy'}
            onClick={() => void exchangeCandy()}
          />
          <ExchangeButton
            title="일반용 뽑기"
            sub="1~7성구 하나씩"
            tone="dragon"
            disabled={!canColor}
            busy={working === 'color'}
            onClick={() => void craftColor()}
          />
        </div>
        {!canColor && missingStars.length > 0 ? (
          <p className="mt-1.5 text-center text-[10px] font-semibold text-[#A97516]/85">
            {missingStars.join(' · ')}만 더 모으면 일반용을 뽑아요
          </p>
        ) : null}

        {/* 일반용 7종 — 다 모으면 무지개용 */}
        <div className="mt-3 rounded-2xl bg-white/70 p-2.5 ring-1 ring-white">
          <div className="flex items-center justify-between gap-1.5">
            <p className="text-[11.5px] font-extrabold text-[#7A4A00]">
              🐲 내 일반용 <span className="text-[10px] font-bold text-[#A97516]">{dragonSummaryText(dragons)}</span>
            </p>
            <div className="flex shrink-0 items-center gap-1">
              {black > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF0F5] px-1.5 py-0.5 text-[10px] font-extrabold text-[#252A38]">
                  <img src={BLACK_DRAGON.icon} alt="" className="h-4 w-4" aria-hidden="true" />
                  {black}마리
                </span>
              ) : null}
              {rainbow > 0 ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#F3EDFF] px-1.5 py-0.5 text-[10px] font-extrabold text-[#5B3FB8]">
                  <img src={RAINBOW_DRAGON.icon} alt="" className="h-4 w-4" aria-hidden="true" />
                  {rainbow}마리
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-1.5 grid grid-cols-7 gap-1">
            {myDragons.map((slot) => (
              <div
                key={slot.key}
                className={`flex flex-col items-center rounded-xl px-0.5 py-1 ${
                  slot.owned ? 'bg-white shadow-sm' : 'bg-white/40'
                }`}
                title={`${slot.name} ${slot.count}마리`}
              >
                <img
                  src={slot.icon}
                  alt=""
                  className={`h-8 w-8 object-contain ${slot.owned ? '' : 'opacity-25 grayscale'}`}
                  aria-hidden="true"
                />
                <span
                  className={`mt-0.5 text-[9px] font-extrabold tabular ${
                    slot.owned ? 'text-[#7A4A00]' : 'text-[#A97516]/50'
                  }`}
                >
                  {slot.owned ? `×${slot.count}` : '–'}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <ExchangeButton
              title="무지개용"
              sub="일반용 7종 하나씩"
              tone="rainbow"
              disabled={!canRainbow}
              busy={working === 'rainbow'}
              onClick={() => void craftRainbow()}
            />
            <ExchangeButton
              title="1,000P 교환권"
              sub="일반용 1마리"
              tone="point"
              disabled={dragonCount < 1}
              busy={working === 'point1000'}
              onClick={() => setConfirmPoint({ kind: 'dragon' })}
            />
          </div>
          {!canRainbow && missingColors.length > 0 ? (
            <p className="mt-1.5 text-center text-[10px] font-semibold text-[#A97516]/85">
              {missingColors.join(' · ')} 용을 모으면 무지개용!
            </p>
          ) : null}

          <div className="mt-1.5">
            <ExchangeButton
              title="무지개용 → 10,000P"
              sub="무지개용 1마리"
              tone="pointBig"
              disabled={rainbow < 1}
              busy={working === 'point10000'}
              onClick={() => setConfirmPoint({ kind: 'rainbow' })}
            />
          </div>

          {/* 히든 검은용 — 가진 학생에게만 보인다 */}
          {black > 0 ? (
            <div className="mt-1.5">
              <button
                type="button"
                disabled={!canSecret || working === 'secret'}
                onClick={() => setConfirmPoint({ kind: 'secret' })}
                className="flex min-h-[52px] w-full flex-col items-center justify-center rounded-2xl bg-[#252A38] px-2 py-2 text-center text-white shadow-soft transition active:scale-[0.98] disabled:opacity-40"
              >
                <span className="text-[12.5px] font-extrabold leading-tight">
                  {working === 'secret' ? '바꾸는 중…' : '검은용 → 시크릿쿠폰'}
                </span>
                <span className="mt-0.5 text-[9.5px] font-semibold text-white/70">검은용 1마리</span>
              </button>
            </div>
          ) : null}
        </div>

        {notice ? (
          <p className="mt-2 rounded-xl bg-white/85 px-2.5 py-1.5 text-center text-[11px] font-bold text-[#7A4A00]">
            {notice}
          </p>
        ) : null}
        {cardError ? <p className="mt-1.5 text-center text-[11px] font-bold text-red-500">{cardError}</p> : null}

        <p className="mt-2 text-[10px] font-semibold text-[#A97516]/80">
          {ticketSummaryText(tickets)} · 교환권은 학원에서 실제로 받은 뒤 관리자가 사용 처리해요
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

      {/* 🐲 일반용이 태어났다 */}
      <Modal
        open={born !== null}
        title="새 일반용 탄생!"
        onClose={() => setBorn(null)}
        footer={
          <button type="button" className="btn-navy px-5" onClick={() => setBorn(null)}>
            좋아!
          </button>
        }
      >
        <div className="flex flex-col items-center pb-1 pt-1">
          <span
            aria-hidden="true"
            className="shenron-glow pointer-events-none absolute top-10 h-36 w-36 rounded-full bg-gradient-to-br from-[#FFE9B8] via-[#FFF6DA] to-[#FFD9E2] blur-2xl"
          />
          <img
            src={born ? DRAGON_BY_KEY[born.color as keyof typeof DRAGON_BY_KEY]?.icon ?? RAINBOW_DRAGON.icon : RAINBOW_DRAGON.icon}
            alt={born ? dragonName(born.color) : '일반용'}
            className="shenron-summon relative h-44 w-44 drop-shadow-[0_10px_22px_rgba(120,90,40,0.25)]"
          />
          <p className="relative mt-2 text-center font-round text-[16px] font-extrabold text-[#7A4A00]">
            {born ? dragonCraftText(born.color) : ''}
          </p>
          <p className="relative mt-1 text-center text-[12px] font-semibold text-navy/55">
            일반용 7종을 다 모으면 무지개용을 만들 수 있어요!
          </p>
        </div>
      </Modal>

      {/* 어둠 속의 검은용 — 가진 학생에게만 이 순간에 보인다 */}
      <Modal
        open={born === null && summon === null && secretReveal}
        title="???"
        onClose={() => setSecretReveal(false)}
        footer={
          <button type="button" className="btn-navy px-5" onClick={() => setSecretReveal(false)}>
            좋아!
          </button>
        }
      >
        <div className="relative flex flex-col items-center pb-1 pt-2">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-8 h-40 w-40 rounded-full bg-[#252A38]/20 blur-2xl"
          />
          <img
            src={BLACK_DRAGON.icon}
            alt="검은용"
            className="shenron-summon relative h-48 w-48 drop-shadow-[0_10px_22px_rgba(20,22,30,0.45)]"
          />
          <p className="relative mt-2 text-center font-round text-[16px] font-extrabold text-[#252A38]">
            어둠 속에서 검은용이 나타났어요!
          </p>
          <p className="relative mt-1 text-center text-[12px] font-semibold text-navy/55">
            검은용 1마리를 시크릿쿠폰 1장으로 바꿀 수 있어요.
          </p>
        </div>
      </Modal>

      {/* 🌈 무지개용 등장 */}
      <Modal
        open={summon !== null}
        title={SHENRON_SUMMON_TITLE}
        onClose={() => setSummon(null)}
        footer={
          <button type="button" className="btn-navy px-5" onClick={() => setSummon(null)}>
            좋아!
          </button>
        }
      >
        <div className="relative flex flex-col items-center pb-1 pt-2">
          <span
            aria-hidden="true"
            className="shenron-glow pointer-events-none absolute top-6 h-40 w-40 rounded-full bg-gradient-to-br from-[#FFD9E2] via-[#FFF3C4] to-[#DCE9FF] blur-2xl"
          />
          <span aria-hidden="true" className="shenron-spark pointer-events-none absolute left-5 top-2 text-[22px]">
            ✨
          </span>
          <span aria-hidden="true" className="shenron-spark pointer-events-none absolute right-6 top-8 text-[26px]">
            🌟
          </span>
          <img
            src={SHENRON_ICON}
            alt="무지개용"
            className="shenron-summon relative h-52 w-52 drop-shadow-[0_10px_24px_rgba(140,110,190,0.28)]"
          />
          <p className="relative mt-2 text-center font-round text-[15px] font-extrabold text-[#5B4B8A]">
            일반용이 빛나며 무지개용이 나타났어요!
          </p>
          <p className="relative mt-1 text-center text-[12px] font-semibold text-navy/55">
            {summon ? summonMessage(summon.rainbow, summon.total) : ''}
          </p>
          <div className="relative mt-3 flex items-center gap-2 rounded-2xl bg-[#F7F3FF] px-3 py-2">
            <img src={SHENRON_ICON} alt="" className="h-7 w-7" aria-hidden="true" />
            <span className="text-[12px] font-extrabold text-[#5B4B8A]">무지개용 {summon?.rainbow ?? 0}마리 보유</span>
          </div>
        </div>
      </Modal>

      {/* 포인트 교환권으로 바꾸기 전 한 번 더 확인 */}
      <Modal
        open={confirmPoint !== null}
        title={confirmPoint?.kind === 'secret' ? '시크릿쿠폰으로 바꿀까요?' : '포인트 교환권으로 바꿀까요?'}
        onClose={() => setConfirmPoint(null)}
        footer={
          <>
            <button type="button" className="btn-outline px-4" onClick={() => setConfirmPoint(null)}>
              취소
            </button>
            <button
              type="button"
              className="btn-navy px-4"
              onClick={() =>
                confirmPoint?.kind === 'secret' ? void exchangeSecret() : void exchangePoint(confirmPoint?.kind ?? 'dragon')
              }
            >
              바꾸기
            </button>
          </>
        }
      >
        {confirmPoint?.kind === 'secret' ? (
          <p className="text-[13px] font-semibold text-navy/70">
            검은용 <b>1마리</b>를 <b>시크릿쿠폰 1장</b>으로 바꿔요. 되돌릴 수 없어요.
          </p>
        ) : confirmPoint?.kind === 'rainbow' ? (
          <p className="text-[13px] font-semibold text-navy/70">
            무지개용 <b>1마리</b>를 <b>10,000포인트 교환권 1장</b>으로 바꿔요. 되돌릴 수 없어요.
          </p>
        ) : (
          <p className="text-[13px] font-semibold text-navy/70">
            일반용 <b>1마리</b>를 <b>1,000포인트 교환권 1장</b>으로 바꿔요. 가장 많이 모은 색부터 빠져요.
            <br />
            되돌릴 수 없어요.
          </p>
        )}
        <p className="mt-2 text-[11px] font-semibold text-navy/40">
          교환권은 학원에서 실제로 받은 뒤 관리자가 사용 처리해요.
        </p>
      </Modal>
    </>
  )
}
