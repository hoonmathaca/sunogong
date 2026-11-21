/**
 * 근두운(실시간 공부 현황) · 드래곤볼 표시용 순수 함수 모음.
 *
 * 화면(DOM)을 건드리지 않고 계산만 하므로 tools/lib-test.ts 에서 그대로 확인한다.
 *
 * · 닉네임은 실명 대신 보여 주는 별명이다. 비어 있으면 '수련생'.
 * · 서버(live_study_board)는 닉네임·상태·시작 시각·지난 초만 준다.
 *   실명(name)·학년·학생 id 는 화면으로 내보내지 않는다.
 */

import { HEARTBEAT_TIMEOUT_MS, parseMs } from './time'
import { computeElapsedSeconds } from './session'
import { normalizeKind } from './kinds'
import type { StudySession } from './types'

/** 닉네임 최대 글자 수 (DB 제약과 같다) */
export const NICKNAME_MAX = 10
/** 닉네임을 정하지 않은 학생에게 보여 주는 이름 */
export const DEFAULT_NICKNAME = '수련생'
/** 한 번에 쏠 수 있는 드래곤볼 최대 개수 (DB 제약과 같다) */
export const DRAGONBALL_MAX_AMOUNT = 99
/** 드래곤볼 한 세트 (1~7성구 하나씩) */
export const DRAGONBALL_SET_SIZE = 7
/** 무지개 볼 아이콘 — 칠성구를 합쳐서 만든다 */
export const RAINBOW_BALL_ICON = '/dragonballs/rainbow.png'
/** 무지개 신룡 아이콘 — 칠성구를 합칠 때 '짜잔!' 하고 소환된다 */
export const SHENRON_ICON = '/dragonballs/shenron.png'

/* ------------------------------------------------------------------ */
/* 1~7성구 도감                                                         */
/* ------------------------------------------------------------------ */

/** 성구 종류 — 1성구 ~ 7성구 */
export const DRAGONBALL_STARS = [1, 2, 3, 4, 5, 6, 7] as const
export type DragonballStars = (typeof DRAGONBALL_STARS)[number]

/** 성구별 보유 개수 맵 — 키는 '1'~'7', 값은 0 이상의 정수 */
export type DragonballMap = Record<string, number>

/** 아직 하나도 없는 성구 맵 */
export const EMPTY_DRAGONBALLS: DragonballMap = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0 }
/** 아이콘으로 그리는 드래곤볼 최대 개수 (그보다 많으면 숫자로만 보여 준다) */
export const DRAGONBALL_ICON_MAX = 12
/** 근두운 현황을 다시 읽는 주기 */
export const LIVE_REFRESH_MS = 15_000
/** 한 화면에 띄우는 근두운 최대 개수 (넘치는 인원은 '외 N명') */
export const MAX_CLOUDS = 12
/** 실시간 순위에 보여 주는 최대 인원 */
export const RANK_LIMIT = 5

export type LiveStatus = 'running' | 'paused'

/** 서버(live_study_board)가 주는 한 줄 */
export interface LiveRow {
  nickname: string
  status: string
  started_at: string
  seconds: number
  is_me?: boolean
  /** 그 학생의 성구별 보유 개수 맵 (1~7성구) */
  dragonballs?: DragonballMap | null
  /** 만든 무지개 볼 개수 */
  rainbow_ball_count?: number | null
}

/** 서버(live_study_board)의 응답 */
export interface LiveBoard {
  server_now: string
  running_count: number
  students: LiveRow[]
}

/** 화면에 띄우는 구름 한 개 */
export interface CloudItem {
  label: string
  seconds: number
  isMe: boolean
}

/** 실시간 순위 한 줄 */
export interface RankItem {
  position: number
  label: string
  seconds: number
  isMe: boolean
}

/** 구름이 떠다니는 속도·박자 (인덱스마다 조금씩 달라서 서로 부딪히지 않는다) */
export interface CloudMotion {
  /** 위아래로 떠다니는 시간 */
  duration: string
  /** 좌우로 흔들리는 시간 */
  drift: string
  /** 시작 어긋남 (음수 = 이미 떠 있는 상태로 시작) */
  delay: string
}

/* ------------------------------------------------------------------ */
/* 닉네임                                                              */
/* ------------------------------------------------------------------ */

