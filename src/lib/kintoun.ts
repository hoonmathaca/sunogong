/**
 * 근두운 · 드래곤볼 — DB 함수(RPC)와 표 접근.
 *
 * · 학생: 내 닉네임·드래곤볼·일반용·교환권 읽기, 닉네임 바꾸기,
 *         성구 2개 → 사탕교환권, 1~7성구 → 일반용, 일반용 → 무지개용,
 *         드래곤 → 포인트 교환권
 * · 선오공이(관리자): 공부 중인 학생 목록(실명 포함), 드래곤볼 쏘기,
 *                     실제로 지급한 교환권 사용 처리
 *
 * 실시간 현황은 서버 함수(live_study_board)가 닉네임·시작 시각·지난 초만 돌려준다.
 * 실명은 관리자 화면에서만 쓰고, 학생 화면에는 절대 싣지 않는다.
 */
import { friendlyError, NOT_CONFIGURED_MESSAGE, serverNow, type ApiResult } from './api'
import {
  adminSessionState,
  displayNickname,
  normalizeNickname,
  type DragonMap,
  type LiveBoard,
  type LiveStatus,
} from './kintounBoard'
import { normalizeKind, type SessionKind } from './kinds'
import { isSupabaseConfigured, supabase } from './supabase'
import { todayKst } from './time'
import type { StudySession } from './types'

/** 근두운·드래곤볼 표·함수가 아직 없을 때(마이그레이션 전) 보여 줄 말 */
export const KINTOUN_NOT_READY = '근두운 기능을 아직 준비 중이에요. 조금 뒤에 다시 시도해 주세요.'

const fail = (error: string): ApiResult<never> => ({ ok: false, error })

function rawMessage(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  const maybe = error as { message?: unknown }
  return typeof maybe.message === 'string' ? maybe.message : String(error)
}

/** 표·함수가 없거나 값이 잘못된 경우를 읽을 수 있는 말로 바꾼다 */
export function describeKintounError(error: unknown): string {
  const raw = rawMessage(error)
  const lower = raw.toLowerCase()
  if (!raw) return '근두운을 불러오지 못했어요.'
  /* 우리가 아는 오류를 먼저 (함수 이름에 dragonball 이 들어 있어서 순서가 중요하다) */
  if (raw.includes('nickname_too_long')) return '닉네임은 10자까지 쓸 수 있어요.'
  if (raw.includes('nickname_invalid')) return '닉네임에 줄바꿈은 쓸 수 없어요.'
  if (raw.includes('invalid_amount')) return '한 번에 1~50장까지만 바꿀 수 있어요.'
  if (raw.includes('no_students')) return '드래곤볼을 받을 학생이 없어요.'
  if (raw.includes('dragonballs_incomplete')) return '1~7성구를 하나씩 다 모아야 일반용을 뽑을 수 있어요.'
  if (raw.includes('invalid_stars')) return '성구는 2개를 골라야 해요. 다시 골라 주세요.'
  if (raw.includes('dragonballs_shortage')) return '고른 성구가 모자라요. 가진 성구에서 다시 골라 주세요.'
  if (raw.includes('dragons_incomplete')) return '일반용을 하나씩 다 모아야 무지개용을 만들 수 있어요.'
  if (raw.includes('dragons_shortage')) return '바꿀 드래곤이 없어요.'
  if (raw.includes('rainbow_dragon_shortage')) return '바꿀 무지개용이 없어요.'
  if (raw.includes('black_dragon_shortage')) return '바꿀 검은용이 없어요.'
  if (raw.includes('ticket_shortage')) return '학생이 가진 교환권이 모자라요. 새로고침해서 확인해 주세요.'
  if (raw.includes('invalid_ticket')) return '교환권 종류를 확인해 주세요.'
  if (
    lower.includes('live_study_board') ||
    lower.includes('student_profile') ||
    lower.includes('set_student_nickname') ||
    lower.includes('grant_dragonballs') ||
    lower.includes('craft_rainbow_ball') ||
    lower.includes('craft_color_dragon') ||
    lower.includes('craft_rainbow_dragon') ||
    lower.includes('exchange_candy_ticket') ||
    lower.includes('exchange_point_ticket') ||
    lower.includes('use_ticket') ||
    lower.includes('could not find the function') ||
    (lower.includes('relation') && lower.includes('does not exist'))
  ) {
    return KINTOUN_NOT_READY
  }
  return friendlyError(raw)
}

