import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase'
import type { SessionKind } from './kinds'
import { editTotals, normalizeEditValues } from './logEdit'
import { todayKst } from './time'
import type { FinishResult, Student, StudyLog, StudySession, AutoEndResult, PendingProblemsResult } from './types'

export const NOT_CONFIGURED_MESSAGE =
  'Supabase 연결 정보가 없어요. .env 의 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 를 채우고 다시 빌드해주세요.'

export type ApiOk<T> = { ok: true; data: T }
export type ApiFail = { ok: false; error: string }
export type ApiResult<T> = ApiOk<T> | ApiFail

function rawMessage(error: unknown): string {
  if (!error) return '알 수 없는 오류가 발생했어요.'
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  const maybe = error as { message?: unknown }
  if (typeof maybe.message === 'string') return maybe.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

/** 자주 만나는 오류를 학생·원장님이 읽을 수 있는 말로 바꾼다. */
export function friendlyError(error: unknown): string {
  const raw = rawMessage(error)
  const lower = raw.toLowerCase()
  if (!raw) return '알 수 없는 오류가 발생했어요.'
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed')) {
    return '인터넷 연결을 확인해주세요.'
  }
  if (lower.includes('could not find the table') || lower.includes('does not exist')) {
    return '데이터베이스 테이블이 없어요. supabase/schema.sql을 먼저 실행해주세요.'
  }
  if (lower.includes('could not find the function') || lower.includes('function') && lower.includes('not found')) {
    return '데이터베이스 함수가 없어요. supabase/schema.sql을 먼저 실행해주세요.'
  }
  if (lower.includes('permission denied') || lower.includes('row-level security') || lower.includes('jwt')) {
    return '데이터베이스 권한이 없어요. schema.sql의 RLS 정책과 키를 확인해주세요.'
  }
  if (raw.includes('student_not_found')) return '학생 정보를 찾을 수 없어요.'
  if (raw.includes('session_not_found')) return '진행 중인 공부 기록을 찾을 수 없어요.'
  if (raw.includes('session_not_finished')) return '아직 끝나지 않은 공부예요.'
  if (raw.includes('problems_not_pending')) return '이미 문제 수를 입력한 공부예요.'
  if (raw.includes('invalid_code')) return '4자리 숫자 코드를 입력해주세요.'
  return raw
}

