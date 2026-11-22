/**
 * 배포된 학생 화면에서 사탕교환권 성구 2개를 직접 골라 바꾸는지 확인 (개발용)
 *   PW_CHROME=... node tools/e2e-candy-pick-ui.mjs
 *
 * 검증용 학생을 만들어(3성구 2개·5성구 3개·1성구 1개)
 *   ① 버튼 누르면 성구 고르기 창이 뜬다
 *   ② 3성구 2개를 골라 '사탕교환권으로 바꾸기' → DB 에서 정확히 차감·지급
 *   ③ 다시 열어 1성구 + 5성구로 바꾼다
 *   ④ 가지고 없는 성구는 못 고른다(비활성)
 *   ⑤ 고른 칸을 누르면 하나가 빠진다
 * 360px 폰 화면 스크린샷을 남기고, 검증용 학생은 끝나고 지운다.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import pw from '/workspace/tmp/pw/node_modules/playwright/index.js'

const { chromium } = pw
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].trim()]),
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const run = async (promise) => {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  return data
}

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-P613) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.46'

let failed = 0
const check = (name, ok, detail) => {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
}

/* 1성구 1 · 3성구 2 · 5성구 3 = 6개 */
const student = await run(
  supabase
    .from('students')
    .insert({
      name: '검증사탕화면',
      code: String(Math.floor(1000 + Math.random() * 8999)),
      grade: '검증',
      dragonballs: { '1': 1, '2': 0, '3': 2, '4': 0, '5': 3, '6': 0, '7': 0 },
      dragonball_count: 6,
    })
    .select('id,code')
    .single(),
)
console.log(`검증용 학생 ${student.code} ${student.id}`)

const ballSum = (map) => Object.values(map ?? {}).reduce((sum, value) => sum + Number(value || 0), 0)