async function run<T>(
  thunk: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<ApiResult<T>> {
  if (!isSupabaseConfigured) return fail(NOT_CONFIGURED_MESSAGE)
  try {
    const { data, error } = await thunk()
    if (error) {
      console.warn('[sunogong] kintoun query failed:', error.message)
      return fail(describeKintounError(error.message))
    }
    return { ok: true, data: (data as T) ?? (null as unknown as T) }
  } catch (error) {
    console.warn('[sunogong] kintoun request failed:', error)
    return fail(describeKintounError(error))
  }
}

const rpc = <T>(fn: string, args: Record<string, unknown> = {}) =>
  run<T>(() => supabase.rpc(fn, args) as unknown as PromiseLike<{ data: unknown; error: { message: string } | null }>)

/* ------------------------------------------------------------------ */
/* 학생                                                               */
/* ------------------------------------------------------------------ */

export interface StudentProfile {
  nickname: string | null
  dragonball_count: number
  /** 성구별 보유 개수 맵 — {"1":0,...,"7":0} */
  dragonballs?: Record<string, number> | null
  /** 일반용 보유 맵 */
  dragons?: DragonMap | null
  /** 무지개용 마리 수 */
  rainbow_dragon_count?: number
  candy_tickets?: number
  point_1000_tickets?: number
  point_10000_tickets?: number
  /** 히든 검은용 (가진 학생만 화면에 보인다) */
  black_dragon_count?: number
  /** 검은용으로 바꾼 시크릿쿠폰 */
  secret_tickets?: number
  /** 예전 화면 호환 — 쓰지 않는다 */
  rainbow_ball_count?: number
}

/** 내 닉네임·드래곤볼·드래곤·교환권 */
export const getStudentProfile = (studentId: string) =>
  rpc<StudentProfile>('student_profile', { p_student_id: studentId })

/** 닉네임 바꾸기 (빈 값이면 '수련생'으로 되돌린다) */
export const setStudentNickname = (studentId: string, nickname: string | null) =>
  rpc<StudentProfile>('set_student_nickname', {
    p_student_id: studentId,
    p_nickname: normalizeNickname(nickname),
  })

/**
 * 지금 공부 중인 친구들 — 닉네임 + 진행 시간 (실명 없음).
 * 내 세션에는 is_me 가 붙어서 온다.
 */
export const liveStudyBoard = (studentId?: string | null) =>
  rpc<LiveBoard>('live_study_board', studentId ? { p_student_id: studentId } : {})

/** 성구 2개 → 사탕교환권 1장 (학생이 고른 성구 2개를 그대로 차감) */
export interface CandyExchangeResult {
  exchanged: boolean
  /** 이번에 빠진 성구 (예: [5, 5]) */
  used: number[]
  candy_tickets: number
  dragonballs: Record<string, number>
  total: number
  collected: number
}

/**
 * 성구 2개 → 사탕교환권 1장.
 * stars 를 주면 그 성구 2개(같은 성구 2개 가능)를 그대로 차감하고,
 * 주지 않으면 서버가 가장 많이 가진 성구부터 2개를 차감한다.
 */
export const exchangeCandyTicket = (studentId: string, stars?: number[] | null) =>
  rpc<CandyExchangeResult>('exchange_candy_ticket', {
    p_student_id: studentId,
    p_stars: stars && stars.length > 0 ? stars : null,
  })

/** 1~7성구 하나씩 → 일반용 랜덤 1마리 */
export interface ColorDragonCraftResult {
  crafted: boolean
  /** 이번에 태어난 드래곤 색 (red·orange·yellow·green·blue·navy·purple) */
  color: string
  dragons: DragonMap
  dragon_total: number
  rainbow_dragon_count: number
  rainbow_dragon_ready: boolean
  /** 이번에 검은용이 함께 나왔는지 (화면에만 쓰고 확률은 알리지 않는다) */
  bonus_black?: boolean
  black_dragon_count?: number
  dragonballs: Record<string, number>
  total: number
  collected: number
}

export const craftColorDragon = (studentId: string) =>
  rpc<ColorDragonCraftResult>('craft_color_dragon', { p_student_id: studentId })

/** 일반용 하나씩 → 무지개용 1마리 */
export interface RainbowDragonCraftResult {
  crafted: boolean
  rainbow_dragon_count: number
  dragons: DragonMap
  dragon_total: number
  rainbow_dragon_ready: boolean
  bonus_black?: boolean
  black_dragon_count?: number
}

export const craftRainbowDragon = (studentId: string) =>
  rpc<RainbowDragonCraftResult>('craft_rainbow_dragon', { p_student_id: studentId })

/** 일반용·무지개용 → 포인트 교환권 (dragon = 1,000P · rainbow = 10,000P) */
export interface PointExchangeResult {
  exchanged: boolean
  kind: 'dragon' | 'rainbow'
  /** 일반용을 바꿨을 때 그 색 */
  color?: string
  dragons: DragonMap
  dragon_total: number
  rainbow_dragon_count: number
  candy_tickets: number
  point_1000_tickets: number
  point_10000_tickets: number
  secret_tickets: number
}

export const exchangePointTicket = (studentId: string, kind: 'dragon' | 'rainbow') =>
  rpc<PointExchangeResult>('exchange_point_ticket', { p_student_id: studentId, p_kind: kind })

/** 검은용 1마리 → 시크릿쿠폰 1장 */
export interface SecretTicketResult {
  exchanged: boolean
  black_dragon_count: number
  secret_tickets: number
}

export const exchangeSecretTicket = (studentId: string) =>
  rpc<SecretTicketResult>('exchange_secret_ticket', { p_student_id: studentId })

/* ------------------------------------------------------------------ */
/* 관리자                                                              */
/* ------------------------------------------------------------------ */

/** 관리자 화면의 '공부 중인 학생' 한 줄 (실명 포함) */
export interface AdminLiveSession {
  sessionId: string
  studentId: string
  name: string
  grade: string
  nickname: string | null
  /** 화면에 보여 줄 이름 (닉네임 없으면 '수련생') */
  displayName: string
  /** 성구별 보유 개수 맵 */
  dragonballs: Record<string, number>
  /** 일반용 보유 맵 */
  dragons: DragonMap
  /** 무지개용 마리 수 */
  rainbowDragonCount: number
  status: LiveStatus
  kind: SessionKind
  startedAt: string
  seconds: number
  dragonballCount: number
}

type JoinedStudent = {
  id: string
  name: string | null
  grade: string | null
  nickname: string | null
  dragonball_count: number | null
  dragonballs: Record<string, number> | null
  dragons: DragonMap | null
  rainbow_dragon_count: number | null
}

interface SessionWithStudent extends StudySession {
  students?: JoinedStudent | JoinedStudent[] | null
}

function firstStudent(row: SessionWithStudent) {
  const joined = row.students
  return Array.isArray(joined) ? joined[0] ?? null : joined ?? null
}

/** 공부 중인 세션 (관리자) — 실명·닉네임·드래곤볼·드래곤을 함께 읽는다 */
export async function listLiveSessions(): Promise<ApiResult<{ rows: AdminLiveSession[]; nowMs: number }>> {
  const now = await serverNow()
  const serverMs = now.ok ? Date.parse(now.data) : NaN
  const nowMs = Number.isFinite(serverMs) ? serverMs : Date.now()

  const res = await run<SessionWithStudent[]>(() =>
    supabase
      .from('study_sessions')
      .select(
        'id,student_id,status,kind,started_at,paused_at,ended_at,last_heartbeat_at,paused_seconds,date,minutes,problems,created_at,students(id,name,grade,nickname,dragonball_count,dragonballs,dragons,rainbow_dragon_count)',
      )
      .neq('status', 'finished')
      .eq('date', todayKst())
      .order('started_at', { ascending: true }),
  )
  if (!res.ok) return res

  const rows: AdminLiveSession[] = []
  for (const row of res.data ?? []) {
    const student = firstStudent(row)
    if (!student?.id) continue
    const state = adminSessionState(row, nowMs)
    if (state.seconds >= 18000) continue
    rows.push({
      sessionId: row.id,
      studentId: student.id,
      name: student.name ?? '학생',
      grade: student.grade ?? '미지정',
      nickname: student.nickname ?? null,
      displayName: displayNickname(student.nickname),
      status: state.status,
      kind: normalizeKind(row.kind),
      startedAt: row.started_at,
      seconds: state.seconds,
      dragonballCount: Math.max(0, Number(student.dragonball_count ?? 0)),
      dragonballs: student.dragonballs ?? {},
      dragons: student.dragons ?? { red: 0, orange: 0, yellow: 0, green: 0, blue: 0, navy: 0, purple: 0 },
      rainbowDragonCount: Math.max(0, Number(student.rainbow_dragon_count ?? 0)),
    })
  }
  return { ok: true, data: { rows, nowMs } }
}

export interface GrantAward {
  student_id: string
  /** 그 학생이 이번에 받은 성구들 (예: [4, 7]) */
  stars: number[]
  /** 지급 후 총 개수 */
  total: number
  /** 지급 후 성구별 보유 개수 맵 */
  dragonballs: Record<string, number>
}

export interface GrantResult {
  granted: number
  amount: number
  mode: 'all' | 'single'
  last_total: number
  /** 마지막 학생이 받은 성구 (개별 지급 안내에 쓴다) */
  stars?: number[] | null
  /** 학생별 획득 성구 */
  awards?: GrantAward[] | null
}

/** 선오공이 드래곤볼 쏘기 — 여러 학생에게 같은 개수를 한 번에 준다 */
export const grantDragonballs = (
  studentIds: string[],
  amount: number,
  mode: 'all' | 'single',
  note?: string | null,
) =>
  rpc<GrantResult>('grant_dragonballs', {
    p_student_ids: studentIds,
    p_amount: Math.max(1, Math.floor(amount)),
    p_mode: mode,
    p_note: note ?? null,
  })

/** 드래곤볼 지급 이력 (최근 것부터) */
export interface DragonballGrant {
  id: string
  student_id: string
  amount: number
  mode: 'all' | 'single'
  note: string | null
  created_at: string
  /** 그때 지급한 성구들 (예: [4, 7]) */
  stars?: number[] | null
  students?:
    | { name: string | null; nickname: string | null }
    | { name: string | null; nickname: string | null }[]
    | null
}

export const listDragonballGrants = (limit = 20) =>
  run<DragonballGrant[]>(() =>
    supabase
      .from('dragonball_grants')
      .select('id,student_id,amount,mode,note,stars,created_at,students(name,nickname)')
      .order('created_at', { ascending: false })
      .limit(limit),
  )

/** 지금 지급 이력 한 줄의 학생 이름 (닉네임 우선) */
export function grantStudentName(grant: DragonballGrant): string {
  const joined = Array.isArray(grant.students) ? grant.students[0] : grant.students
  if (!joined) return '학생'
  return joined.name?.trim() || displayNickname(joined.nickname)
}

/* ------------------------------------------------------------------ */
/* 교환권 사용 처리 (관리자)                                            */
/* ------------------------------------------------------------------ */

export interface UseTicketResult {
  used: boolean
  student_id: string
  ticket: string
  amount: number
  candy_tickets: number
  point_1000_tickets: number
  point_10000_tickets: number
  secret_tickets: number
}

/** 실제로 지급한 교환권을 사용 처리(차감)한다 */
export const useTicket = (studentId: string, ticket: 'candy' | 'point1000' | 'point10000' | 'secret', amount = 1) =>
  rpc<UseTicketResult>('use_ticket', { p_student_id: studentId, p_ticket: ticket, p_amount: amount })

/** 교환권 사용 처리 이력 한 줄 */
export interface TicketUse {
  id: string
  student_id: string
  ticket: 'candy' | 'point1000' | 'point10000' | 'secret'
  amount: number
  note: string | null
  created_at: string
  students?:
    | { name: string | null; nickname: string | null }
    | { name: string | null; nickname: string | null }[]
    | null
}

export const listTicketUses = (limit = 12) =>
  run<TicketUse[]>(() =>
    supabase
      .from('ticket_uses')
      .select('id,student_id,ticket,amount,note,created_at,students(name,nickname)')
      .order('created_at', { ascending: false })
      .limit(limit),
  )

/** 사용 처리 이력 한 줄의 학생 이름 (닉네임 우선) */
export function ticketUseStudentName(item: TicketUse): string {
  const joined = Array.isArray(item.students) ? item.students[0] : item.students
  if (!joined) return '학생'
  return joined.name?.trim() || displayNickname(joined.nickname)
}