/** 줄바꿈·탭을 공백으로 바꾸고 앞뒤 공백을 지운다 */
function flatten(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 저장할 닉네임 모양으로 정리 (비어 있으면 null) */
export function normalizeNickname(raw: unknown): string | null {
  const text = flatten(raw).slice(0, NICKNAME_MAX).trim()
  return text.length > 0 ? text : null
}

/** 화면에 보여 줄 이름 — 닉네임이 없으면 '수련생' */
export function displayNickname(raw: unknown): string {
  return normalizeNickname(raw) ?? DEFAULT_NICKNAME
}

export type NicknameCheck = { ok: true; value: string | null } | { ok: false; error: string }

/** 닉네임 입력 검사 — 빈 값은 null('수련생'으로 되돌리기) */
export function validateNickname(raw: unknown): NicknameCheck {
  const text = flatten(raw)
  if (text.length > NICKNAME_MAX) {
    return { ok: false, error: `닉네임은 ${NICKNAME_MAX}자까지 쓸 수 있어요.` }
  }
  return { ok: true, value: text.length > 0 ? text : null }
}

/* ------------------------------------------------------------------ */
/* 시간 표시                                                           */
/* ------------------------------------------------------------------ */

/** 초 → '12:34' (한 시간이 넘으면 '1:02:03') */
export function formatLiveClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const two = (value: number) => String(value).padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`
}

/**
 * 서버에서 받은 뒤 흐른 시간만큼 진행 시간을 늘린다.
 * (공부 중인 세션만 늘고, 일시정지한 세션은 그대로)
 */
export function tickSeconds(row: { status: string; seconds: number }, fetchedAtMs: number, nowMs: number): number {
  const base = Math.max(0, Math.floor(row.seconds || 0))
  if (row.status !== 'running') return base
  const delta = Math.floor(Math.max(0, nowMs - fetchedAtMs) / 1000)
  return Math.min(18000, base + delta)
}

/** 순위·구름에 쓸 줄로 바꾸면서 지난 시간을 다시 센다 */
export function tickRows(rows: LiveRow[], fetchedAtMs: number, nowMs: number): LiveRow[] {
  return rows.map((row) => ({ ...row, seconds: tickSeconds(row, fetchedAtMs, nowMs) }))
}

/* ------------------------------------------------------------------ */
/* 근두운 (지금 공부 중인 친구들)                                       */
/* ------------------------------------------------------------------ */

/** 같은 이름이 둘 이상이면 '수련생 A · 수련생 B' 처럼 구분해 준다 */
export function uniqueLabels(rows: { nickname: string; started_at: string }[]): string[] {
  const base = rows.map((row) => displayNickname(row.nickname))
  const groups = new Map<string, number[]>()
  base.forEach((label, index) => {
    const list = groups.get(label) ?? []
    list.push(index)
    groups.set(label, list)
  })

  const out = [...base]
  groups.forEach((indexes, label) => {
    if (indexes.length < 2) return
    const order = [...indexes].sort((a, b) => {
      const left = rows[a]?.started_at ?? ''
      const right = rows[b]?.started_at ?? ''
      return left < right ? -1 : left > right ? 1 : 0
    })
    order.forEach((index, seat) => {
      out[index] = `${label} ${String.fromCharCode(65 + Math.min(seat, 25))}`
    })
  })
  return out
}

/** 공부 중(running)인 친구들의 구름 — 오래 공부한 순서 */
export function cloudItems(rows: LiveRow[], max: number = MAX_CLOUDS): { clouds: CloudItem[]; hidden: number } {
  const running = rows.filter((row) => row.status === 'running')
  const labels = uniqueLabels(running)
  const ordered = running
    .map((row, index) => ({
      row,
      label: labels[index] ?? displayNickname(row.nickname),
      index,
    }))
    .sort((a, b) => (b.row.seconds - a.row.seconds) || (a.index - b.index))

  const clouds = ordered.slice(0, Math.max(0, max)).map(({ row, label }) => ({
    label,
    seconds: row.seconds,
    isMe: Boolean(row.is_me),
  }))
  return { clouds, hidden: Math.max(0, ordered.length - clouds.length) }
}

/**
 * 타이머 화면의 한 줄 근두운 — 공부 중 인원 수와 이름 몇 개.
 * 서버가 준 running_count 가 있으면 그 값을, 없으면 공부 중인 줄을 센다.
 */
export interface LiveStrip {
  count: number
  items: CloudItem[]
  hidden: number
}

export function liveStrip(rows: LiveRow[], runningCount: number | null | undefined, max: number = 3): LiveStrip {
  const found = cloudItems(rows, max)
  const running = rows.filter((row) => row.status === 'running').length
  const count =
    typeof runningCount === 'number' && Number.isFinite(runningCount) && runningCount >= 0
      ? Math.floor(runningCount)
      : running
  return { count, items: found.clouds, hidden: found.hidden }
}

/** 지금 멈추지 않고 이어서 공부 중인 친구들의 실시간 순위 (동점은 같은 순위) */
export function liveRanking(rows: LiveRow[], limit: number = RANK_LIMIT): RankItem[] {
  const running = rows.filter((row) => row.status === 'running')
  const labels = uniqueLabels(running)
  const sorted = running
    .map((row, index) => ({ row, label: labels[index] ?? displayNickname(row.nickname), index }))
    .sort((a, b) => (b.row.seconds - a.row.seconds) || (a.index - b.index))

  let position = 0
  let previous: number | null = null
  const ranked = sorted.map((entry, index) => {
    if (previous === null || entry.row.seconds !== previous) {
      position = index + 1
      previous = entry.row.seconds
    }
    return { position, label: entry.label, seconds: entry.row.seconds, isMe: Boolean(entry.row.is_me) }
  })
  return limit > 0 ? ranked.slice(0, limit) : ranked
}

/**
 * 내 줄이 지금 공부 중(running)으로 실려 있는지.
 * 타이머 화면에서 세션을 막 시작했는데 서버 현황에 아직 안 실렸는지 판단할 때 쓴다.
 */
export function hasRunningRow(rows: LiveRow[]): boolean {
  return rows.some((row) => Boolean(row.is_me) && row.status === 'running')
}

/** 내 실시간 순위 (공부 중이 아니면 null) */
export function myLivePosition(rows: LiveRow[]): { position: number; total: number } | null {
  const me = rows.find((row) => row.is_me && row.status === 'running')
  if (!me) return null
  const running = rows.filter((row) => row.status === 'running')
  const position = running.filter((row) => row.seconds > me.seconds).length + 1
  return { position, total: running.length }
}

/** 잠깐 쉬는 중인 친구 이름 (구름에는 띄우지 않고 한 줄로만 알려 준다) */
export function pausedLabels(rows: LiveRow[]): string[] {
  const paused = rows.filter((row) => row.status === 'paused')
  return uniqueLabels(paused)
}

/** 구름마다 조금씩 다른 떠다니는 박자 */
export function cloudMotion(index: number): CloudMotion {
  const i = Math.max(0, Math.floor(index || 0))
  return {
    duration: `${(3.8 + (i % 5) * 0.45).toFixed(2)}s`,
    drift: `${(6.4 + (i % 3) * 0.9).toFixed(2)}s`,
    delay: `-${((i * 0.73) % 4.2).toFixed(2)}s`,
  }
}

/* ------------------------------------------------------------------ */
/* 드래곤볼                                                            */
/* ------------------------------------------------------------------ */

/** 보유 개수 → 큰 숫자와 아이콘 */
export function dragonballIconCount(count: number): { filled: number; extra: number } {
  const total = Math.max(0, Math.floor(count || 0))
  const filled = Math.min(total, DRAGONBALL_ICON_MAX)
  return { filled, extra: total - filled }
}

/** '12개' — 제한 없이 계속 쌓인다 */
export function dragonballCountText(count: number): string {
  return `${Math.max(0, Math.floor(count || 0))}개`
}

/** 한 세트(7개) 기준으로 몇 세트인지 — 교환 버튼은 없다(정책 미정) */
export function dragonballSets(count: number): { sets: number; rest: number } {
  const total = Math.max(0, Math.floor(count || 0))
  return { sets: Math.floor(total / DRAGONBALL_SET_SIZE), rest: total % DRAGONBALL_SET_SIZE }
}

/* ------------------------------------------------------------------ */
/* 1~7성구 도감 계산                                                    */
/* ------------------------------------------------------------------ */

/**
 * 서버에서 온 성구 맵을 1~7 키의 숫자 맵으로 정리한다.
 * (없거나 이상한 값은 0으로 본다 — 화면이 깨지지 않게)
 */
export function normalizeDragonballMap(raw: unknown): Record<number, number> {
  const out: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 }
  if (!raw || typeof raw !== 'object') return out
  const source = raw as Record<string, unknown>
  for (const star of DRAGONBALL_STARS) {
    const value = Math.floor(Number(source[String(star)] ?? 0))
    out[star] = Number.isFinite(value) && value > 0 ? value : 0
  }
  return out
}

/** 성구를 모두 더한 총 개수 */
export function dragonballTotal(raw: unknown): number {
  const map = normalizeDragonballMap(raw)
  return DRAGONBALL_STARS.reduce((sum, star) => sum + map[star], 0)
}

/** 모은 성구 종류 수 (0~7) */
export function dragonballKinds(raw: unknown): number {
  const map = normalizeDragonballMap(raw)
  return DRAGONBALL_STARS.filter((star) => map[star] > 0).length
}

/** 'N개 · M/7종 수집' */
export function dragonballSummaryText(raw: unknown): string {
  return `${dragonballTotal(raw)}개 · ${dragonballKinds(raw)}/7종 수집`
}

/** 도감 한 칸 — 성구 종류, 보유 개수, 아이콘 주소 */
export interface DragonballDexSlot {
  stars: DragonballStars
  count: number
  /** 1개 이상 모았는지 (못 모았으면 흐리게 보여 준다) */
  owned: boolean
  icon: string
}

/** 1성구~7성구 도감 일곱 칸 */
export function dragonballDex(raw: unknown): DragonballDexSlot[] {
  const map = normalizeDragonballMap(raw)
  return DRAGONBALL_STARS.map((star) => ({
    stars: star,
    count: map[star],
    owned: map[star] > 0,
    icon: dragonballIcon(star),
  }))
}

/** 성구 아이콘 주소 (public/dragonballs/1.png ~ 7.png) */
export function dragonballIcon(stars: number): string {
  const value = Math.min(7, Math.max(1, Math.floor(Number(stars) || 1)))
  return `/dragonballs/${value}.png`
}

/* ------------------------------------------------------------------ */
/* 무지개 볼 — 칠성구를 합쳐서 만든다                                    */
/* ------------------------------------------------------------------ */

/** 무지개 볼 개수 (0 이상 정수) */
export function normalizeRainbowCount(raw: unknown): number {
  const value = Math.floor(Number(raw ?? 0))
  return Number.isFinite(value) && value > 0 ? value : 0
}

/** 1~7성구를 모두 하나씩 갖고 있는지 — 합치기 버튼이 열리는 조건 */
export function canCraftRainbowBall(raw: unknown): boolean {
  const map = normalizeDragonballMap(raw)
  return DRAGONBALL_STARS.every((star) => map[star] >= 1)
}

/** 합칠 때 사라지는 성구 수 (칠성구 하나씩 = 7개) */
export const RAINBOW_CRAFT_COST = DRAGONBALL_SET_SIZE

/**
 * 드래곤볼 힘 — 무지개 볼 1개를 성구 7개로 쳐서 남은 성구와 더한다.
 * (관리자 랭킹 정렬에 쓴다: 무지개 볼이 있으면 그만큼 앞선다)
 */
export function dragonballPower(profile: {
  dragonballs?: unknown
  rainbow_ball_count?: unknown
  dragonball_count?: unknown
}): number {
  const rainbow = normalizeRainbowCount(profile.rainbow_ball_count)
  const map = normalizeDragonballMap(profile.dragonballs)
  const mapTotal = DRAGONBALL_STARS.reduce((sum, star) => sum + map[star], 0)
  const total = Math.max(mapTotal, Math.floor(Number(profile.dragonball_count ?? 0)) || 0)
  return rainbow * DRAGONBALL_SET_SIZE + total
}

/** '무지개 볼 2개' */
export function rainbowBallText(raw: unknown): string {
  return `무지개 볼 ${normalizeRainbowCount(raw)}개`
}

/** 합치기 결과 안내 — '짜잔! 무지개 신룡이 나타났어요!' */
export const SHENRON_SUMMON_TITLE = '짜잔! 무지개 신룡 소환!'

export function summonMessage(rainbowCount: number, total: number): string {
  const rainbow = normalizeRainbowCount(rainbowCount)
  const rest = Math.max(0, Math.floor(Number(total) || 0))
  return `칠성구를 합쳐 무지개 볼 ${rainbow}개째를 만들었어요. 남은 성구는 ${rest}개!`
}

/** '4성구' */
export function starName(stars: number): string {
  return `${Math.min(7, Math.max(1, Math.floor(Number(stars) || 1)))}성구`
}

/**
 * 받은 성구 목록을 짧은 글로 — '4성구 · 7성구', 같은 성구가 여러 개면 '1성구 ×3'
 * (너무 길면 뒤는 '외 N종')
 */
export function starListText(stars: readonly number[] | null | undefined, max = 4): string {
  const counts = new Map<number, number>()
  for (const star of stars ?? []) {
    const value = Math.floor(Number(star))
    if (!Number.isFinite(value) || value < 1 || value > 7) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  if (counts.size === 0) return ''
  /* 나온 순서 그대로 (개수가 많은 것부터 정렬하면 실제로 뽑힌 차례를 알 수 없다) */
  const entries = [...counts.entries()]
  const shown = entries.slice(0, Math.max(1, max)).map(([star, count]) =>
    count > 1 ? `${starName(star)} ×${count}` : starName(star),
  )
  const hidden = entries.length - shown.length
  return hidden > 0 ? `${shown.join(' · ')} 외 ${hidden}종` : shown.join(' · ')
}

/** 입력한 개수를 1~99 사이 정수로 */
export function normalizeGrantAmount(raw: unknown): number {
  const value = Math.floor(Number(raw))
  if (!Number.isFinite(value) || value < 1) return 1
  return Math.min(DRAGONBALL_MAX_AMOUNT, value)
}

/** 지급 대상 — 공부 중인 학생 (관리자가 '쉬는 중 포함'을 켜면 일시정지도) */
export function grantTargets<T extends { status: string }>(rows: T[], includePaused: boolean): T[] {
  return rows.filter((row) => row.status === 'running' || (includePaused && row.status === 'paused'))
}

/** 지급 결과 안내 문구 — 랜덤 1~7성구 · 개별이면 나온 성구도 보여 준다 */
export function grantResultText(
  granted: number,
  amount: number,
  mode: 'all' | 'single',
  stars?: readonly number[] | null,
): string {
  if (granted <= 0) return '드래곤볼을 받을 학생이 없어요.'
  if (mode === 'all') return `공부 중인 ${granted}명에게 드래곤볼 ${amount}개씩 랜덤으로 쏘았어요!`
  const got = starListText(stars)
  return got ? `드래곤볼 ${amount}개 — ${got}` : `드래곤볼 ${amount}개를 쏘았어요.`
}

/** 이력에 남는 표시 */
export const GRANT_MODE_LABEL: Record<'all' | 'single', string> = {
  all: '전체 일괄',
  single: '개별',
}

/* ------------------------------------------------------------------ */
/* 관리자 화면에서 본 '지금 공부 중' 상태                               */
/* ------------------------------------------------------------------ */

/**
 * 서버(reconcile_session)와 같은 규칙으로 화면에 보여 줄 상태·지난 초를 구한다.
 * · 숙제 공부는 하트비트가 30초 넘게 끊기면 마지막 신호 시각에 멈춘 것으로 본다.
 *   (관리자 화면을 열어 둔 사이 서버가 아직 정리하지 못한 세션도 있기 때문)
 */
export function adminSessionState(
  session: StudySession,
  nowMs: number,
): { status: LiveStatus; seconds: number } {
  const status: LiveStatus = session.status === 'paused' ? 'paused' : 'running'

  if (status === 'running' && normalizeKind(session.kind) === 'homework') {
    const beat = parseMs(session.last_heartbeat_at)
    if (Number.isFinite(beat) && nowMs - beat > HEARTBEAT_TIMEOUT_MS) {
      return {
        status: 'paused',
        seconds: computeElapsedSeconds({ ...session, status: 'paused', paused_at: session.last_heartbeat_at }, nowMs),
      }
    }
  }

  return { status, seconds: computeElapsedSeconds(session, nowMs) }
}
