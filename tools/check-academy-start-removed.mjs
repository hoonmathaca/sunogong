/**
 * 「🏫 학원 공부 시작」 버튼 제거 확인 — 실서비스 화면 확인 (360×780, 개발용)
 *   node tools/check-academy-start-removed.mjs [url] [screenshot-dir]
 *
 * 2026-11-26 — 학원 공부는 출훈(등·하원)이 시작하고 정산한다.
 * 확인하는 것
 *   · 학생 홈에 '학원 공부 시작' 버튼이 없고 '숙제 공부 시작'(보라, 56px)만 있다
 *   · 숙제 공부 시작을 누르면 숙제 타이머가 열린다
 *   · 출훈이 시작한 것처럼 만든 학원 세션은 예전처럼 선오공 타이머로 이어 보인다(그대로 유지)
 *   · 학원 공부를 마친 결과 화면에는 '공부 더 하기' 가 없고 '홈으로' 만 있다
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

const text = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ')

const code = String(Math.floor(1000 + Math.random() * 8999))
const student = await run(
  supabase.from('students').insert({ name: '검증학원', code, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id}`)

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

  const enter = async () => {
    await page.goto(`${base}/`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    for (const digit of code) {
      await page.getByRole('button', { name: digit, exact: true }).click()
    }
    await page.getByRole('button', { name: '확인', exact: true }).click()
    await page.waitForTimeout(1200)
  }

  /* ── 1) 홈 — 학원 공부 시작 없음 · 숙제 공부 시작만 ──────────────────── */
  await enter()
  const homeText = await text(page)
  check('홈: 학원 공부 시작 버튼 없음', !homeText.includes('학원 공부 시작'), homeText.slice(0, 200))
  const homeworkStart = page.getByRole('button', { name: /숙제 공부 시작/ }).first()
  check('홈: 숙제 공부 시작 버튼 있음', await homeworkStart.isVisible())
  const startBox = await homeworkStart.boundingBox()
  check(
    '홈: 숙제 버튼이 360px 안에 있고 56px 높이',
    Boolean(startBox) && startBox.x >= 0 && startBox.x + startBox.width <= 360 && Math.round(startBox.height) === 56,
    JSON.stringify(startBox),
  )
  await homeworkStart.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${shotDir}/sunogong-home-homework-start-only-360.png` })

  /* ── 2) 숙제 공부 시작 → 숙제 타이머 ─────────────────────────────────── */
  await homeworkStart.click()
  await page.waitForTimeout(1500)
  check('숙제 공부 시작 → 숙제 타이머', (await text(page)).includes('숙제 공부는 화면을 끄거나 나가면 멈춰요'))
  await page.getByRole('button', { name: '홈으로' }).first().click().catch(() => {})
  await page.waitForTimeout(800)
  await run(supabase.from('study_sessions').delete().eq('student_id', student.id))

  /* ── 3) 출훈이 시작한 학원 세션은 예전처럼 이어 보인다 ───────────────── */
  const session = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'academy' }))
  await run(
    supabase
      .from('study_sessions')
      .update({
        started_at: new Date(Date.now() - 25 * 60_000).toISOString(),
        last_heartbeat_at: new Date().toISOString(),
      })
      .eq('id', session.id),
  )
  await enter()
  check('학원 세션: 선오공 타이머로 이어짐(그대로 유지)', (await text(page)).includes('학원 공부는 화면이 꺼져도 계속 가요'))

  /* ── 4) 학원 공부 종료 → 결과 화면에 '공부 더 하기' 없음 ─────────────── */
  await page.getByRole('button', { name: '종료', exact: true }).click()
  await page.getByRole('button', { name: '마칠래요' }).click()
  const problemModal = page.getByRole('dialog', { name: '오늘 푼 문제 수' })
  await problemModal.waitFor({ state: 'visible', timeout: 8000 })
  await problemModal.getByRole('button', { name: '5', exact: true }).click()
  await problemModal.getByRole('button', { name: '저장', exact: true }).click()
  await page.waitForTimeout(1800)
  const resultText = await text(page)
  check('결과 화면: 학원 공부 결과로 넘어감', resultText.includes('학원 공부') && resultText.includes('푼 문제'), resultText.slice(0, 200))
  check('결과 화면: 공부 더 하기 없음', !resultText.includes('공부 더 하기'), resultText.slice(0, 260))
  check('결과 화면: 홈으로 버튼은 그대로', await page.getByRole('button', { name: '홈으로' }).first().isVisible())
  await page.screenshot({ path: `${shotDir}/sunogong-academy-result-no-again-360.png` })

  const log = await run(supabase.from('study_logs').select('*').eq('student_id', student.id).maybeSingle())
  check('DB: 학원 25분·5문제 기록에 들어감', log?.academy_minutes === 25 && log?.academy_problems === 5, `${log?.academy_minutes}/${log?.academy_problems}`)
} finally {
  if (browser) await browser.close().catch(() => {})
  await supabase.from('homework_submissions').delete().eq('student_id', student.id)
  await supabase.from('study_sessions').delete().eq('student_id', student.id)
  await supabase.from('study_logs').delete().eq('student_id', student.id)
  await supabase.from('students').delete().eq('id', student.id)
}

const left = await run(supabase.from('students').select('id').eq('id', student.id))
check('검증용 학생 정리됨', (left ?? []).length === 0, left?.length)

console.log(failed === 0 ? 'ALL CHECKS PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
