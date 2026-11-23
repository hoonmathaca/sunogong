/**
 * 숙제 공부를 사진 없이 제출 — 실서비스 화면 확인 (360px, 개발용)
 *   node tools/check-homework-no-photo.mjs [url] [screenshot-dir]
 * 확인하는 것
 *   · 타이머 종료 → 「숙제 공부 제출」 창에서 사진 0장으로 `제출` → 확인 창
 *     `사진 없이 공부를 마치면 반려될 수 있습니다. 그래도 제출하시겠습니까?`
 *     → `취소` 면 제출 창으로 돌아옴 → 다시 `제출` → `그래도 제출` → 사진 0장으로 승인 대기 저장
 *   · 60분 자동 종료된 「지난 숙제 공부 제출」 창에서도 같은 확인 → 사진 0장으로 저장
 * 검증용 학생·세션·기록·사진은 끝나고 지운다.
 */
import pw from '/workspace/tmp/pw/node_modules/playwright/index.js'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const { chromium } = pw
const base = (process.argv[2] ?? 'https://sunogong.vercel.app').replace(/\/$/, '')
const shotDir = (process.argv[3] ?? '/workspace/downloads').replace(/\/$/, '')

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

const CONFIRM_TEXT = '사진 없이 공부를 마치면 반려될 수 있습니다. 그래도 제출하시겠습니까?'

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

