/**
 * 문제 수 0~999 상한 · 학생이 오늘 학원 공부 문제 수 수정 — 실서비스 E2E (개발용)
 *   node tools/e2e-problems-limit-edit.mjs
 *
 * 앱과 같은 anon 키로 실제 Supabase 에 붙어서
 *   · finish_session — 1000 은 거부(problems_out_of_range), 세션은 그대로 / 999·기본값은 통과
 *   · submit_homework — 숙제 문제 수 1000 거부, 3 은 승인 대기로
 *   · student_update_today_academy_problems — 오늘 학원 문제 수만 0~999 로 수정,
 *     합계 = 학원 + 숙제 재계산, 숙제 문제 수·시간은 그대로, 어제 기록·다른 학생 기록은 그대로
 *   · 1000·-1·null 거부, 오늘 학원 공부가 없는 날(no_academy_today)·오늘 기록이 없는 날(log_not_found) 거부
 *   · 관리자 「수업 종료」는 세션 단위 문제 수 999 까지
 *   · set_session_problems — 1000 거부, 7 통과
 *   · 운영 중인 실제 학생·세션은 건드리지 않았는지
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

/** 오류가 나야 하는 호출 — 메시지에 기대한 코드가 들어 있는지 본다 */
const expectError = async (promise, needle) => {
  const { data, error } = await promise
  if (!error) return { ok: false, got: data }
  return { ok: error.message.includes(needle), message: error.message }
}

