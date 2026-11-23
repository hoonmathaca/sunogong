/**
 * 관리자 「수업 종료」 — 실서비스 E2E (개발용)
 *   node tools/e2e-admin-end-study.mjs
 *
 * 앱과 같은 anon 키로 실제 Supabase 에 붙어서
 *   · 공부 중인 학원 세션 → 지금까지의 시간으로 종료 · 문제 수 저장 · 두 번 눌러도 안전
 *   · 일시정지된 학원 세션 → paused_at 기준으로 정산
 *   · 숙제 세션 → 승인 대기 제출 (기록에는 아직 안 들어감) · 문제 수 0
 *   · 1분 미만 · 0문제 숙제 → 기록 없음
 *   · 자정을 넘긴 세션 → 기록하지 않고 정리
 *   · study_session_state 로 학생 기기가 종료를 알아챌 수 있는지
 *   · 이미 운영 중인 실제 학생 세션은 건드리지 않았는지
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

const near = (actual, expected, slack = 1) => Math.abs(Number(actual) - expected) <= slack

const minutesAgo = (mins) => new Date(Date.now() - mins * 60_000).toISOString()

const code = String(Math.floor(1000 + Math.random() * 8999))
const student = await run(
  supabase.from('students').insert({ name: '검증수업종료', code, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id}`)

/* 실제 학생 세션 — 시작 전 상태를 적어 두고 끝에 그대로인지 본다 */
const beforeLive = await run(
  supabase.from('study_sessions').select('id,student_id,status').neq('status', 'finished'),
)
const realLiveIds = (beforeLive ?? []).filter((row) => row.student_id !== student.id).map((row) => row.id)
console.log(`실제 진행 중 세션 ${realLiveIds.length}건 (건드리지 않아야 함)`)

const baseGrants = await run(supabase.from('dragonball_grants').select('id', { count: 'exact', head: false }).eq('student_id', student.id))
const sessionIds = []

/* 이미 선생님이 끝낸 세션(실제 운영 포함) — 새로 늘어난 것이 없어야 한다 */
const adminEndedBefore = await run(supabase.from('study_sessions').select('id').eq('ended_by_admin', true))
const adminEndedBeforeIds = new Set((adminEndedBefore ?? []).map((row) => row.id))

const cleanup = async () => {
  await supabase.from('students').delete().eq('id', student.id)
}

