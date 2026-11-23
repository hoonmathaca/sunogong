/**
 * 숙제 승인 「선생님 칭찬 한마디」 — 실서비스 E2E (개발용)
 *   node tools/e2e-homework-praise.mjs
 * 앱과 같은 anon 키로 실제 Supabase 에 붙어서
 *   숙제 제출(사진) → 승인할 때 칭찬 한마디 저장 → 학생이 읽는 목록에 그대로 보임 →
 *   예전 화면(4개 인자) 호출도 그대로 → 모두 반려면 칭찬은 저장하지 않음 →
 *   200자를 넘기면 comment_too_long → 공백만 있으면 null → 두 번 처리 못 함 →
 *   기록·드래곤볼은 예전과 같음
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

/* 1x1 PNG — 숙제 사진으로 올릴 파일 */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const code = String(Math.floor(1000 + Math.random() * 8999))
const student = await run(
  supabase.from('students').insert({ name: '검증칭찬', code, grade: '검증' }).select('id,name,code').single(),
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

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())

const readLog = async () => {
  const { data } = await supabase
    .from('study_logs')
    .select('*')
    .eq('student_id', student.id)
    .eq('date', today())
    .maybeSingle()
  return data
}

/** 숙제 세션을 하나 만들고 시작 시각을 과거로 옮긴다 */
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

/** 숙제 제출 한 건 만들기 → 제출 id */
const makeSubmission = async (minutesAgo, problems, tag) => {
  const session = await homeworkSession(minutesAgo)
  const photo = await uploadPhoto(tag)
  const submitted = await run(
    supabase.rpc('submit_homework', {
      p_session_id: session.id,
      p_problems: problems,
      p_photo_paths: [photo],
    }),
  )
  return submitted.submission_id
}