const minutesAgo = (mins) => new Date(Date.now() - mins * 60_000).toISOString()
const todayKst = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const yesterdayKst = () => {
  const d = new Date(`${todayKst()}T00:00:00+09:00`)
  d.setDate(d.getDate() - 1)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

const code = String(Math.floor(1000 + Math.random() * 8999))
const student = await run(
  supabase.from('students').insert({ name: '검증문제상한', code, grade: '검증' }).select('id,name,code').single(),
)
const code2 = String(Math.floor(1000 + Math.random() * 8999))
const other = await run(
  supabase.from('students').insert({ name: '검증문제상한2', code: code2, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id} · ${other.name} (${code2}) ${other.id}`)

/* 운영 중인 실제 데이터 — 시작 전 상태를 적어 두고 끝에 그대로인지 본다 */
const beforeLogs = await run(
  supabase.from('study_logs').select('id,student_id,date,minutes,problems,academy_problems,homework_problems'),
)
const realLogs = (beforeLogs ?? [])
  .filter((row) => row.student_id !== student.id && row.student_id !== other.id)
  .map((row) => `${row.id}:${row.student_id}:${row.date}:${row.minutes}:${row.problems}:${row.academy_problems}:${row.homework_problems}`)
  .sort()
const beforeLive = await run(supabase.from('study_sessions').select('id,student_id,status').neq('status', 'finished'))
const realLiveIds = (beforeLive ?? []).filter((row) => row.student_id !== student.id && row.student_id !== other.id).map((row) => row.id).sort()
console.log(`실제 기록 ${realLogs.length}건 · 실제 진행 중 세션 ${realLiveIds.length}건 (건드리지 않아야 함)`)

const logOf = async (id) =>
  run(supabase.from('study_logs').select('*').eq('student_id', id).eq('date', todayKst()).maybeSingle())

const cleanup = async () => {
  await supabase.from('homework_submissions').delete().in('student_id', [student.id, other.id])
  await supabase.from('study_sessions').delete().in('student_id', [student.id, other.id])
  await supabase.from('study_logs').delete().in('student_id', [student.id, other.id])
  await supabase.from('students').delete().in('id', [student.id, other.id])
}

try {
  /* ── 1) finish_session — 1000 은 거부, 세션은 그대로 ─────────────── */
  const s1 = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'academy' }))
  await run(
    supabase.from('study_sessions').update({ started_at: minutesAgo(25), last_heartbeat_at: new Date().toISOString() }).eq('id', s1.id),
  )
  const tooMany = await expectError(supabase.rpc('finish_session', { p_session_id: s1.id, p_problems: 1000 }), 'problems_out_of_range')
  check('finish_session 1000 은 거부', tooMany.ok, tooMany.message)
  const still = await run(supabase.from('study_sessions').select('status').eq('id', s1.id).maybeSingle())
  check('거부된 세션은 공부 중 그대로', still?.status === 'running', still)

  const finished = await run(supabase.rpc('finish_session', { p_session_id: s1.id, p_problems: 5 }))
  let log = await logOf(student.id)
  check('finish_session 5 반영', log?.academy_problems === 5 && log?.problems === 5, log)
  check('finish_session 결과 — 학원 5', finished?.problems === 5, finished?.problems)

  /* ── 2) 숙제 제출 1000 거부 · 3 은 승인 대기 ─────────────────────── */
  const hw = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'homework' }))
  await run(
    supabase.from('study_sessions').update({ started_at: minutesAgo(40), last_heartbeat_at: new Date().toISOString() }).eq('id', hw.id),
  )
  const hwTooMany = await expectError(
    supabase.rpc('submit_homework', { p_session_id: hw.id, p_problems: 1000, p_photo_paths: [] }),
    'problems_out_of_range',
  )
  check('submit_homework 1000 은 거부', hwTooMany.ok, hwTooMany.message)
  const hwSubsBefore = await run(supabase.from('homework_submissions').select('id').eq('session_id', hw.id))
  check('거부된 숙제는 제출 줄이 생기지 않음', (hwSubsBefore ?? []).length === 0, hwSubsBefore)

  const submitted = await run(supabase.rpc('submit_homework', { p_session_id: hw.id, p_problems: 3, p_photo_paths: [] }))
  check('submit_homework 3 은 승인 대기', submitted?.pending_approval === true && submitted?.submitted_problems === 3, submitted?.submitted_problems)
  log = await logOf(student.id)
  check('승인 전 숙제는 기록에 안 들어감', log?.homework_problems === 0 && log?.problems === 5, log)

  /* 숙제 승인 → 기록에 숙제 3문제 */
  const submissionId = submitted?.submission_id ?? submitted?.submission?.id
  await run(supabase.rpc('review_homework_submission', { p_submission_id: submissionId, p_time_approved: true, p_problems_approved: true }))
  log = await logOf(student.id)
  check('숙제 승인 뒤 3문제 반영', log?.homework_problems === 3 && log?.problems === 8, log)

  /* ── 3) 오늘 학원 문제 수 수정 — 학원만 바뀌고 숙제·시간은 그대로 ── */
  const edited = await run(supabase.rpc('student_update_today_academy_problems', { p_student_id: student.id, p_problems: 20 }))
  log = await logOf(student.id)
  check('오늘 학원 20문제로 수정', log?.academy_problems === 20 && log?.problems === 23, log)
  check('숙제 문제 수는 그대로', log?.homework_problems === 3, log?.homework_problems)
  check('수정해도 공부 시간은 그대로', log?.academy_minutes === 25 && log?.minutes > 0, `${log?.academy_minutes}분 / ${log?.minutes}분`)
  check('수정 결과에 합계가 함께 온다', edited?.problems === 23 && edited?.academy_problems === 20, edited?.problems)

  /* ── 4) 1000·-1·null 은 거부되고 값은 그대로 ─────────────────────── */
  for (const [label, value] of [['1000', 1000], ['-1', -1], ['null', null]]) {
    const res = await expectError(
      supabase.rpc('student_update_today_academy_problems', { p_student_id: student.id, p_problems: value }),
      'problems_out_of_range',
    )
    check(`오늘 학원 문제 수 ${label} 은 거부`, res.ok, res.message)
  }
  log = await logOf(student.id)
  check('거부 뒤에도 20문제 그대로', log?.academy_problems === 20 && log?.problems === 23, log)

  /* ── 5) 0 과 999 는 통과 ─────────────────────────────────────────── */
  await run(supabase.rpc('student_update_today_academy_problems', { p_student_id: student.id, p_problems: 0 }))
  log = await logOf(student.id)
  check('0문제로 수정', log?.academy_problems === 0 && log?.problems === 3, log)

  await run(supabase.rpc('student_update_today_academy_problems', { p_student_id: student.id, p_problems: 999 }))
  log = await logOf(student.id)
  check('999문제로 수정', log?.academy_problems === 999 && log?.problems === 1002, log)

  /* ── 6) 어제 기록은 그대로 ───────────────────────────────────────── */
  await run(
    supabase.from('study_logs').insert({
      student_id: student.id,
      date: yesterdayKst(),
      minutes: 40,
      problems: 8,
      academy_minutes: 40,
      academy_problems: 8,
    }),
  )
  await run(supabase.rpc('student_update_today_academy_problems', { p_student_id: student.id, p_problems: 11 }))
  const yesterday = await run(supabase.from('study_logs').select('*').eq('student_id', student.id).eq('date', yesterdayKst()).maybeSingle())
  check('어제 기록은 그대로 (8문제)', yesterday?.academy_problems === 8 && yesterday?.problems === 8, yesterday)
  log = await logOf(student.id)
  check('오늘만 11문제로 바뀜', log?.academy_problems === 11 && log?.problems === 14, log)

  /* ── 7) 오늘 학원 공부가 없는 날 — no_academy_today ───────────────── */
  await run(
    supabase.from('study_logs').insert({
      student_id: other.id,
      date: todayKst(),
      minutes: 20,
      problems: 7,
      homework_minutes: 20,
      homework_problems: 7,
    }),
  )
  const noAcademy = await expectError(
    supabase.rpc('student_update_today_academy_problems', { p_student_id: other.id, p_problems: 3 }),
    'no_academy_today',
  )
  check('숙제만 한 날은 학원 문제 수를 못 고침', noAcademy.ok, noAcademy.message)
  const otherLog = await logOf(other.id)
  check('숙제만 한 기록은 그대로', otherLog?.academy_problems === 0 && otherLog?.problems === 7, otherLog)

  /* ── 8) 오늘 기록이 없는 학생 — log_not_found ─────────────────────── */
  await run(supabase.from('study_logs').delete().eq('student_id', other.id).eq('date', todayKst()))
  const noLog = await expectError(
    supabase.rpc('student_update_today_academy_problems', { p_student_id: other.id, p_problems: 3 }),
    'log_not_found',
  )
  check('오늘 기록이 없으면 못 고침', noLog.ok, noLog.message)

  /* ── 9) 관리자 「수업 종료」 — 세션 단위 999 까지 ──────────────────── */
  const s3 = await run(supabase.rpc('start_session', { p_student_id: other.id, p_kind: 'academy' }))
  await run(
    supabase.from('study_sessions').update({ started_at: minutesAgo(20), last_heartbeat_at: new Date().toISOString() }).eq('id', s3.id),
  )
  const ended = await run(supabase.rpc('admin_end_study_session', { p_session_id: s3.id, p_problems: 1000 }))
  check('관리자 수업 종료 1000 → 999로 다듬어짐', ended?.problems === 999, ended?.problems)
  const otherAfter = await logOf(other.id)
  check('관리자 종료 뒤 기록 — 학원 999', otherAfter?.academy_problems === 999, otherAfter)

  /* ── 10) set_session_problems — 1000 거부, 7 통과 ────────────────── */
  const pending = await run(
    supabase
      .from('study_sessions')
      .insert({
        student_id: student.id,
        status: 'finished',
        kind: 'academy',
        started_at: minutesAgo(120),
        ended_at: minutesAgo(60),
        last_heartbeat_at: new Date().toISOString(),
        date: todayKst(),
        minutes: 30,
        problems: 0,
        problems_pending: true,
      })
      .select('id')
      .single(),
  )
  const pendingTooMany = await expectError(
    supabase.rpc('set_session_problems', { p_session_id: pending.id, p_problems: 1000 }),
    'problems_out_of_range',
  )
  check('set_session_problems 1000 은 거부', pendingTooMany.ok, pendingTooMany.message)
  const pendingRow = await run(supabase.from('study_sessions').select('problems_pending').eq('id', pending.id).maybeSingle())
  check('거부 뒤에도 문제 수 대기 그대로', pendingRow?.problems_pending === true, pendingRow)

  await run(supabase.rpc('set_session_problems', { p_session_id: pending.id, p_problems: 7 }))
  log = await logOf(student.id)
  check('set_session_problems 7 반영 (11+7)', log?.academy_problems === 18, log?.academy_problems)

  /* ── 11) 예전 호출 모양(문제 수 없이)도 그대로 ────────────────────── */
  const s4 = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'academy' }))
  await run(supabase.from('study_sessions').update({ started_at: minutesAgo(10) }).eq('id', s4.id))
  const legacy = await run(supabase.rpc('finish_session', { p_session_id: s4.id }))
  check('예전 모양 finish_session(문제 수 없이) 0문제로 끝남', legacy?.problems === 0, legacy?.problems)

  /* ── 12) 실제 운영 데이터는 그대로 ───────────────────────────────── */
  const afterLogs = await run(
    supabase.from('study_logs').select('id,student_id,date,minutes,problems,academy_problems,homework_problems'),
  )
  const realLogsAfter = (afterLogs ?? [])
    .filter((row) => row.student_id !== student.id && row.student_id !== other.id)
    .map((row) => `${row.id}:${row.student_id}:${row.date}:${row.minutes}:${row.problems}:${row.academy_problems}:${row.homework_problems}`)
    .sort()
  check('실제 학생 기록은 하나도 바뀌지 않음', JSON.stringify(realLogsAfter) === JSON.stringify(realLogs), {
    before: realLogs.length,
    after: realLogsAfter.length,
  })
  const afterLive = await run(supabase.from('study_sessions').select('id,student_id,status').neq('status', 'finished'))
  const realLiveAfter = (afterLive ?? [])
    .filter((row) => row.student_id !== student.id && row.student_id !== other.id)
    .map((row) => row.id)
    .sort()
  check('실제 진행 중 세션은 그대로', JSON.stringify(realLiveAfter) === JSON.stringify(realLiveIds), realLiveAfter)
} finally {
  await cleanup()
}

/* 남은 검증 데이터가 없어야 한다 */
const leftStudents = await run(supabase.from('students').select('id', { count: 'exact' }).eq('grade', '검증'))
const leftLogs = await run(supabase.from('study_logs').select('id').in('student_id', [student.id, other.id]))
const leftSessions = await run(supabase.from('study_sessions').select('id').in('student_id', [student.id, other.id]))
check('검증용 학생 0건', (leftStudents ?? []).length === 0, leftStudents?.length)
check('검증용 기록·세션 0건', (leftLogs ?? []).length === 0 && (leftSessions ?? []).length === 0, [leftLogs?.length, leftSessions?.length])

console.log(failed === 0 ? 'ALL E2E PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
