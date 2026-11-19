import { isSupabaseConfigured, supabase } from './supabase'
import type { FinishResult, HeartbeatResult, Student, StudyLog, StudySession } from './types'

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

/** 진행 중인 세션 (없으면 null). 서버가 끊긴 하트비트·자정 초과를 먼저 정리한다. */
export const getActiveSession = (studentId: string) =>
  rpc<StudySession | null>('active_session', { p_student_id: studentId })

/** 세션 시작 (이미 진행 중이면 그 세션을 돌려준다) */
export const startSession = (studentId: string) =>
  rpc<StudySession>('start_session', { p_student_id: studentId })

export const pauseSession = (sessionId: string, auto = false) =>
  rpc<StudySession>('pause_session', { p_session_id: sessionId, p_auto: auto })

export const resumeSession = (sessionId: string) =>
  rpc<StudySession>('resume_session', { p_session_id: sessionId })

export const sendHeartbeat = (sessionId: string) =>
  rpc<HeartbeatResult>('heartbeat', { p_session_id: sessionId })

export const finishSession = (sessionId: string, problems: number) =>
  rpc<FinishResult>('finish_session', { p_session_id: sessionId, p_problems: Math.max(0, Math.floor(problems) || 0) })

/* ------------------------------------------------------------------ */
/* 학생                                                                 */
/* ------------------------------------------------------------------ */

export const listStudents = () =>
  run<Student[]>(() => supabase.from('students').select('id,name,code,grade,created_at').order('name'))

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
        .select('id,student_id,date,minutes,problems,updated_at')
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

export const upsertLog = (input: { student_id: string; date: string; minutes: number; problems: number }) =>
  run<StudyLog>(() =>
    supabase
      .from('study_logs')
      .upsert(
        {
          student_id: input.student_id,
          date: input.date,
          minutes: Math.max(0, Math.floor(input.minutes) || 0),
          problems: Math.max(0, Math.floor(input.problems) || 0),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'student_id,date' },
      )
      .select('id,student_id,date,minutes,problems,updated_at')
      .single(),
  )

export const deleteLog = (id: string) => run<null>(() => supabase.from('study_logs').delete().eq('id', id))

export const deleteLogByKey = (studentId: string, date: string) =>
  run<null>(() => supabase.from('study_logs').delete().eq('student_id', studentId).eq('date', date))
