/**
 * 문제 수 0~999 상한 · 학생이 오늘 학원 공부 문제 수 수정 — 실서비스 화면 확인 (360×780, 개발용)
 *   node tools/check-problems-edit-ui.mjs [url] [screenshot-dir]
 *
 * 확인하는 것
 *   · 공부 종료 → 「오늘 푼 문제 수」 창에서 999 를 넘기는 자리를 누르면 막히고 안내 문구가 뜬다
 *   · 저장 → 결과 화면에 「✏️ 문제 수 수정」 → 창에서 20 으로 고치면 합계까지 바뀐다
 *   · 홈에서도 「✏️ 문제 수 수정」 → 0 으로 고치면 홈 숫자가 바뀐다
 *   · 999 초과 입력은 창에서 막히고 DB 값은 그대로다
 *   · 홈에는 '학원 공부 시작' 버튼이 없고(2026-11-26 제거) '숙제 공부 시작'으로 숙제 타이머가 열린다
 *   · 360px 화면에서 잘리지 않는다 (가로 넘침 없음)
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

const todayKst = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

const code = String(Math.floor(1000 + Math.random() * 8999))
const student = await run(
  supabase.from('students').insert({ name: '검증수정', code, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id}`)

/* 이미 25분 공부한 학원 세션을 만들어 두고, 학생이 이어서 마무리하는 것처럼 연다 */
const session = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'academy' }))
await run(
  supabase
    .from('study_sessions')
    .update({ started_at: new Date(Date.now() - 25 * 60_000).toISOString(), last_heartbeat_at: new Date().toISOString() })
    .eq('id', session.id),
)

const logOf = async () =>
  run(supabase.from('study_logs').select('*').eq('student_id', student.id).eq('date', todayKst()).maybeSingle())

