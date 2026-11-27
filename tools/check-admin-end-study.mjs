/**
 * 관리자 「수업 종료」 — 실서비스 화면 확인 (360px, 개발용)
 *   node tools/check-admin-end-study.mjs [url] [screenshot-dir]
 *
 * 확인하는 것
 *   · 관리자 실시간 탭의 활성 세션 카드에 「수업 종료」 버튼 (학원·숙제 모두)
 *   · 확인 창 — 학생 이름·지금까지의 시간·문제 수(비우면 0문제)·안내, 360px 에서 잘리지 않음
 *   · 확정 → 기록에 25분·7문제, 목록에서 사라짐, 안내 문구
 *   · 숙제 공부 → 승인 대기 제출 (사진 0장 · 0문제)
 *   · 학생 기기가 타이머에 머물러 있어도 10초 안에 '선생님이 마무리' 결과 화면으로 바뀜
 * 검증용 학생·세션·기록은 끝나고 지운다.
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
const adminPassword = env.VITE_ADMIN_PASSWORD ?? '0801'
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

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-P613) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const code = String(Math.floor(1000 + Math.random() * 8999))
const student = await run(
  supabase.from('students').insert({ name: '검증수업종료', code, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id}`)

const startSession = async (kind, minutes) => {
  const session = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: kind }))
  await run(
    supabase
      .from('study_sessions')
      .update({
        started_at: new Date(Date.now() - minutes * 60_000).toISOString(),
        last_heartbeat_at: new Date().toISOString(),
      })
      .eq('id', session.id),
  )
  return session
}

let browser
const sessionIds = []
try {
  browser = await chromium.launch({
    executablePath:
      process.env.PW_CHROME ?? '/workspace/tmp/pw/browsers/chromium_headless_shell-1148/chrome-linux/headless_shell',
    args: ['--no-sandbox'],
  })

  const adminContext = await browser.newContext({
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: ANDROID_UA,
  })
  const admin = await adminContext.newPage()

  /* ── 1) 학원 공부 세션 (25분) — 실시간 탭에서 「수업 종료」 ─────────── */
  const academy = await startSession('academy', 25)
  sessionIds.push(academy.id)

  await admin.goto(`${base}/admin`, { waitUntil: 'networkidle' })
  await admin.waitForTimeout(700)
  if (await admin.getByLabel('관리자 비밀번호').isVisible().catch(() => false)) {
    await admin.getByLabel('관리자 비밀번호').fill(adminPassword)
    await admin.getByRole('button', { name: '입장' }).click()
    await admin.waitForTimeout(900)
  }

  await admin.getByRole('button', { name: /실시간/ }).first().click()
  await admin.waitForTimeout(1800)
  const mainText = (await admin.locator('main').innerText()).replace(/\s+/g, ' ')
  check('관리자: 실시간 탭에 검증 학생', mainText.includes('검증수업종료'), mainText.slice(0, 160))
  check('관리자: 카드에 「수업 종료」 버튼', (await admin.getByRole('button', { name: '검증수업종료 수업 종료' }).count()) === 1)

  const rowButton = admin.getByRole('button', { name: '검증수업종료 수업 종료' })
  const rowBox = await rowButton.boundingBox()
  check(
    '관리자: 버튼이 360px 안에 있음',
    Boolean(rowBox) && rowBox.x >= 0 && rowBox.x + rowBox.width <= 360,
    JSON.stringify(rowBox),
  )
  await rowButton.scrollIntoViewIfNeeded()
  await admin.waitForTimeout(500)
  await admin.screenshot({ path: `${shotDir}/sunogong-admin-end-study-list-360.png`, fullPage: false })

  await rowButton.click()
  const dialog = admin.getByRole('dialog', { name: '수업을 마칠까요?' })
  await dialog.waitFor({ state: 'visible', timeout: 8000 })
  const dialogText = (await dialog.innerText()).replace(/\s+/g, ' ')
  check('확인 창: 제목', dialogText.includes('수업을 마칠까요?'))
  check('확인 창: 학생 이름', dialogText.includes('검증수업종료'))
  check('확인 창: 지금까지의 시간(25분)', dialogText.includes('지금까지') && dialogText.includes('25분'), dialogText.slice(0, 200))
  check('확인 창: 공부 종류', dialogText.includes('🏫 학원 공부') && dialogText.includes('공부 중'))
  check('확인 창: 문제 수 입력칸', dialogText.includes('오늘 푼 숙제 수 (선택)'))
  check('확인 창: 비우면 0문제 안내', dialogText.includes('0문제'))
  check('확인 창: 학원은 바로 기록 안내', dialogText.includes('바로 들어가요'))
  check('확인 창: 취소·종료 버튼', dialogText.includes('취소') && dialogText.includes('수업 종료'))
  const dialogBox = await dialog.boundingBox()
  check(
    '확인 창: 360px 안에서 잘리지 않음',
    Boolean(dialogBox) && dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= 360,
    JSON.stringify(dialogBox),
  )
  await admin.screenshot({ path: `${shotDir}/sunogong-admin-end-study-360.png`, fullPage: false })

  /* 문제 수 7 을 넣고 확정 */
  await dialog.getByLabel('오늘 푼 숙제 수 (선택)').fill('7')
  await admin.waitForTimeout(200)
  await dialog.getByRole('button', { name: '수업 종료', exact: true }).click()
  await admin.waitForTimeout(2000)

  const afterText = (await admin.locator('main').innerText()).replace(/\s+/g, ' ')
  check('종료 뒤: 안내 문구(25분·7문제)', afterText.includes('25분 7문제로 수업을 마무리했어요'), afterText.slice(0, 200))
  check('종료 뒤: 목록에서 사라짐', (await admin.getByRole('button', { name: '검증수업종료 수업 종료' }).count()) === 0)
  await admin.screenshot({ path: `${shotDir}/sunogong-admin-end-study-done-360.png`, fullPage: false })

  const endedRow = await run(supabase.from('study_sessions').select('*').eq('id', academy.id).single())
  check('DB: 세션 finished', endedRow.status === 'finished', endedRow.status)
  check('DB: 25분·7문제', endedRow.minutes === 25 && endedRow.problems === 7, `${endedRow.minutes}분 ${endedRow.problems}문제`)
  check('DB: 선생님 종료 표시', endedRow.ended_by_admin === true, endedRow.ended_by_admin)
  const log = await run(
    supabase.from('study_logs').select('*').eq('student_id', student.id).eq('date', endedRow.date).maybeSingle(),
  )
  check('DB: 기록에 학원 25분·7문제', log?.academy_minutes === 25 && log?.academy_problems === 7, log)

  /* ── 2) 숙제 공부 세션 (20분) — 문제 수를 비우고 종료 → 승인 대기 ── */
  const homework = await startSession('homework', 20)
  sessionIds.push(homework.id)
  await admin.getByRole('button', { name: '새로고침' }).first().click()
  await admin.waitForTimeout(1800)
  await admin.getByRole('button', { name: '검증수업종료 수업 종료' }).click()
  const homeworkDialog = admin.getByRole('dialog', { name: '수업을 마칠까요?' })
  await homeworkDialog.waitFor({ state: 'visible', timeout: 8000 })
  const homeworkText = (await homeworkDialog.innerText()).replace(/\s+/g, ' ')
  check('숙제 확인 창: 공부 종류', homeworkText.includes('🏠 숙제 공부'), homeworkText.slice(0, 160))
  check('숙제 확인 창: 승인 안내', homeworkText.includes('승인'))
  await admin.screenshot({ path: `${shotDir}/sunogong-admin-end-study-homework-360.png`, fullPage: false })
  await homeworkDialog.getByRole('button', { name: '수업 종료', exact: true }).click()
  await admin.waitForTimeout(2200)
  const afterHomework = (await admin.locator('main').innerText()).replace(/\s+/g, ' ')
  check('숙제 종료 뒤: 승인 대기 안내', afterHomework.includes('승인 대기로 넘겼어요'), afterHomework.slice(0, 220))

  const sub = await run(supabase.from('homework_submissions').select('*').eq('session_id', homework.id).maybeSingle())
  check('DB: 숙제 제출 pending', sub?.status === 'pending', sub?.status)
  check('DB: 20분·0문제', sub?.submitted_minutes === 20 && sub?.submitted_problems === 0, sub)
  const logAfter = await run(
    supabase.from('study_logs').select('*').eq('student_id', student.id).eq('date', endedRow.date).maybeSingle(),
  )
  check('DB: 숙제는 아직 기록에 없음', (logAfter?.homework_minutes ?? 0) === 0, logAfter?.homework_minutes)

  /* ── 3) 학생 기기가 타이머에 머물러 있어도 종료를 알아챈다 ─────────── */
  const live = await startSession('academy', 10)
  sessionIds.push(live.id)

  const studentContext = await browser.newContext({
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: ANDROID_UA,
  })
  const studentPage = await studentContext.newPage()
  await studentPage.goto(`${base}/`, { waitUntil: 'networkidle' })
  await studentPage.waitForTimeout(500)
  for (const digit of code) {
    await studentPage.getByRole('button', { name: digit, exact: true }).click()
  }
  await studentPage.getByRole('button', { name: '확인', exact: true }).click()
  await studentPage.waitForTimeout(1500)
  check('학생: 타이머 화면', await studentPage.getByText('학원 공부는 화면이 꺼져도 계속 가요').first().isVisible())

  const beforeEnd = Date.now()
  await run(supabase.rpc('admin_end_study_session', { p_session_id: live.id, p_problems: 3 }))
  const detected = await studentPage
    .getByText('선생님이 수업을 마무리해서 타이머를 멈췄어요')
    .first()
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  check('학생: 선생님 종료를 알아채고 결과 화면', detected, `${Math.round((Date.now() - beforeEnd) / 1000)}초`)
  const resultText = (await studentPage.locator('body').innerText()).replace(/\s+/g, ' ')
  check('학생: 결과에 10분·3문제', resultText.includes('10분') && resultText.includes('3개'), resultText.slice(0, 200))
  check('학생: 오류 안내 없음', !resultText.includes('알 수 없는 오류') && !resultText.includes('진행 중인 공부가 없어요'))
  await studentPage.screenshot({ path: `${shotDir}/sunogong-admin-end-study-student-360.png`, fullPage: false })
} finally {
  if (browser) await browser.close()

  await supabase.from('homework_submissions').delete().eq('student_id', student.id)
  await supabase.from('study_sessions').delete().eq('student_id', student.id)
  await supabase.from('study_logs').delete().eq('student_id', student.id)
  await supabase.from('dragonball_grants').delete().eq('student_id', student.id)
  await supabase.from('students').delete().eq('id', student.id)

  const { count: leftStudents } = await supabase.from('students').select('id', { count: 'exact', head: true }).eq('id', student.id)
  const { count: leftSessions } = await supabase
    .from('study_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', student.id)
  const { count: leftSubs } = await supabase
    .from('homework_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', student.id)
  const { count: leftLogs } = await supabase
    .from('study_logs')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', student.id)
  const { count: leftAdminEnded } = await supabase
    .from('study_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('ended_by_admin', true)
  check(
    '정리: 검증용 데이터 0건 (실제 학생의 선생님 종료 0건)',
    leftStudents === 0 && leftSessions === 0 && leftSubs === 0 && leftLogs === 0 && leftAdminEnded === 0,
    { leftStudents, leftSessions, leftSubs, leftLogs, leftAdminEnded },
  )
}

console.log(failed === 0 ? 'ALL ADMIN END STUDY UI CHECKS PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
