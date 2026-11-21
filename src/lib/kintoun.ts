/**
 * 근두운 · 드래곤볼 — DB 함수(RPC)와 표 접근.
 *
 * · 학생: 내 닉네임·드래곤볼 개수 읽기, 닉네임 바꾸기, 지금 공부 중인 친구들 보기
 * · 선오공이(관리자): 공부 중인 학생 목록(실명 포함)과 드래곤볼 쏘기
 *
 * 실시간 현황은 서버 함수(live_study_board)가 닉네임·시작 시각·지난 초만 돌려준다.
 * 실명은 관리자 화면에서만 쓰고, 학생 화면에는 절대 싣지 않는다.
 */
import { friendlyError, NOT_CONFIGURED_MESSAGE, serverNow, type ApiResult } from './api'
import { adminSessionState, displayNickname, normalizeNickname, type LiveBoard, type LiveStatus } from './kintounBoard'
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
  if (
    lower.includes('live_study_board') ||
    lower.includes('student_profile') ||
    lower.includes('set_student_nickname') ||
    lower.includes('grant_dragonballs') ||
    lower.includes('craft_rainbow_ball') ||
    lower.includes('dragonball') ||
    lower.includes('could not find the function') ||
    (lower.includes('relation') && lower.includes('does not exist'))
  ) {
    return KINTOUN_NOT_READY
  }
  if (raw.includes('nickname_too_long')) return '닉네임은 10자까지 쓸 수 있어요.'
  if (raw.includes('nickname_invalid')) return '닉네임에 줄바꿈은 쓸 수 없어요.'
  if (raw.includes('invalid_amount')) return '드래곤볼은 한 번에 1~99개까지 쏠 수 있어요.'
  if (raw.includes('no_students')) return '드래곤볼을 받을 학생이 없어요.'
  if (raw.includes('dragonballs_incomplete')) return '1~7성구를 하나씩 다 모아야 무지개 볼을 만들 수 있어요.'
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
  /** 만든 무지개 볼 개수 */
  rainbow_ball_count?: number
}

/** 내 닉네임·드래곤볼 개수 */
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

/** 칠성구 합치기 결과 — 무지개 볼 하나가 생긴다 */
export interface CraftRainbowResult {
  crafted: boolean
  /** 합친 뒤 무지개 볼 개수 */
  rainbow_ball_count: number
  /** 합친 뒤 남은 성구 맵 */
  dragonballs: Record<string, number>
  /** 합친 뒤 남은 성구 총 개수 */
  total: number
  /** 합친 뒤 모은 성구 종류 수 */
  collected: number
}

/** 1~7성구를 하나씩 합쳐 무지개 볼 만들기 (서버가 한 번에 처리) */
export const craftRainbowBall = (studentId: string) =>
  rpc<CraftRainbowResult>('craft_rainbow_ball', { p_student_id: studentId })

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
  /** 만든 무지개 볼 개수 */
  rainbowBallCount: number
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
  rainbow_ball_count: number | null
}

interface SessionWithStudent extends StudySession {
  students?: JoinedStudent | JoinedStudent[] | null
}

function firstStudent(row: SessionWithStudent) {
  const joined = row.students
  return Array.isArray(joined) ? joined[0] ?? null : joined ?? null
}

/** 공부 중인 세션 (관리자) — 실명·닉네임·드래곤볼 개수를 함께 읽는다 */
export async function listLiveSessions(): Promise<ApiResult<{ rows: AdminLiveSession[]; nowMs: number }>> {
  const now = await serverNow()
  const serverMs = now.ok ? Date.parse(now.data) : NaN
  const nowMs = Number.isFinite(serverMs) ? serverMs : Date.now()

  const res = await run<SessionWithStudent[]>(() =>
    supabase
      .from('study_sessions')
      .select(
        'id,student_id,status,kind,started_at,paused_at,ended_at,last_heartbeat_at,paused_seconds,date,minutes,problems,created_at,students(id,name,grade,nickname,dragonball_count,dragonballs,rainbow_ball_count)',
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
      rainbowBallCount: Math.max(0, Number(student.rainbow_ball_count ?? 0)),
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