async function run<T>(
  thunk: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<ApiResult<T>> {
  if (!isSupabaseConfigured) return { ok: false, error: NOT_CONFIGURED_MESSAGE }
  try {
    const { data, error } = await thunk()
    if (error) {
      console.warn('[sunogong] supabase error:', error.message)
      return { ok: false, error: friendlyError(error.message) }
    }
    return { ok: true, data: (data as T) ?? (null as unknown as T) }
  } catch (error) {
    console.warn('[sunogong] request failed:', error)
    return { ok: false, error: friendlyError(error) }
  }
}

/* ------------------------------------------------------------------ */
/* 서버 시각 & 타이머                                                    */
/* ------------------------------------------------------------------ */

const rpc = <T>(fn: string, args: Record<string, unknown> = {}) =>
  run<T>(() => supabase.rpc(fn, args) as unknown as PromiseLike<{ data: unknown; error: { message: string } | null }>)

/** Supabase 서버 시각 (ISO 문자열) */
export const serverNow = () => rpc<string>('server_now')

/** 코드로 학생 찾기 (같은 코드 학생이 여러 명일 수 있음) */
export const findStudentsByCode = (code: string) =>
  rpc<Student[]>('find_students_by_code', { p_code: code })

export interface ActiveSessionResult {
  session: StudySession | null
  /** 자정을 넘긴 세션을 기록 없이 버렸는지 */
  discarded: boolean
}

/** 진행 중인 세션 한 줄을 표에서 직접 읽는다 (서버 RPC의 자동 마감을 거치지 않게) */
const fetchActiveRow = (studentId: string): Promise<ApiResult<StudySession | null>> =>
  run<StudySession | null>(() =>
    supabase
      .from('study_sessions')
      .select('*')
      .eq('student_id', studentId)
      .neq('status', 'finished')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )

/** 세션 폐기 — study_logs에 아무것도 남기지 않고 세션만 지운다 */
export const discardSession = (sessionId: string) =>
  run<null>(() => supabase.from('study_sessions').delete().eq('id', sessionId))

/**
 * 진행 중인 세션 (없으면 null).
 * 그 날(date)이 지난 세션은 "자정 전에 종료를 누르지 않은 공부"라서 기록하지 않고 버린다.
 */
export const getActiveSession = async (studentId: string): Promise<ApiResult<ActiveSessionResult>> => {
  const res = await fetchActiveRow(studentId)
  if (!res.ok) return res
  const row = res.data
  if (!row || !row.id || !row.status || row.status === 'finished') {
    return { ok: true, data: { session: null, discarded: false } }
  }
  if (row.date !== todayKst()) {
    const removed = await discardSession(row.id)
    return { ok: true, data: { session: null, discarded: removed.ok } }
  }
  return { ok: true, data: { session: row, discarded: false } }
}

/** 하트비트 — 마지막 신호 시각만 갱신한다 (서버의 30초 규칙을 건드리지 않게 표를 직접 고친다) */
export const touchHeartbeat = (sessionId: string, atIso: string) =>
  run<null>(() => supabase.from('study_sessions').update({ last_heartbeat_at: atIso }).eq('id', sessionId))

/** 페이지를 떠나는 순간에도 살아남는 "마지막 신호" 기록 (keepalive).
 *  여기서 일시정지시키지 않는 이유: 아이폰은 화면을 잠그면 pagehide 가 와서,
 *  화면 꺼짐으로 타이머가 멈추는 것을 막기 위해서다. */
export function heartbeatBeacon(sessionId: string, atIso: string): void {
  if (!isSupabaseConfigured) return
  try {
    void fetch(`${SUPABASE_URL}/rest/v1/study_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      keepalive: true,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ last_heartbeat_at: atIso }),
    }).catch(() => undefined)
  } catch {
    /* 페이지를 떠나는 중이라 실패해도 된다 */
  }
}

/** 숙제 공부를 화면에서 벗어나는 순간 바로 일시정지시키는 요청 (keepalive).
 *  화면이 꺼지거나 앱이 백그라운드로 가면 페이지가 곧 잠들기 때문에,
 *  일반 fetch 로는 요청이 취소될 수 있어 keepalive 로 보낸다. */
export function pauseSessionBeacon(sessionId: string): void {
  if (!isSupabaseConfigured) return
  try {
    void fetch(`${SUPABASE_URL}/rest/v1/rpc/pause_session`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_session_id: sessionId, p_auto: true }),
    }).catch(() => undefined)
  } catch {
    /* 페이지를 떠나는 중이라 실패해도 된다 */
  }
}

/** 세션 시작 (이미 진행 중이면 그 세션을 돌려준다). 지난 날 세션은 먼저 버린다. */
export const startSession = async (
  studentId: string,
  kind: SessionKind = 'academy',
): Promise<ApiResult<StudySession>> => {
  await getActiveSession(studentId)
  const res = await rpc<StudySession>('start_session', { p_student_id: studentId, p_kind: kind })
  if (res.ok) return res
  // DB에 공부 종류(kind)가 아직 없으면 예전 방식으로 시작한다 (앱이 멈추지 않게)
  return rpc<StudySession>('start_session', { p_student_id: studentId })
}

export const pauseSession = (sessionId: string, auto = false) =>
  rpc<StudySession>('pause_session', { p_session_id: sessionId, p_auto: auto })

export const resumeSession = (sessionId: string) =>
  rpc<StudySession>('resume_session', { p_session_id: sessionId })

export const finishSession = (sessionId: string, problems: number) =>
  rpc<FinishResult>('finish_session', { p_session_id: sessionId, p_problems: Math.max(0, Math.floor(problems) || 0) })

/**
 * 쉬는 시간이 60분을 넘은 세션을 자동 종료한다.
 * 공부 시간은 쉬기 전까지로 저장되고, 문제 수는 problems_pending 으로 표시된다.
 * (DB 마이그레이션 전에는 함수가 없어 오류가 나고, 앱은 세션을 그대로 둔다)
 */
export const autoEndPausedSession = (sessionId: string) =>
  rpc<AutoEndResult>('auto_end_paused_session', { p_session_id: sessionId })

/** 자동 종료된 세션에 문제 수를 입력 → 그 날 기록에 더한다 (한 세션에 한 번만) */
export const setSessionProblems = (sessionId: string, problems: number) =>
  rpc<PendingProblemsResult>('set_session_problems', {
    p_session_id: sessionId,
    p_problems: Math.max(0, Math.min(9999, Math.floor(problems) || 0)),
  })

/** 문제 수 입력을 기다리는(자동 종료된) 세션 목록 — 오래된 것부터 */
export const listPendingProblemSessions = (studentId: string) =>
  rpc<StudySession[]>('pending_problem_sessions', { p_student_id: studentId })

/* ------------------------------------------------------------------ */
/* 학생                                                                 */
/* ------------------------------------------------------------------ */

export const listStudents = () =>
  run<Student[]>(() =>
    supabase.from('students').select('id,name,code,grade,created_at,nickname,dragonball_count,dragonballs,rainbow_ball_count').order('name'),
  )

export const createStudent = (input: { name: string; code: string; grade: string }) =>
  run<Student>(() =>
    supabase
      .from('students')
      .insert({ name: input.name, code: input.code, grade: input.grade })
      .select('id,name,code,grade,created_at')
      .single(),
  )

export const updateStudent = (
  id: string,
  patch: Partial<Pick<Student, 'name' | 'code' | 'grade'>>,
) =>
  run<Student>(() =>
    supabase
      .from('students')
      .update(patch)
      .eq('id', id)
      .select('id,name,code,grade,created_at')
      .single(),
  )

export const deleteStudent = (id: string) => run<null>(() => supabase.from('students').delete().eq('id', id))

/* ------------------------------------------------------------------ */
/* 공부 기록 (study_logs)                                               */
/* ------------------------------------------------------------------ */

const PAGE = 1000

/** 기간 내 모든 기록 (1000건 단위로 나눠 받는다) */
export async function listLogs(start: string, end: string): Promise<ApiResult<StudyLog[]>> {
  return listLogsFiltered(start, end, null)
}

export async function listStudentLogs(
  studentId: string,
  start: string,
  end: string,
): Promise<ApiResult<StudyLog[]>> {
  return listLogsFiltered(start, end, studentId)
}

async function listLogsFiltered(
  start: string,
  end: string,
  studentId: string | null,
): Promise<ApiResult<StudyLog[]>> {
  if (!isSupabaseConfigured) return { ok: false, error: NOT_CONFIGURED_MESSAGE }
  const all: StudyLog[] = []
  try {
    for (let page = 0; page < 60; page += 1) {
      let query = supabase
        .from('study_logs')
        .select('*')
        .gte('date', start)
        .lte('date', end)
      if (studentId) query = query.eq('student_id', studentId)
      const { data, error } = await query
        .order('date', { ascending: true })
        .order('student_id', { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1)
      if (error) {
        console.warn('[sunogong] log query failed:', error.message)
        return { ok: false, error: friendlyError(error.message) }
      }
      const rows = (data ?? []) as StudyLog[]
      all.push(...rows)
      if (rows.length < PAGE) break
    }
    return { ok: true, data: all }
  } catch (error) {
    console.warn('[sunogong] log query failed:', error)
    return { ok: false, error: friendlyError(error) }
  }
}

export interface LogUpsertInput {
  student_id: string
  date: string
  /** 학원 공부(🏫) — 전체 시간은 학원+숙제로 자동 계산한다 */
  academy_minutes?: number
  academy_problems?: number
  /** 숙제 공부(🏠) */
  homework_minutes?: number
  homework_problems?: number
}

/**
 * 하루 기록 저장(없으면 새로 만든다).
 * 학원·숙제를 따로 받아 합계(minutes·problems)를 여기서 계산하므로,
 * 합계와 학원+숙제 합이 어긋나지 않는다.
 */
export const upsertLog = (input: LogUpsertInput) => {
  const split = normalizeEditValues({
    academyMinutes: input.academy_minutes,
    academyProblems: input.academy_problems,
    homeworkMinutes: input.homework_minutes,
    homeworkProblems: input.homework_problems,
  })
  const totals = editTotals(split)
  return run<StudyLog>(() =>
    supabase
      .from('study_logs')
      .upsert(
        {
          student_id: input.student_id,
          date: input.date,
          minutes: totals.minutes,
          problems: totals.problems,
          academy_minutes: split.academyMinutes,
          academy_problems: split.academyProblems,
          homework_minutes: split.homeworkMinutes,
          homework_problems: split.homeworkProblems,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'student_id,date' },
      )
      .select('*')
      .single(),
  )
}

export const deleteLog = (id: string) => run<null>(() => supabase.from('study_logs').delete().eq('id', id))

export const deleteLogByKey = (studentId: string, date: string) =>
  run<null>(() => supabase.from('study_logs').delete().eq('student_id', studentId).eq('date', date))