try {
  /* ── 1) 공부 중인 학원 세션 — 25분 공부, 7문제 ─────────────────────── */
  const s1 = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'academy' }))
  sessionIds.push(s1.id)
  await run(
    supabase
      .from('study_sessions')
      .update({ started_at: minutesAgo(25), last_heartbeat_at: new Date().toISOString() })
      .eq('id', s1.id),
  )

  const stateRunning = await run(supabase.rpc('study_session_state', { p_session_id: s1.id }))
  check('공부 중: 상태 확인은 running', stateRunning?.status === 'running', stateRunning?.status)

  const ended1 = await run(supabase.rpc('admin_end_study_session', { p_session_id: s1.id, p_problems: 7 }))
  check('공부 중: 종료됨', ended1?.session?.status === 'finished', ended1?.session?.status)
  check('공부 중: 25분으로 정산', near(ended1?.minutes, 25), ended1?.minutes)
  check('공부 중: 문제 수 7', ended1?.problems === 7, ended1?.problems)
  check('공부 중: 선생님 종료 표시', ended1?.ended_by_admin === true && ended1?.session?.ended_by_admin === true, ended1?.ended_by_admin)
  check('공부 중: 이미 끝난 세션 아님', ended1?.already_finished === false, ended1?.already_finished)
  check('공부 중: 세션에 종료 시각', Boolean(ended1?.session?.ended_at), ended1?.session?.ended_at)

  const log1 = await run(supabase.from('study_logs').select('*').eq('student_id', student.id).eq('date', ended1.date).maybeSingle())
  check('공부 중: 기록에 학원 25분·7문제', log1?.academy_minutes === 25 && log1?.academy_problems === 7, log1)
  check('공부 중: 기록 합계도 25분·7문제', log1?.minutes === 25 && log1?.problems === 7, log1)

  /* 두 번 눌러도 기록이 두 번 쌓이지 않는다 */
  const ended1b = await run(supabase.rpc('admin_end_study_session', { p_session_id: s1.id, p_problems: 99 }))
  check('두 번 누름: already_finished', ended1b?.already_finished === true, ended1b?.already_finished)
  check('두 번 누름: 시간·문제 그대로', ended1b?.minutes === 25 && ended1b?.problems === 7, ended1b)
  const log1b = await run(supabase.from('study_logs').select('*').eq('student_id', student.id).eq('date', ended1.date).maybeSingle())
  check('두 번 누름: 기록 그대로', log1b?.minutes === 25 && log1b?.problems === 7, log1b)

  /* 선생님이 끝낸 것을 학생 기기가 알아챈다 */
  const state1 = await run(supabase.rpc('study_session_state', { p_session_id: s1.id }))
  check('학생 확인: finished', state1?.status === 'finished', state1?.status)
  check('학생 확인: 결과에 선생님 종료 표시', state1?.result?.ended_by_admin === true, state1?.result?.ended_by_admin)
  check('학생 확인: 결과 시간 25분', near(state1?.result?.minutes, 25), state1?.result?.minutes)
  check('학생 확인: 오늘 합계 25분', near(state1?.result?.total_minutes, 25), state1?.result?.total_minutes)

  /* ── 2) 일시정지된 학원 세션 — 30분 공부하고 10분 쉼 ──────────────── */
  const s2 = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'academy' }))
  sessionIds.push(s2.id)
  await run(
    supabase
      .from('study_sessions')
      .update({ started_at: minutesAgo(40), last_heartbeat_at: minutesAgo(10) })
      .eq('id', s2.id),
  )
  const paused2 = await run(supabase.rpc('pause_session', { p_session_id: s2.id, p_auto: false }))
  await run(supabase.from('study_sessions').update({ paused_at: minutesAgo(10) }).eq('id', s2.id))
  check('일시정지: paused', paused2?.status === 'paused', paused2?.status)

  const ended2 = await run(supabase.rpc('admin_end_study_session', { p_session_id: s2.id, p_problems: 0 }))
  check('일시정지: 30분으로 정산(쉰 10분 제외)', near(ended2?.minutes, 30), ended2?.minutes)
  check('일시정지: 종료 시각은 멈춘 시각', ended2?.session?.ended_at?.startsWith(minutesAgo(10).slice(0, 16)), ended2?.session?.ended_at)
  check('일시정지: 문제 수 0', ended2?.problems === 0, ended2?.problems)
  const log2 = await run(supabase.from('study_logs').select('*').eq('student_id', student.id).eq('date', ended2.date).maybeSingle())
  check('일시정지: 기록 학원 55분·7문제', log2?.academy_minutes === 55 && log2?.academy_problems === 7, log2)

  /* ── 3) 숙제 세션 — 20분 공부, 0문제 → 승인 대기 ─────────────────── */
  const s3 = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'homework' }))
  sessionIds.push(s3.id)
  await run(
    supabase
      .from('study_sessions')
      .update({ started_at: minutesAgo(20), last_heartbeat_at: new Date().toISOString() })
      .eq('id', s3.id),
  )
  /* 사진 없이 낸 것과 같다 (학생이 초안에 문제 수를 적어 두지 않은 상태) */
  const ended3 = await run(supabase.rpc('admin_end_study_session', { p_session_id: s3.id, p_problems: 0 }))
  check('숙제: 승인 대기로 넘어감', ended3?.pending_approval === true, ended3?.pending_approval)
  check('숙제: 20분', near(ended3?.submitted_minutes, 20), ended3?.submitted_minutes)
  check('숙제: 문제 수 0', ended3?.submitted_problems === 0, ended3?.submitted_problems)
  check('숙제: 세션 끝남', ended3?.session?.status === 'finished', ended3?.session?.status)

  const sub3 = await run(supabase.from('homework_submissions').select('*').eq('session_id', s3.id).maybeSingle())
  check('숙제: 제출 줄이 pending', sub3?.status === 'pending', sub3?.status)
  check('숙제: 제출 줄 시간·문제 수', sub3?.submitted_minutes === 20 && sub3?.submitted_problems === 0, sub3)
  check('숙제: 사진 0장', Array.isArray(sub3?.photo_paths) && sub3.photo_paths.length === 0, sub3?.photo_paths)
  const log3 = await run(supabase.from('study_logs').select('*').eq('student_id', student.id).eq('date', ended3.date).maybeSingle())
  check('숙제: 기록에는 아직 안 들어감(학원 55분 그대로)', log3?.homework_minutes === 0 && log3?.academy_minutes === 55, log3)

  const state3 = await run(supabase.rpc('study_session_state', { p_session_id: s3.id }))
  check('숙제: 학생 확인 — 승인 대기·제출 id', state3?.result?.pending_approval === true && state3?.result?.submission_id === sub3.id, state3?.result)

  const ended3b = await run(supabase.rpc('admin_end_study_session', { p_session_id: s3.id, p_problems: 5 }))
  check('숙제 두 번 누름: already_finished', ended3b?.already_finished === true, ended3b?.already_finished)
  const sub3b = await run(supabase.from('homework_submissions').select('*').eq('session_id', s3.id).maybeSingle())
  check('숙제 두 번 누름: 제출 줄 한 개·그대로', sub3b?.submitted_problems === 0 && sub3b?.submitted_minutes === 20, sub3b)

  /* ── 4) 30초 공부한 숙제 · 0문제 → 기록 없음 ────────────────────── */
  const s4 = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'homework' }))
  sessionIds.push(s4.id)
  await run(
    supabase
      .from('study_sessions')
      .update({ started_at: new Date(Date.now() - 30_000).toISOString(), last_heartbeat_at: new Date().toISOString() })
      .eq('id', s4.id),
  )
  const ended4 = await run(supabase.rpc('admin_end_study_session', { p_session_id: s4.id, p_problems: 0 }))
  check('숙제 30초·0문제: nothing', ended4?.nothing === true, ended4)
  const sub4 = await run(supabase.from('homework_submissions').select('id').eq('session_id', s4.id))
  check('숙제 30초·0문제: 제출 줄 없음', (sub4 ?? []).length === 0, sub4)
  const log4 = await run(supabase.from('study_logs').select('*').eq('student_id', student.id).eq('date', ended4.date).maybeSingle())
  check('숙제 30초·0문제: 기록 그대로', log4?.minutes === 55 && log4?.homework_minutes === 0, log4)

  /* ── 5) 자정을 넘긴 세션 — 기록하지 않고 정리 ──────────────────── */
  const yesterday = new Date(Date.now() - 24 * 60 * 60_000)
  const yDate = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const s5 = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'academy' }))
  sessionIds.push(s5.id)
  await run(
    supabase
      .from('study_sessions')
      .update({ date: yDate, started_at: new Date(yesterday.getTime() - 60 * 60_000).toISOString() })
      .eq('id', s5.id),
  )
  const ended5 = await run(supabase.rpc('admin_end_study_session', { p_session_id: s5.id, p_problems: 3 }))
  check('자정 넘김: discarded', ended5?.discarded === true, ended5?.discarded)
  const gone5 = await run(supabase.from('study_sessions').select('id').eq('id', s5.id))
  check('자정 넘김: 세션 정리됨', (gone5 ?? []).length === 0, gone5)
  const logY = await run(supabase.from('study_logs').select('id').eq('student_id', student.id).eq('date', yDate))
  check('자정 넘김: 지난 날 기록 없음', (logY ?? []).length === 0, logY)

  /* ── 6) 없는 세션 ─────────────────────────────────────────────── */
  const missing = await supabase.rpc('admin_end_study_session', {
    p_session_id: '00000000-0000-4000-8000-000000000000',
    p_problems: 0,
  })
  check('없는 세션: session_not_found', String(missing.error?.message ?? '').includes('session_not_found'), missing.error?.message)

  const stateMissing = await run(supabase.rpc('study_session_state', { p_session_id: '00000000-0000-4000-8000-000000000000' }))
  check('없는 세션: 상태는 missing', stateMissing?.status === 'missing', stateMissing?.status)

  /* ── 7) 드래곤볼은 건드리지 않는다 ────────────────────────────── */
  const profile = await run(supabase.from('students').select('dragonball_count,candy_tickets,point_1000_tickets').eq('id', student.id).single())
  const grants = await run(supabase.from('dragonball_grants').select('id').eq('student_id', student.id))
  check('드래곤볼: 0개 그대로', Number(profile?.dragonball_count ?? 0) === 0, profile?.dragonball_count)
  check('드래곤볼: 지급 기록 없음', (grants ?? []).length === (baseGrants ?? []).length, grants)

  /* ── 8) 실제 학생 세션은 그대로 ──────────────────────────────── */
  const afterLive = await run(supabase.from('study_sessions').select('id,status,ended_by_admin').in('id', realLiveIds.length ? realLiveIds : ['00000000-0000-4000-8000-000000000000']))
  const touched = (afterLive ?? []).filter((row) => row.ended_by_admin)
  check('실제 세션: 선생님 종료로 건드린 것 없음', touched.length === 0, touched)
  const adminEndedElsewhere = await run(
    supabase.from('study_sessions').select('id,student_id').eq('ended_by_admin', true).neq('student_id', student.id),
  )
  const newlyEnded = (adminEndedElsewhere ?? []).filter((row) => !adminEndedBeforeIds.has(row.id))
  check('실제 세션: 새로 선생님 종료된 세션 없음', newlyEnded.length === 0, newlyEnded)
} finally {
  await cleanup()

  const leftStudents = await run(supabase.from('students').select('id').eq('name', '검증수업종료'))
  const leftSessions = await run(supabase.from('study_sessions').select('id').in('id', sessionIds.length ? sessionIds : ['00000000-0000-4000-8000-000000000000']))
  const leftSubs = await run(supabase.from('homework_submissions').select('id').eq('student_id', student.id))
  const leftLogs = await run(supabase.from('study_logs').select('id').eq('student_id', student.id))
  const leftAdmin = await run(supabase.from('study_sessions').select('id').eq('ended_by_admin', true))
  const leftNewAdmin = (leftAdmin ?? []).filter((row) => !adminEndedBeforeIds.has(row.id))

  check('정리: 검증용 학생 0명', (leftStudents ?? []).length === 0, leftStudents)
  check('정리: 남은 세션 0건', (leftSessions ?? []).length === 0, leftSessions)
  check('정리: 남은 제출 0건', (leftSubs ?? []).length === 0, leftSubs)
  check('정리: 남은 기록 0건', (leftLogs ?? []).length === 0, leftLogs)
  check('정리: 선생님 종료 표시가 새로 남은 세션 0건', leftNewAdmin.length === 0, leftNewAdmin)

  console.log(failed === 0 ? '\nALL ADMIN END STUDY E2E PASSED' : `\n${failed} FAILED`)
  process.exitCode = failed === 0 ? 0 : 1
}