try {
  /* 1) 승인 + 칭찬 한마디 → 저장 */
  const sub1 = await makeSubmission(40, 30, 'a')
  const review1 = await run(
    supabase.rpc('review_homework_submission', {
      p_submission_id: sub1,
      p_time_approved: true,
      p_problems_approved: true,
      p_reject_reason: null,
      p_teacher_comment: '풀이가 꼼꼼해요',
    }),
  )
  check('승인: 칭찬 한마디가 그대로 저장', review1?.submission?.teacher_comment, '풀이가 꼼꼼해요')
  check('승인: 상태 approved', review1?.submission?.status, 'approved')
  check('승인: 40분·30문제 반영', [review1?.minutes, review1?.problems], [40, 30])

  const stored1 = await run(supabase.from('homework_submissions').select('*').eq('id', sub1).single())
  check('저장: 표에 teacher_comment', stored1.teacher_comment, '풀이가 꼼꼼해요')

  /* 2) 학생이 읽는 목록(select *)에 칭찬이 함께 온다 */
  const mine = await run(
    supabase
      .from('homework_submissions')
      .select('*')
      .eq('student_id', student.id)
      .eq('draft_active', false)
      .order('date', { ascending: false }),
  )
  check('학생 목록: 방금 승인 건에 칭찬', mine.find((row) => row.id === sub1)?.teacher_comment, '풀이가 꼼꼼해요')

  /* 3) 여러 칩을 이어 붙인 긴 칭찬도 한 줄로 저장 (앱이 보내는 모양 그대로) */
  const sub2 = await makeSubmission(25, 12, 'b')
  const chips = '글씨가 깔끔해요 어려운 문제 잘 고민했어요 스스로 잘 풀었어요'
  const review2 = await run(
    supabase.rpc('review_homework_submission', {
      p_submission_id: sub2,
      p_time_approved: true,
      p_problems_approved: true,
      p_reject_reason: null,
      p_teacher_comment: chips,
    }),
  )
  check('칩 여러 개: 그대로 저장·200자 이내', review2?.submission?.teacher_comment, chips)

  /* 4) 예전 화면(4개 인자) 호출 — 칭찬 칸이 없어도 그대로 승인 */
  const sub3 = await makeSubmission(20, 5, 'c')
  const review3 = await run(
    supabase.rpc('review_homework_submission', {
      p_submission_id: sub3,
      p_time_approved: true,
      p_problems_approved: false,
      p_reject_reason: null,
    }),
  )
  check('예전 호환: 4개 인자 호출 통과', review3?.submission?.status, 'approved')
  check('예전 호환: 칭찬은 비어 있음', review3?.submission?.teacher_comment === null, review3?.submission?.teacher_comment)

  /* 5) 모두 반려 + 칭찬 → 반려라서 저장하지 않음 */
  const sub4 = await makeSubmission(15, 3, 'd')
  const review4 = await run(
    supabase.rpc('review_homework_submission', {
      p_submission_id: sub4,
      p_time_approved: false,
      p_problems_approved: false,
      p_reject_reason: '답만 작성됨',
      p_teacher_comment: '다음엔 꼭 보여줘요',
    }),
  )
  check('모두 반려: 상태 rejected', review4?.submission?.status, 'rejected')
  check('모두 반려: 칭찬은 저장하지 않음', review4?.submission?.teacher_comment === null, review4?.submission?.teacher_comment)

  /* 6) 200자를 넘기면 거절 — 아무것도 바뀌지 않음 */
  const sub5 = await makeSubmission(10, 2, 'e')
  check(
    '200자 초과: comment_too_long',
    await fails(
      supabase.rpc('review_homework_submission', {
        p_submission_id: sub5,
        p_time_approved: true,
        p_problems_approved: true,
        p_teacher_comment: '가'.repeat(201),
      }),
      'comment_too_long',
    ),
  )
  const untouched = await run(supabase.from('homework_submissions').select('*').eq('id', sub5).single())
  check('200자 초과: 승인 대기 그대로', [untouched.status, untouched.teacher_comment], ['pending', null])

  /* 7) 공백만 있는 칭찬은 null */
  const review5 = await run(
    supabase.rpc('review_homework_submission', {
      p_submission_id: sub5,
      p_time_approved: true,
      p_problems_approved: true,
      p_teacher_comment: '   ',
    }),
  )
  check('공백만: 칭찬은 비어 있음', review5?.submission?.teacher_comment === null, review5?.submission?.teacher_comment)

  /* 8) 한 번 처리한 제출은 다시 못 함 (칭찬도 바꿀 수 없음) */
  check(
    '두 번 처리: already_reviewed',
    await fails(
      supabase.rpc('review_homework_submission', {
        p_submission_id: sub1,
        p_time_approved: true,
        p_problems_approved: true,
        p_teacher_comment: '다시',
      }),
      'already_reviewed',
    ),
  )
  const kept = await run(supabase.from('homework_submissions').select('teacher_comment').eq('id', sub1).single())
  check('두 번 처리: 처음 칭찬 그대로', kept.teacher_comment, '풀이가 꼼꼼해요')

  /* 9) 기록·드래곤볼은 숙제 승인 규칙 그대로 (칭찬과 별개) */
  const log = await readLog()
  check('기록: 승인된 시간만 더해짐', [log?.homework_minutes, log?.homework_problems], [65, 17])
  const { data: dragon } = await supabase
    .from('students')
    .select('dragonball_count')
    .eq('id', student.id)
    .single()
  check('드래곤볼: 그대로 0 (칭찬과 별개)', dragon?.dragonball_count === 0, dragon?.dragonball_count)

  /* 10) 사진 서명 주소는 그대로 동작 */
  const { data: signed, error: signError } = await supabase.storage
    .from('homework-photos')
    .createSignedUrls([uploaded[0]], 300)
  check('사진: 서명 주소로 볼 수 있음', !signError && Boolean(signed?.[0]?.signedUrl), signError?.message)
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

console.log(failed === 0 ? 'ALL HOMEWORK PRAISE E2E PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
