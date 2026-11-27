/**
 * 「학파 숙빨」 색 통일 · 관리자 탭 이름/순서 · 관리자 「푼 숙제 N개」 — 실서비스 화면 확인 (360px, 개발용)
 *   node tools/check-kind-colors.mjs [url] [스크린샷 폴더]
 *
 * 확인하는 것
 *   · 학생 홈 `🏠 숙제 공부 시작` 버튼이 빨강(#E0453E → rgb(224, 69, 62)), 56px
 *   · 숙제 타이머의 `🏠 숙제 공부` 배지·`숙제 공부는 화면을 끄거나 나가면 멈춰요` 줄이 빨강
 *   · 관리자 첫 화면이 `실시간`, 탭 순서가 실시간 → 공부기록 → 숙제관리 → 질문함 → 랭킹
 *   · 관리자 `공부기록` 탭의 요약 카드가 `푼 숙제 N개`(「문제 N개」 없음)이고 구분 스위치 학원은 파랑·숙제는 빨강
 *   · 360px 에서 잘리지 않음 + 스크린샷
 * 검증용 학생·세션·기록은 끝나고 지운다.
 */
/* 헤드리스 크롬이 쓰는 라이브러리(이 환경에는 시스템에 없음) */
process.env.LD_LIBRARY_PATH = ['/workspace/work/.tools/chromelibs', process.env.LD_LIBRARY_PATH]
  .filter(Boolean)
  .join(':')

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

