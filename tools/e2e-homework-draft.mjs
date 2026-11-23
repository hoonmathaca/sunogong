/**
 * 숙제 사진 초안(사진·문제 수 저장 → 이어서 제출) — 실서비스 DB 검증 (개발용)
 *   node tools/e2e-homework-resume.mjs
 * 앱과 같은 anon 키로 실제 Supabase 에 붙어서
 *   초안 저장(사진 1장씩) → 목록에서 안 보임 → 제출하면 초안이 제출로 바뀜 →
 *   탭이 튕긴 뒤(초안만 남은 채) 60분 자동 종료 → 초안의 사진·문제 수가 살아 있음 →
 *   같은 세션 두 번 제출해도 한 줄 → 초안 지우기 · 1분 미만이라 남길 것 없음 →
 *   세션을 지우면 초안도 정리
 * 를 확인하고, 검증용 학생·기록·사진은 끝나고 지운다.
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

const fails = async (promise, keyword) => {
  const { error } = await promise
  if (!error) return false
  return error.message.includes(keyword)
}

/* 1x1 PNG — 사진 올리기 확인용 */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const code = String(Math.floor(1000 + Math.random() * 8999))
const student = await run(
  supabase.from('students').insert({ name: '검증초안', code, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id}`)

const uploaded = []
const uploadPhoto = async (tag) => {
  const path = `${student.id}/e2e-draft/${Date.now()}-${tag}.png`
  const { error } = await supabase.storage.from('homework-photos').upload(path, PNG_1PX, {
    contentType: 'image/png',
    upsert: false,
  })
  if (error) throw new Error(`사진 올리기 실패: ${error.message}`)
  uploaded.push(path)
  return path
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())

/** 숙제 공부 세션을 하나 만들고 시작 시각을 과거로 옮긴다 */
const homeworkSession = async (minutesAgo) => {
  const session = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'homework' }))
  await run(
    supabase
      .from('study_sessions')
      .update({
        started_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
        last_heartbeat_at: new Date().toISOString(),
      })
      .eq('id', session.id),
  )
  return session
}

const draftOf = async (sessionId) =>
  (
    await supabase.from('homework_submissions').select('*').eq('session_id', sessionId).maybeSingle()
  ).data

try {
  /* 1) 사진 1장 · 문제 12개를 초안으로 저장 (제출 창을 연 순간) */
  const s1 = await homeworkSession(25)
  const p1 = await uploadPhoto('a')
  const d1 = await run(
    supabase.rpc('save_homework_draft', {
      p_session_id: s1.id,
      p_problems: 12,
      p_photo_paths: [p1],
      p_open: true,
    }),
  )
  check('초안: 저장 결과가 초안 줄', d1?.submission?.draft_active === true, d1?.submission?.draft_active)
  check('초안: 사진 경로 저장', d1?.photo_paths, [p1])
  check('초안: 입력 중인 문제 수 저장', d1?.problems, 12)
  check('초안: 창 열림 표시', d1?.open, true)

  const row1 = await draftOf(s1.id)
  check('초안: 표에 초안 한 줄', [row1?.draft_active, row1?.submitted_problems, row1?.status], [true, null, 'pending'])
  check('초안: 아직 제출이 아니라 시간도 대기값', typeof row1?.submitted_minutes === 'number' && row1.submitted_minutes >= 20, row1?.submitted_minutes)

  const pendingDraft = await run(supabase.rpc('pending_homework_submissions', { p_student_id: student.id }))
  check('초안: 다음 접속 문제 수 목록에는 안 나옴', pendingDraft?.length === 0, pendingDraft?.length)

  const { count: pendingCount } = await supabase
    .from('homework_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .eq('draft_active', false)
  check('초안: 관리자 배지(승인 대기)에도 안 들어감', pendingCount === 0, pendingCount)

  /* 2) 두 번째 사진을 더 담는다 (탭이 튕겨 다시 열린 뒤 이어 찍는 것) */
  const p2 = await uploadPhoto('b')
  const d2 = await run(
    supabase.rpc('save_homework_draft', {
      p_session_id: s1.id,
      p_problems: 12,
      p_photo_paths: [p1, p2],
      p_open: true,
    }),
  )
  check('초안: 사진을 더 담으면 두 장', d2?.photo_paths?.length, 2)
  check('초안: 같은 세션에 한 줄만', (await supabase.from('homework_submissions').select('id').eq('session_id', s1.id)).data?.length, 1)

  /* 3) 창을 그냥 닫으면 open=false — 다시 접속해도 저절로 열지 않는다 */
  const d3 = await run(
    supabase.rpc('save_homework_draft', {
      p_session_id: s1.id,
      p_problems: 12,
      p_photo_paths: [p1, p2],
      p_open: false,
    }),
  )
  check('초안: 창을 닫으면 열림 표시가 내려감', d3?.open === false, d3?.open)

  /* 4) 제출 — 초안 줄이 제출 줄로 바뀐다 (세션도 마무리) */
  const submitted = await run(
    supabase.rpc('submit_homework', { p_session_id: s1.id, p_problems: 12, p_photo_paths: [p1, p2] }),
  )
  check('제출: 승인 대기로 넘어감', submitted?.pending_approval === true, submitted?.pending_approval)
  check('제출: 같은 세션에 한 줄(초안 재사용)', submitted?.already === undefined || submitted?.already === true, submitted?.already)
  const rowAfter = await draftOf(s1.id)
  check('제출: 초안 표시가 풀림', [rowAfter?.draft_active, rowAfter?.draft_open, rowAfter?.draft_problems], [false, false, null])
  check('제출: 사진 두 장 그대로', rowAfter?.photo_paths?.length, 2)
  check('제출: 문제 12개', rowAfter?.submitted_problems, 12)
  check('제출: 공부 시간 25분', rowAfter?.submitted_minutes, 25)
  check('제출: 세션도 마무리됨', submitted?.session?.status, 'finished')
  check('제출: 사진 경로가 중복되지 않음', new Set(rowAfter?.photo_paths ?? []).size, 2)

  /* 5) 같은 세션을 또 제출해도 한 줄 · 기록도 그대로 */
  const again = await run(
    supabase.rpc('submit_homework', { p_session_id: s1.id, p_problems: 12, p_photo_paths: [p1, p2] }),
  )
  check('제출: 두 번 불러도 이미 제출', again?.already === true, again?.already)
  check('제출: 두 번 불러도 한 줄', (await supabase.from('homework_submissions').select('id').eq('session_id', s1.id)).data?.length, 1)

  /* 6) 탭이 튕긴 채 쉬는 시간이 60분 → 자동 종료가 초안의 사진·문제 수를 살린다 */
  const s2 = await homeworkSession(70)
  const p3 = await uploadPhoto('c')
  await run(
    supabase.rpc('save_homework_draft', {
      p_session_id: s2.id,
      p_problems: 7,
      p_photo_paths: [p3],
      p_open: true,
    }),
  )
  await run(
    supabase
      .from('study_sessions')
      .update({
        status: 'paused',
        paused_at: new Date(Date.now() - 9 * 60_000).toISOString(),
        last_heartbeat_at: new Date(Date.now() - 61 * 60_000).toISOString(),
      })
      .eq('id', s2.id),
  )
  const auto = await run(supabase.rpc('auto_end_paused_session', { p_session_id: s2.id }))
  check('자동 종료: 승인 대기로 넘어감', auto?.pending_approval === true, auto?.pending_approval)
  const autoRow = await draftOf(s2.id)
  check('자동 종료: 초안의 사진이 살아 있음', autoRow?.photo_paths, [p3])
  check('자동 종료: 초안의 문제 수도 살아 있음', autoRow?.submitted_problems, 7)
  check('자동 종료: 초안 표시가 풀림', autoRow?.draft_active === false, autoRow?.draft_active)

  /* 7) 초안을 지우면 초안 줄만 사라진다 */
  const s3 = await homeworkSession(5)
  await run(supabase.rpc('save_homework_draft', { p_session_id: s3.id, p_problems: null, p_photo_paths: [], p_open: true }))
  const cleared = await run(supabase.rpc('clear_homework_draft', { p_session_id: s3.id }))
  check('초안 지우기: 한 줄 지움', cleared?.deleted, 1)
  check('초안 지우기: 초안 줄 없음', (await draftOf(s3.id)) === null)
  const clearedAgain = await run(supabase.rpc('clear_homework_draft', { p_session_id: s3.id }))
  check('초안 지우기: 이미 없으면 0', clearedAgain?.deleted === 0, clearedAgain?.deleted)
  check('초안 지우기: 끝난 세션의 제출 줄은 안 지움', (await run(supabase.rpc('clear_homework_draft', { p_session_id: s1.id })))?.deleted === 0, '삭제됨')

  /* 8) 1분 미만 · 0문제 → 남길 것이 없다 (초안 사진도 정리) */
  const s4 = await homeworkSession(0)
  await run(
    supabase
      .from('study_sessions')
      .update({ status: 'paused', paused_at: new Date().toISOString() })
      .eq('id', s4.id),
  )
  const p4 = await uploadPhoto('d')
  await run(supabase.rpc('save_homework_draft', { p_session_id: s4.id, p_problems: 0, p_photo_paths: [p4], p_open: true }))
  const nothing = await run(supabase.rpc('submit_homework', { p_session_id: s4.id, p_problems: 0, p_photo_paths: [p4] }))
  check('1분 미만: 남길 것이 없다고 알려 줌', nothing?.nothing === true, nothing?.nothing)
  check('1분 미만: 세션은 남아 있음(버리지 않음)', nothing?.session?.status, 'finished')
  check('1분 미만: 초안 줄은 정리됨', (await draftOf(s4.id)) === null)

  /* 9) 세션을 지우면 초안도 함께 정리 */
  const s5 = await homeworkSession(3)
  await run(supabase.rpc('save_homework_draft', { p_session_id: s5.id, p_problems: 3, p_photo_paths: [], p_open: true }))
  await run(supabase.from('study_sessions').delete().eq('id', s5.id))
  check('세션 삭제: 그 세션의 초안도 정리', (await draftOf(s5.id)) === null)

  /* 10) 같은 초안에 6장은 5장까지만 (DB·버킷 규칙) */
  const s6 = await homeworkSession(4)
  const many = await Promise.all(Array.from({ length: 6 }, (_, index) => uploadPhoto(`m-${index}`)))
  const capped = await run(
    supabase.rpc('save_homework_draft', { p_session_id: s6.id, p_problems: null, p_photo_paths: many, p_open: true }),
  )
  check('초안: 사진은 5장까지만 저장', capped?.photo_paths?.length, 5)

  /* 11) 끝난 세션에 초안을 저장하면 거절 (앱은 이 오류를 안내 문구로 바꾼다) */
  check(
    '초안: 끝난 세션에는 초안을 못 만듦',
    await fails(supabase.rpc('save_homework_draft', { p_session_id: s1.id, p_problems: 1, p_photo_paths: [], p_open: true }), 'session_finished'),
  )
  check(
    '초안: 대상이 없으면 거절',
    await fails(supabase.rpc('save_homework_draft', { p_problems: 1, p_photo_paths: [] }), 'draft_target_required'),
  )
} finally {
  /* 검증 데이터 정리 — 학생을 지우면 세션·기록·제출이 함께 지워진다 */
  await supabase.from('homework_submissions').delete().eq('student_id', student.id)
  await supabase.from('study_logs').delete().eq('student_id', student.id)
  await supabase.from('study_sessions').delete().eq('student_id', student.id)
  await supabase.from('students').delete().eq('id', student.id)
  if (uploaded.length > 0) await supabase.storage.from('homework-photos').remove(uploaded)

  const { count: leftStudents } = await supabase.from('students').select('id', { count: 'exact', head: true }).eq('id', student.id)
  const { count: leftSubs } = await supabase
    .from('homework_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', student.id)
  const { data: leftFiles } = await supabase.storage.from('homework-photos').list(`${student.id}`)
  check('정리: 검증용 학생·제출·사진 0건', leftStudents === 0 && leftSubs === 0 && (leftFiles?.length ?? 0) === 0, {
    leftStudents,
    leftSubs,
    leftFiles: leftFiles?.length ?? 0,
  })
}

console.log(failed === 0 ? 'ALL HOMEWORK DRAFT E2E PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