const code = String(Math.floor(1000 + Math.random() * 8999))
const student = await run(
  supabase.from('students').insert({ name: '검증사진없이', code, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id}`)

/** 숙제 세션을 만들고 시작 시각을 과거로 옮긴다 */
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

const enterCode = async (page) => {
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  for (const digit of code) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
  await page.getByRole('button', { name: '확인', exact: true }).click()
  await page.waitForTimeout(1600)
}

let browser
try {
  /* 1) 타이머 화면에서 마칠 때 — 25분 공부한 숙제 세션 */
  await homeworkSession(25)

  browser = await chromium.launch({
    executablePath:
      process.env.PW_CHROME ?? '/workspace/tmp/pw/browsers/chromium_headless_shell-1148/chrome-linux/headless_shell',
    args: ['--no-sandbox'],
  })
  const context = await browser.newContext({
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; SM-P613) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  for (const digit of code) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
  await page.getByRole('button', { name: '확인', exact: true }).click()
  await page.waitForTimeout(1500)

  check('학생: 숙제 타이머로 이어짐', await page.getByText('숙제 공부는 화면을 끄거나 나가면 멈춰요').first().isVisible())

  await page.getByRole('button', { name: '종료', exact: true }).click()
  await page.getByRole('button', { name: '마칠래요' }).click()
  const submitModal = page.getByRole('dialog', { name: '숙제 공부 제출' })
  await submitModal.waitFor({ state: 'visible', timeout: 8000 })

  /* 사진 0장 · 30문제로 제출 → 바로 내지 않고 확인 창 */
  for (const digit of ['3', '0']) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
  await page.getByRole('button', { name: '제출', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: '사진 없이 제출할까요?' })
  await confirm.waitFor({ state: 'visible', timeout: 8000 })
  const confirmText = (await confirm.innerText()).replace(/\s+/g, ' ')
  check('학생: 사진 0장이면 확인 창이 뜸', true)
  check('학생: 확인 문구 그대로', confirmText.includes(CONFIRM_TEXT), confirmText)
  check('학생: 확인 창에 취소·그래도 제출', confirmText.includes('취소') && confirmText.includes('그래도 제출'))
  const confirmBox = await confirm.boundingBox()
  check(
    '학생: 360px 안에서 확인 창이 잘리지 않음',
    Boolean(confirmBox) && confirmBox.x >= 0 && confirmBox.x + confirmBox.width <= 360,
    JSON.stringify(confirmBox),
  )
  await page.screenshot({ path: `${shotDir}/sunogong-homework-no-photo-confirm-360.png` })

  /* 취소 → 제출 창으로 돌아옴 (아직 저장 안 됨) */
  await confirm.getByRole('button', { name: '취소', exact: true }).click()
  await page.waitForTimeout(400)
  check('학생: 취소하면 확인 창이 닫힘', !(await confirm.isVisible().catch(() => false)))
  check('학생: 취소하면 제출 창으로 돌아옴', await submitModal.isVisible())
  const beforeRows = await run(
    supabase.from('homework_submissions').select('id, draft_active').eq('student_id', student.id),
  )
  const beforeSubmitted = beforeRows.filter((row) => row.draft_active === false)
  check('저장: 취소만으로는 제출되지 않음(초안만 남음)', beforeSubmitted.length === 0, JSON.stringify(beforeRows))

  /* 다시 제출 → 이번에는 그래도 제출 */
  await page.getByRole('button', { name: '제출', exact: true }).click()
  await confirm.waitFor({ state: 'visible', timeout: 8000 })
  await confirm.getByRole('button', { name: '그래도 제출', exact: true }).click()
  await page.waitForTimeout(2600)
  const resultText = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  check('학생: 사진 없이 제출됨(승인 대기 안내)', resultText.includes('선생님 확인을 기다려요'), resultText.slice(0, 200))

  const timerSub = await run(
    supabase.from('homework_submissions').select('*').eq('student_id', student.id).single(),
  )
  check(
    '저장: 사진 0장 · 30문제 · 25분 승인 대기',
    [timerSub.status, timerSub.submitted_problems, timerSub.photo_paths.length, timerSub.submitted_minutes],
    ['pending', 30, 0, 25],
  )
  check('저장: 기록에는 아직 없음', (await run(supabase.from('study_logs').select('id').eq('student_id', student.id))).length === 0)

  /* 2) 60분 자동 종료된 「지난 숙제 공부 제출」 창에서도 같은 확인 */
  const autoSession = await homeworkSession(0)
  await run(supabase.rpc('pause_session', { p_session_id: autoSession.id, p_auto: false }))
  const now = Date.now()
  await run(
    supabase
      .from('study_sessions')
      .update({
        started_at: new Date(now - 101 * 60_000).toISOString(),
        paused_at: new Date(now - 61 * 60_000).toISOString(),
        last_heartbeat_at: new Date(now - 61 * 60_000).toISOString(),
        paused_seconds: 0,
      })
      .eq('id', autoSession.id),
  )
  const ended = await run(supabase.rpc('auto_end_paused_session', { p_session_id: autoSession.id }))
  check(
    '자동 종료: 숙제 제출 줄이 문제 수 없이 대기',
    ended?.auto_ended === true && ended?.submission?.submitted_problems === null,
    JSON.stringify({ auto: ended?.auto_ended, problems: ended?.submission?.submitted_problems }),
  )

  await enterCode(page)
  const pendingModal = page.getByRole('dialog', { name: '지난 숙제 공부 제출' })
  await pendingModal.waitFor({ state: 'visible', timeout: 10000 })
  const pendingText = (await pendingModal.innerText()).replace(/\s+/g, ' ')
  check('지난 숙제: 제출 창이 뜸', pendingText.includes('지난 숙제 공부 제출'))
  check('지난 숙제: 사진 0장 안내', pendingText.includes('0/5'))

  for (const digit of ['1', '2']) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
  await pendingModal.getByRole('button', { name: '제출', exact: true }).click()
  const pendingConfirm = page.getByRole('dialog', { name: '사진 없이 제출할까요?' })
  await pendingConfirm.waitFor({ state: 'visible', timeout: 8000 })
  check('지난 숙제: 사진 0장이면 확인 창', (await pendingConfirm.innerText()).includes(CONFIRM_TEXT))
  /* 열리는 애니메이션(fadein)이 끝난 뒤에 찍는다 */
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${shotDir}/sunogong-homework-no-photo-confirm-pending-360.png` })
  await pendingConfirm.getByRole('button', { name: '그래도 제출', exact: true }).click()
  await page.waitForTimeout(2200)
  check('지난 숙제: 확인 뒤 제출 창이 닫힘', !(await pendingModal.isVisible().catch(() => false)))

  const pendingSub = await run(
    supabase
      .from('homework_submissions')
      .select('*')
      .eq('student_id', student.id)
      .eq('session_id', autoSession.id)
      .single(),
  )
  check('저장: 지난 숙제 12문제 · 사진 0장', [pendingSub.submitted_problems, pendingSub.photo_paths.length], [12, 0])
} finally {
  if (browser) await browser.close()
  await supabase.from('homework_submissions').delete().eq('student_id', student.id)
  await supabase.from('study_logs').delete().eq('student_id', student.id)
  await supabase.from('study_sessions').delete().eq('student_id', student.id)
  await supabase.from('students').delete().eq('id', student.id)
  const { data: files } = await supabase.storage.from('homework-photos').list(`${student.id}`)
  for (const folder of files ?? []) {
    const { data: inner } = await supabase.storage.from('homework-photos').list(`${student.id}/${folder.name}`)
    const paths = (inner ?? []).map((file) => `${student.id}/${folder.name}/${file.name}`)
    if (paths.length > 0) await supabase.storage.from('homework-photos').remove(paths)
  }
  const { count: leftStudents } = await supabase.from('students').select('id', { count: 'exact', head: true }).eq('id', student.id)
  const { count: leftSubs } = await supabase
    .from('homework_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', student.id)
  const { count: leftSessions } = await supabase
    .from('study_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', student.id)
  check('정리: 검증용 데이터 0건', leftStudents === 0 && leftSubs === 0 && leftSessions === 0, {
    leftStudents,
    leftSubs,
    leftSessions,
  })
}

console.log(failed === 0 ? 'ALL NO-PHOTO CHECKS PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