/** 화면에서 잰 색 — rgb(...) 문자열 */
const RED = 'rgb(224, 69, 62)'
const RED_SOFT = 'rgb(255, 241, 240)'
const RED_TEXT = 'rgb(217, 56, 47)'
const BLUE = 'rgb(29, 74, 155)'

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
  supabase.from('students').insert({ name: '검증색', code, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id}`)

let browser = null
try {
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
  const bodyText = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ')

  /* ── 1) 학생 홈 — 숙제 공부 시작 버튼 빨강 ───────────────────────── */
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  for (const digit of code) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
  await page.getByRole('button', { name: '확인', exact: true }).click()
  await page.waitForTimeout(1500)

  const startButton = page.getByRole('button', { name: /숙제 공부 시작/ }).first()
  check('학생 홈: 숙제 공부 시작 버튼 있음', await startButton.isVisible())
  const startStyle = await startButton.evaluate((node) => {
    const style = getComputedStyle(node)
    return { bg: style.backgroundColor, height: Math.round(node.getBoundingClientRect().height), width: Math.round(node.getBoundingClientRect().width) }
  })
  check('학생 홈: 숙제 버튼 빨강', startStyle.bg === RED, JSON.stringify(startStyle))
  check('학생 홈: 숙제 버튼 56px·360px 안', startStyle.height === 56 && startStyle.width <= 360, JSON.stringify(startStyle))
  await startButton.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${shotDir}/sunogong-kind-colors-home-360.png` })

  /* ── 2) 숙제 타이머 — 배지·안내 줄 빨강 ────────────────────────── */
  await startButton.click()
  await page.waitForTimeout(1800)
  const timerText = await bodyText()
  check('숙제 타이머: 안내 문구', timerText.includes('숙제 공부는 화면을 끄거나 나가면 멈춰요'))
  const badge = page.locator('span', { hasText: /^🏠 숙제 공부$/ }).first()
  const badgeStyle = await badge.evaluate((node) => {
    const style = getComputedStyle(node)
    return { bg: style.backgroundColor, color: style.color }
  })
  check('숙제 타이머: 배지 연한 빨강·빨강 글자', badgeStyle.bg === RED_SOFT && badgeStyle.color === RED_TEXT, JSON.stringify(badgeStyle))
  const notice = page.getByText('📵 숙제 공부는 화면을 끄거나 나가면 멈춰요', { exact: false }).first()
  const noticeStyle = await notice.evaluate((node) => getComputedStyle(node).backgroundColor)
  check('숙제 타이머: 안내 줄 빨강', noticeStyle === RED, noticeStyle)
  await page.screenshot({ path: `${shotDir}/sunogong-kind-colors-timer-360.png` })

  /* 세션 정리 — 승인 대기 제출까지 지운다 */
  const opened = await run(
    supabase.from('study_sessions').select('id').eq('student_id', student.id).is('ended_at', null).maybeSingle(),
  )
  if (opened?.id) await run(supabase.rpc('admin_end_study_session', { p_session_id: opened.id, p_problems: 0 }))
  await run(supabase.from('homework_submissions').delete().eq('student_id', student.id))

  /* ── 3) 관리자 — 첫 탭 실시간 · 탭 순서 ─────────────────────────── */
  await page.evaluate(() => localStorage.clear()).catch(() => {})
  await page.goto(`${base}/admin`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  if (await page.getByLabel('관리자 비밀번호').isVisible().catch(() => false)) {
    await page.getByLabel('관리자 비밀번호').fill(adminPassword)
    await page.getByRole('button', { name: '입장' }).click()
    await page.waitForTimeout(1200)
  }
  const tabLabels = await page.locator('header nav button').evaluateAll((nodes) =>
    nodes.map((node) => (node.textContent ?? '').trim().replace(/[0-9]+$/, '').trim()),
  )
  check(
    '관리자 탭 순서: 실시간 → 공부기록 → 숙제관리 → 질문함 → 랭킹',
    tabLabels.slice(0, 5).join(',') === '실시간,공부기록,숙제관리,질문함,랭킹',
    tabLabels.join(','),
  )
  check('관리자 첫 화면: 실시간 탭', (await page.locator('main').innerText()).includes('지금 공부 중'))
  check('관리자: 「대시보드」 탭 이름 없음', !(await page.locator('header nav').innerText()).includes('대시보드'))
  await page.screenshot({ path: `${shotDir}/sunogong-admin-first-tab-live-360.png` })

  /* ── 4) 공부기록 — 요약 카드 「푼 숙제 N개」·구분 스위치 색 ───────── */
  await page.getByRole('button', { name: /^공부기록$/ }).first().click()
  await page.waitForTimeout(1500)
  const dashText = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  check('공부기록: 요약 카드 「푼 숙제 N개」', /푼 숙제 \d+개/.test(dashText), dashText.slice(0, 200))
  check('공부기록: 「문제 N개」 표기 없음', !/문제 \d+개/.test(dashText) && !dashText.includes('푼 문제'))
  const scope = page.getByRole('group', { name: '통계 구분' })
  const academyChip = scope.getByRole('button', { name: '🏫 학원 공부' })
  await academyChip.click()
  await page.waitForTimeout(600)
  check(
    '구분 스위치: 학원 파랑',
    (await academyChip.evaluate((node) => getComputedStyle(node).backgroundColor)) === BLUE,
    await academyChip.evaluate((node) => getComputedStyle(node).backgroundColor),
  )
  const homeworkChip = scope.getByRole('button', { name: '🏠 숙제 공부' })
  await homeworkChip.click()
  await page.waitForTimeout(600)
  check(
    '구분 스위치: 숙제 빨강',
    (await homeworkChip.evaluate((node) => getComputedStyle(node).backgroundColor)) === RED,
    await homeworkChip.evaluate((node) => getComputedStyle(node).backgroundColor),
  )
  const dashBox = await page.locator('main').boundingBox()
  check('공부기록: 360px 안에서 잘리지 않음', Boolean(dashBox) && dashBox.x >= 0 && dashBox.x + dashBox.width <= 360, JSON.stringify(dashBox))
  await page.getByText('공부기록 달력', { exact: true }).scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${shotDir}/sunogong-admin-kind-colors-dashboard-360.png` })
} finally {
  if (browser) await browser.close().catch(() => {})
  await supabase.from('homework_submissions').delete().eq('student_id', student.id)
  await supabase.from('study_sessions').delete().eq('student_id', student.id)
  await supabase.from('study_logs').delete().eq('student_id', student.id)
  await supabase.from('students').delete().eq('id', student.id)
}

const left = await run(supabase.from('students').select('id').eq('id', student.id))
check('검증용 학생 정리됨', (left ?? []).length === 0, left?.length)

console.log(failed === 0 ? 'ALL KIND COLOR CHECKS PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
