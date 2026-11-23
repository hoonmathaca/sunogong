/**
 * 지난 날짜 미종료 세션 자동 정리 — 실서비스 확인 (앱과 같은 anon 키로 실제 Supabase 에 붙음)
 *   node tools/e2e-stale-session-cleanup.mjs
 *
 * 확인하는 것
 *   · 앱 진입 RPC(학생 start_session / 근두운 live_study_board / active_session)가
 *     지난 날짜 미종료 세션을 먼저 정리한다 (pg_cron 이 실패해도 동작하는 안전장치)
 *   · 일시정지된 지난 학원 공부는 그 날 기록(study_logs)으로 정산된다
 *   · 일시정지 없이 자정을 넘긴 공부는 기록 없이 폐기된다
 *   · 지난 숙제 공부는 승인 대기 제출로 넘어간다
 *   · 오늘 시작한 세션은 그대로 남는다
 *   · 정리 함수는 앱(anon)에서 직접 부를 수 없다
 * 검증용 학생·세션·기록은 끝나고 지운다.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].trim()]),
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
})

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const run = async (promise) => {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  return data
}

const KST_MS = 9 * 60 * 60 * 1000
const kstDate = (ms = Date.now()) => new Date(ms + KST_MS).toISOString().slice(0, 10)
const today = kstDate()
const yesterday = kstDate(Date.now() - 24 * 60 * 60 * 1000)
/** KST 어제(today-1)의 시:분 → UTC ISO */
const yesterdayAt = (hour, minute = 0) => {
  const [y, m, d] = yesterday.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hour - 9, minute, 0)).toISOString()
}

const students = []
const makeStudent = async (name, grade = '검증') => {
  const code = String(Math.floor(1000 + Math.random() * 8999))
  const student = await run(
    supabase.from('students').insert({ name, code, grade }).select('id,name,code').single(),
  )
  students.push(student.id)
  return student
}

const insertSession = async (row) =>
  run(supabase.from('study_sessions').insert(row).select('*').single())