const browser = await chromium.launch({
  executablePath:
    process.env.PW_CHROME ?? '/workspace/tmp/pw/browsers/chromium_headless_shell-1148/chrome-linux/headless_shell',
  args: ['--no-sandbox'],
})
try {
  const context = await browser.newContext({
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: ANDROID_UA,
  })
  const page = await context.newPage()
  await page.goto('https://sunogong.vercel.app/', { waitUntil: 'networkidle' })

  /* 코드 입력 → 학생 선택 */
  for (const digit of student.code) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
  await page.getByRole('button', { name: '확인' }).click()
  /* 같은 코드를 쓰는 학생이 있으면 이름 고르기 화면이 먼저 나온다 */
  const choose = page.getByRole('button', { name: /검증사탕화면/ })
  try {
    await choose.waitFor({ timeout: 4000 })
    await choose.click()
  } catch {
    /* 바로 홈으로 들어갔다 */
  }
  await page.waitForTimeout(3000)

  const card = page.locator('section', { hasText: '내 드래곤볼' }).first()
  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  const candyButton = page.getByRole('button', { name: /사탕교환권/ }).first()
  check('홈: 사탕교환권 버튼이 있다', await candyButton.isVisible())

  /* ① 창이 열린다 */
  await candyButton.click()
  await page.getByRole('dialog', { name: '사탕교환권으로 바꾸기' }).waitFor({ timeout: 5000 })
  check('창: 성구 고르기 창이 열린다', true)
  const dialog = page.getByRole('dialog', { name: '사탕교환권으로 바꾸기' })

  /* ④ 가지고 없는 성구는 비활성 */
  const disabledTwo = dialog.getByRole('button', { name: /2성구 고르기/ })
  check('창: 없는 2성구는 못 고른다', (await disabledTwo.count()) > 0 && (await disabledTwo.getAttribute('disabled') !== null))

  /* ⑤ 하나 고른 뒤 그 칸을 눌러 빼기 */
  await dialog.getByRole('button', { name: /5성구 고르기/ }).first().click()
  check('창: 하나 고르면 1개 더 고르세요', await dialog.getByText('1개 더 고르세요').isVisible())
  await page.locator('button', { hasText: '5성구' }).first().click() /* 위의 고른 칸 — 빼기 */
  check('창: 빼면 다시 2개 더 고르세요', await dialog.getByText('2개 더 고르세요').isVisible())

  /* ② 같은 성구 2개 — 3성구 2개 */
  await dialog.getByRole('button', { name: /3성구 고르기/ }).click()
  await dialog.getByRole('button', { name: /3성구 고르기/ }).click()
  check('창: 같은 성구 2개도 다 골라진다', await dialog.getByText('2개를 다 골랐어요').isVisible())
  const submit = dialog.getByRole('button', { name: '사탕교환권으로 바꾸기' })
  await submit.click()
  await page.waitForTimeout(2000)
  check('교환: 완료 안내가 뜬다', await page.getByText('3성구 · 3성구 → 사탕교환권 1장으로 바꿨어요!').isVisible())

  const after1 = await run(supabase.from('students').select('dragonballs,dragonball_count,candy_tickets').eq('id', student.id).single())
  check('DB: 3성구 0개 · 5성구 3개 유지', after1?.dragonballs?.['3'] === 0 && after1?.dragonballs?.['5'] === 3, after1?.dragonballs)
  check('DB: 총 4개 · 교환권 1장', after1?.dragonball_count === 4 && ballSum(after1?.dragonballs) === 4 && after1?.candy_tickets === 1, after1)

  /* ③ 서로 다른 성구 2개 — 1성구 + 5성구 */
  await page.getByRole('button', { name: /사탕교환권/ }).first().click()
  await page.getByRole('dialog', { name: '사탕교환권으로 바꾸기' }).waitFor({ timeout: 5000 })
  const dialog2 = page.getByRole('dialog', { name: '사탕교환권으로 바꾸기' })
  await dialog2.getByRole('button', { name: /5성구 고르기/ }).first().click()
  await dialog2.getByRole('button', { name: /1성구 고르기/ }).click()
  check('창: 서로 다른 성구 2개도 된다', await dialog2.getByText('2개를 다 골랐어요').isVisible())
  await dialog2.getByRole('button', { name: '사탕교환권으로 바꾸기' }).click()
  await page.waitForTimeout(2000)
  await page.waitForTimeout(2500)
  const text2 = await page.evaluate(() => document.body.innerText)
  check('교환: 서로 다른 성구 2개 안내', /5성구 · 1성구 → 사탕교환권 1장으로 바꿨어요!/.test(text2), text2.split('\n').filter((line) => line.includes('사탕교환권')).join(' | '))

  const after2 = await run(supabase.from('students').select('dragonballs,dragonball_count,candy_tickets').eq('id', student.id).single())
  check('DB: 1성구 0개 · 5성구 2개', after2?.dragonballs?.['1'] === 0 && after2?.dragonballs?.['5'] === 2, after2?.dragonballs)
  check('DB: 총 2개 · 교환권 2장', after2?.dragonball_count === 2 && after2?.candy_tickets === 2, after2)

  /* 360px 스크린샷 — 홈(성구 도감·교환권 2장) */
  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  await card.screenshot({ path: '/workspace/browser/sunogong-student-candy-pick-360.png' })
  const homeText = await page.evaluate(() => document.body.innerText)
  check('홈: 사탕교환권 2장 표시', homeText.includes('사탕') && /2장/.test(homeText), homeText.slice(0, 80))

  await context.close()
} finally {
  await browser.close()
  const removed = await supabase.from('students').delete().eq('id', student.id)
  if (removed.error) console.log('검증용 학생 삭제 실패:', removed.error.message)
  const left = await run(supabase.from('students').select('id').eq('id', student.id))
  check('정리: 남은 검증용 학생 0명', left.length === 0, left)
}

console.log(failed === 0 ? '\nALL CANDY PICK UI CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`)
process.exit(failed === 0 ? 0 : 1)