let browser
try {
  browser = await chromium.launch({
    executablePath: process.env.PW_CHROME ?? '/workspace/tmp/pw/browsers/chromium_headless_shell-1148/chrome-linux/headless_shell',
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

  /* ── 1) 학생: 코드 입력 → 학원 타이머(이어서) ──────────────────────── */
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  for (const digit of code) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
  await page.getByRole('button', { name: '확인', exact: true }).click()
  await page.waitForTimeout(1200)
  check('학생: 학원 타이머로 이어짐', await page.getByText('학원 공부는 화면이 꺼져도 계속 가요').first().isVisible())

  /* ── 2) 종료 → 문제 수 창 → 999 초과는 막힌다 ─────────────────────── */
  await page.getByRole('button', { name: '종료', exact: true }).click()
  await page.getByRole('button', { name: '마칠래요' }).click()
  const problemModal = page.getByRole('dialog', { name: '오늘 푼 문제 수' })
  await problemModal.waitFor({ state: 'visible', timeout: 8000 })

  const digit = async (d) => problemModal.getByRole('button', { name: d, exact: true }).click()
  const modalText = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ')

  for (const d of ['9', '9', '9']) await digit(d)
  await page.waitForTimeout(150)
  let text = await modalText(problemModal)
  check('문제 수 창: 999 까지는 들어간다', text.includes('999'), text.slice(0, 120))

  await digit('9')
  await page.waitForTimeout(150)
  text = await modalText(problemModal)
  check('문제 수 창: 999 에서 한 자리 더 누르면 안내 문구', text.includes('문제 수는 999개까지 넣을 수 있어요'), text.slice(0, 160))
  const shownAfterBlock = text.match(/(\d{1,4})\s*문제/)?.[1]
  check('문제 수 창: 막힌 뒤에도 999 그대로', shownAfterBlock === '999', shownAfterBlock)
  await problemModal.screenshot({ path: `${shotDir}/sunogong-problems-limit-999-360.png` })

  /* 지우기 세 번 → 0 → 12 로 저장 */
  for (let i = 0; i < 3; i += 1) await problemModal.getByRole('button', { name: '지우기' }).click()
  await digit('1')
  await digit('2')
  await problemModal.getByRole('button', { name: '저장', exact: true }).click()
  await page.waitForTimeout(1500)

  /* ── 3) 결과 화면 — 12문제 · 「문제 수 수정」 ──────────────────────── */
  const resultHtml = await page.locator('body').innerText()
  check('결과 화면: 12문제가 들어감', resultHtml.replace(/\s+/g, ' ').includes('푼 문제 12개'), resultHtml.slice(0, 160))
  const editButton = page.getByRole('button', { name: /문제 수 수정/ }).first()
  check('결과 화면: 「문제 수 수정」 버튼', await editButton.isVisible())

  let log = await logOf()
  check('DB: 학원 12문제·합계 12문제', log?.academy_problems === 12 && log?.problems === 12, log)

  await editButton.click()
  const editModal = page.getByRole('dialog', { name: '오늘 학원 공부 문제 수' })
  await editModal.waitFor({ state: 'visible', timeout: 8000 })
  let editText = await modalText(editModal)
  check('수정 창: 지금 기록 12문제', editText.includes('지금 기록 12문제'), editText.slice(0, 160))
  check('수정 창: 0~999 안내', editText.includes('0~999문제까지'), editText.slice(0, 200))
  check('수정 창: 숙제는 승인 뒤 안내', editText.includes('숙제 공부 문제 수는 선생님 확인 뒤에'), editText.slice(0, 200))

  /* 고치기 전에는 저장이 잠겨 있다 */
  const saveBtn = editModal.getByRole('button', { name: '저장', exact: true })
  check('수정 창: 값이 그대로면 저장 잠김', await saveBtn.isDisabled())

  for (let i = 0; i < 2; i += 1) await editModal.getByRole('button', { name: '지우기' }).click()
  await editModal.getByRole('button', { name: '2', exact: true }).click()
  await editModal.getByRole('button', { name: '0', exact: true }).click()
  check('수정 창: 20 입력하면 저장 열림', !(await saveBtn.isDisabled()))
  await saveBtn.click()
  await page.waitForTimeout(1500)

  const afterSave = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  check('결과 화면: 20개로 바뀌었다는 안내', afterSave.includes('오늘 학원 문제 수를 20개로 바꿨어요'), afterSave.slice(0, 200))
  check('결과 화면: 오늘 문제 합계 20개', afterSave.includes('오늘 문제 합계 20개'), afterSave.slice(0, 240))
  log = await logOf()
  check('DB: 학원 20문제·합계 20문제', log?.academy_problems === 20 && log?.problems === 20, log)

  /* ── 4) 홈 — 「문제 수 수정」 → 0 으로 ─────────────────────────────── */
  await page.getByRole('button', { name: '홈으로' }).click()
  await page.waitForTimeout(1800)
  const homeText = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  check('홈: 푼 문제 20개', homeText.includes('푼 문제 20개'), homeText.slice(0, 200))
  const homeEdit = page.getByRole('button', { name: /문제 수 수정/ }).first()
  check('홈: 「문제 수 수정」 버튼', await homeEdit.isVisible())

  await homeEdit.click()
  const homeModal = page.getByRole('dialog', { name: '오늘 학원 공부 문제 수' })
  await homeModal.waitFor({ state: 'visible', timeout: 8000 })
  const box = await homeModal.boundingBox()
  check('홈 수정 창: 360px 안에 들어옴', Boolean(box) && box.x >= 0 && box.x + box.width <= 360, JSON.stringify(box))
  /* 필수 스크린샷 — 홈에서 오늘 학원 문제 수를 고치는 창 */
  await homeModal.screenshot({ path: `${shotDir}/sunogong-student-edit-problems-360.png` })

  /* 999 를 넘기려 하면 막히고, 취소하면 DB 는 그대로 */
  for (let i = 0; i < 2; i += 1) await homeModal.getByRole('button', { name: '지우기' }).click()
  for (const d of ['9', '9', '9']) await homeModal.getByRole('button', { name: d, exact: true }).click()
  await homeModal.getByRole('button', { name: '9', exact: true }).click()
  await page.waitForTimeout(200)
  editText = await modalText(homeModal)
  check('홈 수정 창: 999 초과 입력 막힘 안내', editText.includes('문제 수는 999개까지 넣을 수 있어요'), editText.slice(0, 200))
  await homeModal.getByRole('button', { name: '취소', exact: true }).click()
  await page.waitForTimeout(600)
  log = await logOf()
  check('홈 수정 창: 취소하면 DB 그대로 20문제', log?.academy_problems === 20, log?.academy_problems)

  /* 0 으로 고치기 */
  await page.getByRole('button', { name: /문제 수 수정/ }).first().click()
  const zeroModal = page.getByRole('dialog', { name: '오늘 학원 공부 문제 수' })
  await zeroModal.waitFor({ state: 'visible', timeout: 8000 })
  for (let i = 0; i < 2; i += 1) await zeroModal.getByRole('button', { name: '지우기' }).click()
  await zeroModal.getByRole('button', { name: '0', exact: true }).click()
  await zeroModal.getByRole('button', { name: '저장', exact: true }).click()
  await page.waitForTimeout(1600)
  const homeAfterZero = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  check('홈: 0문제로 바뀌었다는 안내', homeAfterZero.includes('오늘 학원 문제 수를 0개로 바꿨어요'), homeAfterZero.slice(0, 200))
  log = await logOf()
  check('DB: 학원 0문제·합계 0문제', log?.academy_problems === 0 && log?.problems === 0, log)

  /* ── 5) 360px 가로 넘침 없음 · 화면 안에 들어옴 ───────────────────── */
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  check('360px: 가로 넘침 없음', overflow.scrollWidth <= overflow.clientWidth + 1, JSON.stringify(overflow))
  await page.screenshot({ path: `${shotDir}/sunogong-student-edit-problems-home-360.png` })

  /* 2026-11-26 — 홈에는 '학원 공부 시작' 버튼이 없고, 숙제 공부 시작으로 타이머가 열린다 */
  const homeStartText = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  check('홈: 학원 공부 시작 버튼 없음', !homeStartText.includes('학원 공부 시작'), homeStartText.slice(0, 200))
  const homeworkStart = page.getByRole('button', { name: /숙제 공부 시작/ }).first()
  check('홈: 숙제 공부 시작 버튼 있음', await homeworkStart.isVisible())
  await homeworkStart.click()
  await page.waitForTimeout(1200)
  const onHomeworkTimer = (await page.locator('body').innerText()).includes('숙제 공부는 화면을 끄거나 나가면 멈춰요')
  check('숙제 공부 시작 → 숙제 타이머', onHomeworkTimer)
} finally {
  if (browser) await browser.close().catch(() => {})
  await supabase.from('homework_submissions').delete().eq('student_id', student.id)
  await supabase.from('study_sessions').delete().eq('student_id', student.id)
  await supabase.from('study_logs').delete().eq('student_id', student.id)
  await supabase.from('students').delete().eq('id', student.id)
}

const left = await run(supabase.from('students').select('id').eq('id', student.id))
check('검증용 학생 정리됨', (left ?? []).length === 0, left?.length)

console.log(failed === 0 ? 'ALL UI CHECKS PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
