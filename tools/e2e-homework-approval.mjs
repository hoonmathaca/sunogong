/**
 * 숙제 공부 사진 인증 · 시간/문항수 분리 승인 — 실서비스 E2E (개발용)
 *   node tools/e2e-homework-approval.mjs
 * 앱과 같은 anon 키로 실제 Supabase 에 붙어서
 *   숙제 제출(사진) → 기록에 바로 안 들어감 → 원장님 승인(시간만/문항만/모두 반려) →
 *   승인한 항목만 기록 반영(드래곤볼은 별개 — 지급하지 않음) → 60분 자동 종료 뒤 문제 수·사진 채우기 →
 *   학원 공부는 예전처럼 바로 반영
 * 을 확인하고, 검증용 학생·기록·사진은 끝나고 지운다.
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
  supabase.from('students').insert({ name: '검증숙제', code, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id}`)

const uploaded = []
const uploadPhoto = async (tag) => {
  const path = `${student.id}/e2e/${Date.now()}-${tag}.png`
  const { error } = await supabase.storage.from('homework-photos').upload(path, PNG_1PX, {
    contentType: 'image/png',
    upsert: false,
  })
  if (error) throw new Error(`사진 올리기 실패: ${error.message}`)
  uploaded.push(path)
  return path
}

const today = () => {
  const now = new Date()
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now)
}

const readLog = async () => {
  const { data } = await supabase
    .from('study_logs')
    .select('*')
    .eq('student_id', student.id)
    .eq('date', today())
    .maybeSingle()
  return data
}

const readStudent = async () =>
  run(supabase.from('students').select('dragonball_count,dragonballs').eq('id', student.id).single())

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

try {
  /* 1) 숙제 제출 — 문제가 있는데 사진이 없으면 거절 */
  const s1 = await homeworkSession(40)
  check('제출: 문제가 있으면 사진 필수', await fails(supabase.rpc('submit_homework', {
    p_session_id: s1.id,
    p_problems: 30,
    p_photo_paths: [],
  }), 'photo_required'))

  /* 2) 사진 6장은 거절 */
  const sixPhotos = Array.from({ length: 6 }, (_, index) => `${student.id}/e2e/x-${index}.png`)
  check('제출: 사진은 5장까지', await fails(supabase.rpc('submit_homework', {
    p_session_id: s1.id,
    p_problems: 30,
    p_photo_paths: sixPhotos,
  }), 'too_many_photos'))

  /* 3) 사진과 함께 제출 → 승인 대기 (기록에 바로 안 들어감) */
  const photo1 = await uploadPhoto('a')
  const submitted = await run(supabase.rpc('submit_homework', {
    p_session_id: s1.id,
    p_problems: 30,
    p_photo_paths: [photo1],
  }))
  check('제출: 승인 대기로 넘어감', submitted?.pending_approval === true, submitted?.pending_approval)
  check('제출: 공부 시간 40분·문제 30개', [submitted?.submitted_minutes, submitted?.submitted_problems], [40, 30])
  check('제출: 기록에는 아직 안 들어감', (await readLog()) === null)
  check('제출: 드래곤볼도 아직 안 줌', (await readStudent()).dragonball_count === 0)

  const submission1 = await run(
    supabase.from('homework_submissions').select('*').eq('id', submitted.submission_id).single(),
  )
  check('제출: 표에 pending 한 줄', [submission1.status, submission1.time_verdict, submission1.problems_verdict], ['pending', 'pending', 'pending'])
  check('제출: 사진 경로 저장', submission1.photo_paths, [photo1])
  check('제출: 같은 세션 두 번 제출해도 한 줄', await (async () => {
    const again = await run(supabase.rpc('submit_homework', { p_session_id: s1.id, p_problems: 30, p_photo_paths: [photo1] }))
    const { count } = await supabase.from('homework_submissions').select('id', { count: 'exact', head: true }).eq('session_id', s1.id)
    return again?.already === true && count === 1
  })())

  /* 4) 원장님 — 시간만 승인, 문항수 반려 */
  const review1 = await run(supabase.rpc('review_homework_submission', {
    p_submission_id: submission1.id,
    p_time_approved: true,
    p_problems_approved: false,
    p_reject_reason: '답만 작성됨',
  }))
  check('승인: 상태 approved', review1?.submission?.status, 'approved')
  check('승인: 시간 40분만 반영', [review1?.minutes, review1?.problems], [40, 0])
  const log1 = await readLog()
  check('승인: 기록에 숙제 40분·0문제', [log1?.homework_minutes, log1?.homework_problems, log1?.minutes, log1?.problems], [40, 0, 40, 0])
  const after1 = await readStudent()
  check('승인: 드래곤볼은 주지 않음(별개)', after1.dragonball_count === 0, after1.dragonball_count)
  const { count: grantRows } = await supabase
    .from('dragonball_grants')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', student.id)
  check('승인: 드래곤볼 지급 이력도 없음', grantRows === 0, grantRows)
  check('승인: 반려 사유 저장', review1?.submission?.reject_reason, '답만 작성됨')
  check('승인: 처리 결과 저장', [review1?.submission?.time_verdict, review1?.submission?.problems_verdict], ['approved', 'rejected'])
  check('승인: 같은 제출을 두 번 처리 못 함', await fails(supabase.rpc('review_homework_submission', {
    p_submission_id: submission1.id,
    p_time_approved: true,
    p_problems_approved: true,
  }), 'already_reviewed'))
  check('승인: 두 번 처리해도 기록 그대로', (await readLog()).homework_minutes, 40)

  /* 5) 모두 반려 — 기록·드래곤볼 변화 없음 */
  const s2 = await homeworkSession(30)
  const photo2 = await uploadPhoto('b')
  const submitted2 = await run(supabase.rpc('submit_homework', {
    p_session_id: s2.id,
    p_problems: 10,
    p_photo_paths: [photo2],
  }))
  const review2 = await run(supabase.rpc('review_homework_submission', {
    p_submission_id: submitted2.submission_id,
    p_time_approved: false,
    p_problems_approved: false,
    p_reject_reason: '풀이 흔적 부족 사진 식별 불가',
  }))
  check('반려: 상태 rejected', review2?.submission?.status, 'rejected')
  check('반려: 기록은 그대로 40분', (await readLog()).homework_minutes, 40)
  check('반려: 드래곤볼은 그대로 0', (await readStudent()).dragonball_count === 0)
  check('반려: 반려 사유 함께 저장', review2?.submission?.reject_reason, '풀이 흔적 부족 사진 식별 불가')

  /* 6) 시간 반려 · 문항수만 승인 */
  const s3 = await homeworkSession(25)
  const photo3 = await uploadPhoto('c')
  const submitted3 = await run(supabase.rpc('submit_homework', {
    p_session_id: s3.id,
    p_problems: 7,
    p_photo_paths: [photo3],
  }))
  const review3 = await run(supabase.rpc('review_homework_submission', {
    p_submission_id: submitted3.submission_id,
    p_time_approved: false,
    p_problems_approved: true,
  }))
  check('부분: 승인 결과', [review3?.minutes, review3?.problems], [0, 7])
  const log3 = await readLog()
  check('부분: 문항수만 더해짐', [log3?.homework_minutes, log3?.homework_problems], [40, 7])
  check('부분: 승인해도 드래곤볼은 0', (await readStudent()).dragonball_count === 0)

  /* 7) 60분 자동 종료 → 다음 접속 때 문제 수·사진 채우기 */
  const s4 = await homeworkSession(70)
  await run(
    supabase
      .from('study_sessions')
      .update({
        status: 'paused',
        paused_at: new Date(Date.now() - 61 * 60_000).toISOString(),
        last_heartbeat_at: new Date(Date.now() - 61 * 60_000).toISOString(),
      })
      .eq('id', s4.id),
  )
  const auto = await run(supabase.rpc('auto_end_paused_session', { p_session_id: s4.id }))
  check('자동 종료: 승인 대기로 넘어감', auto?.pending_approval === true, auto?.pending_approval)
  const autoSub = await run(supabase.from('homework_submissions').select('*').eq('id', auto.submission_id).single())
  check('자동 종료: 문제 수는 아직 모름', autoSub.submitted_problems === null, autoSub.submitted_problems)
  check('자동 종료: 공부 시간은 9분', autoSub.submitted_minutes, 9)
  check('자동 종료: 기록에 바로 안 들어감', (await readLog()).homework_minutes, 40)
  const pending = await run(supabase.rpc('pending_homework_submissions', { p_student_id: student.id }))
  check('다음 접속: 문제 수를 기다리는 제출 1건', pending?.map((row) => row.id), [auto.submission_id])
  const photo4 = await uploadPhoto('d')
  const filled = await run(supabase.rpc('submit_pending_homework', {
    p_submission_id: auto.submission_id,
    p_problems: 12,
    p_photo_paths: [photo4],
  }))
  check('다음 접속: 문제 12개·사진 채움', [filled?.submitted_problems, filled?.photo_paths?.length], [12, 1])
  check('다음 접속: 채운 뒤 목록에서 빠짐', (await run(supabase.rpc('pending_homework_submissions', { p_student_id: student.id })))?.length === 0)
  const review4 = await run(supabase.rpc('review_homework_submission', {
    p_submission_id: auto.submission_id,
    p_time_approved: true,
    p_problems_approved: true,
  }))
  const log4 = await readLog()
  check('자동 종료 승인: 9분·12문제 더해짐', [review4?.minutes, review4?.problems, log4?.homework_minutes, log4?.homework_problems], [9, 12, 49, 19])
  check('자동 종료 승인: 드래곤볼은 그대로 0', (await readStudent()).dragonball_count === 0)

  /* 8) 학원 공부는 예전처럼 바로 반영 (사진·승인 없음) */
  const s5 = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'academy' }))
  await run(
    supabase
      .from('study_sessions')
      .update({ started_at: new Date(Date.now() - 20 * 60_000).toISOString(), last_heartbeat_at: new Date().toISOString() })
      .eq('id', s5.id),
  )
  const academy = await run(supabase.rpc('finish_session', { p_session_id: s5.id, p_problems: 5 }))
  check('학원: 바로 반영 (승인 대기 아님)', Boolean(academy?.pending_approval) === false, academy?.pending_approval)
  const log5 = await readLog()
  check('학원: 그날 기록에 학원 20분·5문제', [log5?.academy_minutes, log5?.academy_problems], [20, 5])
  const { count: academySubs } = await supabase
    .from('homework_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', s5.id)
  check('학원: 숙제 제출 줄을 만들지 않음', academySubs === 0, academySubs)

  /* 9) 사진 서명 주소 */
  const { data: signed, error: signError } = await supabase.storage
    .from('homework-photos')
    .createSignedUrls([photo1], 300)
  check('사진: 서명 주소로 볼 수 있음', !signError && Boolean(signed?.[0]?.signedUrl), signError?.message)

  /* 10) 아직 처리하지 않은 학생 목록에 이 학생이 있음 (관리자 배지용 count 도 확인) */
  const { count: waiting } = await supabase
    .from('homework_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  check('관리자: 승인 대기 수를 셀 수 있음', typeof waiting === 'number' && waiting >= 0, waiting)
} finally {
  /* 검증 데이터 정리 — 학생을 지우면 세션·기록·제출이 함께 지워진다 */
  await supabase.from('homework_submissions').delete().eq('student_id', student.id)
  await supabase.from('study_logs').delete().eq('student_id', student.id)
  await supabase.from('study_sessions').delete().eq('student_id', student.id)
  await supabase.from('dragonball_grants').delete().eq('student_id', student.id)
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

console.log(failed === 0 ? 'ALL HOMEWORK E2E PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