try {
  /* 1) 일시정지된 지난 학원 공부 → start_session 진입 시 기록으로 정산 ---------- */
  const settleStudent = await makeStudent('검증지난정리A')
  const settleSession = await insertSession({
    student_id: settleStudent.id,
    status: 'paused',
    kind: 'academy',
    started_at: yesterdayAt(20, 0),
    paused_at: yesterdayAt(20, 25),
    last_heartbeat_at: yesterdayAt(20, 25),
    date: yesterday,
    paused_seconds: 0,
  })

  const started = await run(
    supabase.rpc('start_session', { p_student_id: settleStudent.id, p_kind: 'academy' }),
  )
  check('start_session 이 지난 세션을 새 세션으로 바꾼다', Boolean(started?.id) && started.id !== settleSession.id, `new=${started?.id} date=${started?.date}`)
  check('새 세션은 오늘 날짜', started?.date === today, started?.date)

  const { data: settledRow } = await supabase
    .from('study_sessions').select('*').eq('id', settleSession.id).maybeSingle()
  check('지난 세션은 진행 중 목록에서 사라진다', settledRow?.status === 'finished', settledRow?.status ?? 'deleted')

  const { data: settleLog } = await supabase
    .from('study_logs').select('*').eq('student_id', settleStudent.id).eq('date', yesterday).maybeSingle()
  check('그 날 학원 기록으로 25분 정산', settleLog?.academy_minutes === 25, `${settleLog?.academy_minutes}분`)

  /* 2) 일시정지 없이 자정 넘긴 공부 → live_study_board 진입 시 기록 없이 폐기 ---- */
  const discardStudent = await makeStudent('검증지난정리B')
  const discardSession = await insertSession({
    student_id: discardStudent.id,
    status: 'running',
    kind: 'academy',
    started_at: yesterdayAt(21, 0),
    last_heartbeat_at: yesterdayAt(23, 50),
    date: yesterday,
    paused_seconds: 0,
  })

  await run(supabase.rpc('live_study_board', { p_student_id: discardStudent.id }))

  const { data: discardRow } = await supabase
    .from('study_sessions').select('id').eq('id', discardSession.id).maybeSingle()
  check('자정 넘긴 공부는 세션 줄이 사라진다(폐기)', discardRow === null, discardRow ? 'still there' : 'deleted')

  const { data: discardLogs } = await supabase
    .from('study_logs').select('id').eq('student_id', discardStudent.id).eq('date', yesterday)
  check('폐기된 공부는 기록을 남기지 않는다', (discardLogs ?? []).length === 0, `${(discardLogs ?? []).length}건`)

  /* 3) 지난 숙제 공부 → active_session 진입 시 승인 대기로 ---------------------- */
  const homeStudent = await makeStudent('검증지난정리C')
  const homeSession = await insertSession({
    student_id: homeStudent.id,
    status: 'paused',
    kind: 'homework',
    started_at: yesterdayAt(18, 0),
    paused_at: yesterdayAt(18, 30),
    last_heartbeat_at: yesterdayAt(18, 30),
    date: yesterday,
    paused_seconds: 0,
  })

  await run(supabase.rpc('active_session', { p_student_id: homeStudent.id }))

  const { data: homeRow } = await supabase
    .from('study_sessions').select('*').eq('id', homeSession.id).maybeSingle()
  check('지난 숙제 공부는 끝난 세션이 된다', homeRow?.status === 'finished', homeRow?.status ?? 'deleted')

  const { data: submission } = await supabase
    .from('homework_submissions').select('*').eq('session_id', homeSession.id).maybeSingle()
  check('승인 대기 제출이 만들어진다(30분·0문제)',
    submission?.status === 'pending' && submission?.submitted_minutes === 30 && submission?.submitted_problems === 0,
    submission ? `${submission.status} ${submission.submitted_minutes}분 ${submission.submitted_problems}문제` : 'none')

  /* 4) 오늘 시작한 세션은 그대로 ------------------------------------------------ */
  const todayStudent = await makeStudent('검증지난정리D')
  const todaySession = await insertSession({
    student_id: todayStudent.id,
    status: 'running',
    kind: 'academy',
    started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    last_heartbeat_at: new Date().toISOString(),
    date: today,
    paused_seconds: 0,
  })

  await run(supabase.rpc('live_study_board', { p_student_id: todayStudent.id }))

  const { data: todayRow } = await supabase
    .from('study_sessions').select('*').eq('id', todaySession.id).maybeSingle()
  check('오늘 세션은 그대로 남는다', todayRow?.status === 'running' && todayRow?.ended_at === null, todayRow?.status ?? 'deleted')

  /* 5) 정리 함수는 앱에서 직접 부를 수 없다 ------------------------------------- */
  const direct = await supabase.rpc('cleanup_stale_study_sessions')
  check('앱(anon)은 정리 함수를 직접 부를 수 없다', Boolean(direct.error), direct.error?.message ?? 'no error')

  const dry = await supabase.rpc('cleanup_stale_study_sessions', { p_dry_run: true })
  check('미리보기도 앱에서는 막힌다', Boolean(dry.error), dry.error?.message ?? 'no error')
} catch (error) {
  failed += 1
  console.log('FAIL 실행 오류 —', error instanceof Error ? error.message : error)
} finally {
  /* 검증 데이터 정리 */
  if (students.length) {
    const { error: e1 } = await supabase.from('homework_submissions').delete().in('student_id', students)
    const { error: e2 } = await supabase.from('study_logs').delete().in('student_id', students)
    const { error: e3 } = await supabase.from('study_sessions').delete().in('student_id', students)
    const { error: e4 } = await supabase.from('students').delete().in('id', students)
    const left = await supabase.from('students').select('id', { count: 'exact' }).in('id', students)
    check('검증 데이터 정리', (left.count ?? 0) === 0, [e1, e2, e3, e4].filter(Boolean).map((e) => e.message).join(', ') || `left=${left.count}`)
  }
}

console.log(failed ? `\n${failed}건 실패` : '\n모두 통과')
process.exit(failed ? 1 : 0)
