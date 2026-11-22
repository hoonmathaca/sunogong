/**
 * 일시정지 30분 알림 · 60분 자동 종료 · 다음 접속 때 문제 수 입력 — 실서비스 E2E (개발용)
 *   node tools/e2e-pause-autoend.mjs
 * 앱과 같은 anon 키로 실제 Supabase 에 붙어서
 *   시작 → 일시정지 → (61분 전에 멈춘 것으로 시간 이동) → 자동 종료 → 문제 수 입력 → 되돌리기
 * 를 확인하고, 검증용 학생은 끝나고 지운다.
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
function check(name, ok, detail) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
}

const run = async (promise) => {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  return data
}

const code = String(Math.floor(1000 + Math.random() * 8999))
const student = await run(
  supabase.from('students').insert({ name: '검증일시정지', code, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id}`)

try {
  /* 1) 공부 시작 → 일시정지 */
  const started = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'homework' }))
  check('시작: 세션이 running', started?.status === 'running', started?.status)

  const paused = await run(supabase.rpc('pause_session', { p_session_id: started.id, p_auto: false }))
  check('일시정지: status=paused', paused?.status === 'paused', paused?.status)

  /* 2) 쉬기 시작한 지 61분 지난 것으로 시각을 옮긴다 (40분 공부 + 61분 휴식) */
  const now = new Date()
  const startedAt = new Date(now.getTime() - 101 * 60_000).toISOString()
  const pausedAt = new Date(now.getTime() - 61 * 60_000).toISOString()
  const moved = await run(
    supabase
      .from('study_sessions')
      .update({ started_at: startedAt, paused_at: pausedAt, last_heartbeat_at: pausedAt, paused_seconds: 0 })
      .eq('id', started.id)
      .select('*')
      .single(),
  )
  check('시간 이동: 61분째 쉬는 중', moved?.status === 'paused' && !!moved?.paused_at)

  /* 3) 자동 종료 (전체 60분 초과) */
  const ended = await run(supabase.rpc('auto_end_paused_session', { p_session_id: started.id }))
  check('자동 종료: status=finished', ended?.session?.status === 'finished', ended?.session?.status)
  check('자동 종료: problems_pending', ended?.session?.problems_pending === true, ended?.session?.problems_pending)
  check('자동 종료: auto_ended', ended?.session?.auto_ended === true, ended?.session?.auto_ended)
  check('자동 종료: 문제 수는 비어 있음', ended?.session?.problems === null, ended?.session?.problems)
  check('자동 종료: 공부 시간 40분', ended?.minutes === 40, ended?.minutes)

  const log = await run(
    supabase.from('study_logs').select('*').eq('student_id', student.id).eq('date', ended.date).single(),
  )
  check('기록: 40분 · 문제 수 0', log?.minutes === 40 && log?.problems === 0, { minutes: log?.minutes, problems: log?.problems })

  /* 4) 다시 자동 종료를 불러도 기록이 두 번 쌓이지 않는다 */
  const again = await run(supabase.rpc('auto_end_paused_session', { p_session_id: started.id }))
  check('자동 종료 두 번: already_finished', again?.already_finished === true, again?.already_finished)
  const logAgain = await run(
    supabase.from('study_logs').select('*').eq('student_id', student.id).eq('date', ended.date).single(),
  )
  check('자동 종료 두 번: 기록 그대로(40분)', logAgain?.minutes === 40, logAgain?.minutes)

  /* 5) 다음 접속: 문제 수를 물어볼 세션이 보인다 */
  const pending = await run(supabase.rpc('pending_problem_sessions', { p_student_id: student.id }))
  check('다음 접속: 대기 세션 1개', Array.isArray(pending) && pending.length === 1, pending?.length)
  check('다음 접속: 그 세션이 방금 것', pending?.[0]?.id === started.id)

  /* 6) 문제 수 입력 → 기록에 더해진다 */
  const filled = await run(supabase.rpc('set_session_problems', { p_session_id: started.id, p_problems: 23 }))
  check('문제 수 입력: 23', filled?.problems === 23, filled?.problems)
  check('문제 수 입력: 대기 목록에서 사라짐', filled?.problems_pending === false, filled?.problems_pending)
  const logFilled = await run(
    supabase.from('study_logs').select('*').eq('student_id', student.id).eq('date', ended.date).single(),
  )
  check(
    '기록 반영: 40분 · 23문제 · 숙제 23문제',
    logFilled?.minutes === 40 && logFilled?.problems === 23 && logFilled?.homework_problems === 23 && logFilled?.homework_minutes === 40,
    logFilled,
  )
  const pendingAfter = await run(supabase.rpc('pending_problem_sessions', { p_student_id: student.id }))
  check('문제 수 입력 뒤 대기 목록 비어 있음', Array.isArray(pendingAfter) && pendingAfter.length === 0, pendingAfter?.length)

  /* 7) 같은 세션에 또 입력하면 거절 */
  const twice = await supabase.rpc('set_session_problems', { p_session_id: started.id, p_problems: 5 })
  check('두 번 입력은 거절', !!twice.error && twice.error.message.includes('problems_not_pending'), twice.error?.message)

  /* 8) 공부 중(running) 세션은 자동 종료하지 않는다 */
  const running = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'academy' }))
  const notPaused = await run(supabase.rpc('auto_end_paused_session', { p_session_id: running.id }))
  check('공부 중이면 자동 종료 안 함', notPaused?.not_paused === true && notPaused?.session?.status === 'running', notPaused?.not_paused)

  /* 9) 1분도 공부하지 않은 세션은 기록 줄을 만들지 않는다 */
  await run(supabase.from('study_sessions').delete().eq('id', running.id))
  const zeroPaused = await run(
    supabase.from('study_sessions').select('*').eq('id', started.id).single(),
  )
  const zero = await run(
    supabase
      .from('study_sessions')
      .insert({
        student_id: student.id,
        status: 'paused',
        kind: 'academy',
        started_at: new Date(now.getTime() - 61 * 60_000).toISOString(),
        paused_at: new Date(now.getTime() - 60.5 * 60_000).toISOString(),
        last_heartbeat_at: new Date(now.getTime() - 60.5 * 60_000).toISOString(),
        paused_seconds: 0,
        date: ended.date,
      })
      .select('id')
      .single(),
  )
  const zeroEnd = await run(supabase.rpc('auto_end_paused_session', { p_session_id: zero.id }))
  check('0분 세션: 자동 종료는 되지만 문제 수는 묻지 않음', zeroEnd?.minutes === 0 && zeroEnd?.problems_pending === false, {
    minutes: zeroEnd?.minutes,
    pending: zeroEnd?.problems_pending,
  })
  const logAfterZero = await run(
    supabase.from('study_logs').select('*').eq('student_id', student.id).eq('date', ended.date).single(),
  )
  check(
    '0분 세션: 그 날 기록은 그대로(40분·23문제)',
    logAfterZero?.minutes === 40 && logAfterZero?.problems === 23,
    { minutes: logAfterZero?.minutes, problems: logAfterZero?.problems },
  )
  check('0분 세션: 대기 목록에도 없음', zeroPaused?.id === started.id)
} finally {
  const { error } = await supabase.from('students').delete().eq('id', student.id)
  const left = await run(
    supabase.from('study_sessions').select('id', { count: 'exact' }).eq('student_id', student.id),
  )
  const leftLogs = await run(supabase.from('study_logs').select('id').eq('student_id', student.id))
  console.log(`${error ? 'FAIL' : 'ok  '} 검증용 데이터 되돌리기 — 남은 세션 ${left?.length ?? '?'}건, 기록 ${leftLogs?.length ?? '?'}건`)
  if (error || (left?.length ?? 0) > 0 || (leftLogs?.length ?? 0) > 0) failed += 1
}

console.log(failed === 0 ? 'ALL E2E PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
