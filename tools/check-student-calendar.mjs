/**
 * 학생 「공부 기록」 달력 — 실서비스 화면 확인 (360px, 개발용, 2026-11-28)
 *   node tools/check-student-calendar.mjs [url] [스크린샷 폴더] [--code=9374] [--shot=이름]
 *
 * 확인하는 것
 *   · `공부 기록` 카드 안에 달력(요일·날짜 칸·학원 파랑/숙제 빨강 점)과 고른 날 상세가 그려진다
 *   · 날짜를 누르면 그날 `총 N시간 N분` · `푼 문제 N개` · 등·하원 한 줄이 바뀐다
 *   · 기록 없는 날은 `이 날은 등·하원도 공부 기록도 없어요`
 *   · 이전 달로 넘어가고, 이번 달에서 `›`(다음 달)는 잠겨 있다
 *   · 360px 에서 가로로 넘치지 않는다 · 스크린샷 저장
 *
 * 두 가지 방식
 *   1) 그냥 실행            — 검증용 학생(ZZ검증달력)을 만들고 study_logs 만 넣어 확인한 뒤 지운다
 *                              (등·하원은 훈출 출결 표라 anon 키로 못 넣는다 → 아래 2번)
 *   2) --code=실제학생코드  — 이미 출결이 있는 학생으로 열어 등·하원·자동 마감 문구를 확인한다(읽기만, 지우지 않음)
 */
/* 헤드리스 크롬이 쓰는 라이브러리(이 환경에는 시스템에 없음) */
process.env.LD_LIBRARY_PATH = ['/workspace/work/.tools/chromelibs', process.env.LD_LIBRARY_PATH]
  .filter(Boolean)
  .join(':')

import pw from '/workspace/tmp/pw/node_modules/playwright/index.js'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const { chromium } = pw
const argv = process.argv.slice(2)
const positional = argv.filter((arg) => !arg.startsWith('--'))
const options = Object.fromEntries(
  argv
    .filter((arg) => arg.startsWith('--'))
    .map((arg) => {
      const [key, value] = arg.replace(/^--/, '').split('=')
      return [key, value ?? '']
    }),
)
const base = (positional[0] ?? 'https://sunogong.vercel.app').replace(/\/$/, '')
const shotDir = (positional[1] ?? '/workspace/downloads').replace(/\/$/, '')
const realCode = options.code ?? ''
const shotName = options.shot ?? (realCode ? 'sunogong-student-calendar-live' : 'sunogong-student-calendar-check')

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

/* 한국 시간 기준 오늘/이번 달 */
const kst = new Date(Date.now() + 9 * 3600_000)
const today = kst.toISOString().slice(0, 10)
const thisMonth = today.slice(0, 7)
const monthNumber = Number(thisMonth.slice(5, 7))
const prevMonthNumber = monthNumber === 1 ? 12 : monthNumber - 1
const prevMonthYear = monthNumber === 1 ? Number(thisMonth.slice(0, 4)) - 1 : Number(thisMonth.slice(0, 4))
const dayText = (offset) => {
  const d = new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400_000)
  return d.toISOString().slice(0, 10)
}
const koLabel = (date) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`

let student = null
if (realCode) {
  const rows = await run(supabase.from('students').select('id,name,code,grade').eq('code', realCode).limit(1))
  student = rows?.[0] ?? null
  if (!student) {
    console.log(`FAIL --code=${realCode} 학생을 찾지 못했어요`)
    process.exit(1)
  }
  console.log(`실제 학생 ${student.name} (${student.code}) — 읽기만 합니다`)
} else {
  const code = String(Math.floor(1000 + Math.random() * 8999))
  student = await run(
    supabase.from('students').insert({ name: 'ZZ검증달력', code, grade: '검증' }).select('id,name,code').single(),
  )
  console.log(`검증용 학생 ${student.name} (${student.code}) ${student.id}`)
  /* 오늘 — 학원 131분·43개 + 숙제 40분·6개 (시안의 11/27 김도혁 값) */
  const days = [
    { date: today, academy: [131, 43], homework: [40, 6] },
    { date: dayText(-1), academy: [90, 30], homework: [0, 0] },
    { date: dayText(-4), academy: [0, 0], homework: [45, 15] },
  ]
  for (const day of days) {
    await run(
      supabase.from('study_logs').insert({
        student_id: student.id,
        date: day.date,
        minutes: day.academy[0] + day.homework[0],
        problems: day.academy[1] + day.homework[1],
        academy_minutes: day.academy[0],
        academy_problems: day.academy[1],
        homework_minutes: day.homework[0],
        homework_problems: day.homework[1],
      }),
    )
  }
  console.log(`검증용 기록 3일 (${days.map((d) => d.date).join(', ')})`)
}

let browser = null
try {
  browser = await chromium.launch({
    executablePath:
      process.env.PW_CHROME ?? '/workspace/tmp/pw/browsers/chromium_headless_shell-1148/chrome-linux/headless_shell',
    args: ['--no-sandbox'],
  })
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; SM-P613) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  for (const digit of String(student.code)) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
  await page.getByRole('button', { name: '확인', exact: true }).click()
  await page.waitForTimeout(1800)

  /* 실제 학생은 「지난번 푼 문제 수」 창이 먼저 뜰 수 있다 — 건너뛰기(기록은 그대로)로 닫는다 */
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const skip = page.getByRole('button', { name: '건너뛰기' }).first()
    if (!(await skip.isVisible().catch(() => false))) break
    await skip.click()
    await page.waitForTimeout(800)
  }

  /* 공부 기록 카드 — 제목으로 카드를 찾는다 */
  const card = page.locator('section.card', { hasText: '공부 기록' }).first()
  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1200)
  const cardText = (await card.innerText()).replace(/\s+/g, ' ')
  const detailText = async () =>
    (await card.locator('div.rounded-2xl.border').last().innerText()).replace(/\s+/g, ' ')
  const gridcells = card.getByRole('gridcell')

  check('달력: 카드 안에 이번 달 이름', cardText.includes(`${thisMonth.slice(0, 4)}년 ${monthNumber}월`), cardText.slice(0, 80))
  check('달력: 요일 머리 (일~토)', ['일', '월', '화', '수', '목', '금', '토'].every((label) => cardText.includes(label)))
  check('달력: 범례 학원·숙제', cardText.includes('학원 공부') && cardText.includes('숙제 공부'))
  check('달력: 날짜 칸 7의 배수', (await gridcells.count()) % 7 === 0, `${await gridcells.count()}칸`)

  if (!realCode) {
    /* 오늘 — 학원 2시간 11분 + 숙제 40분 = 2시간 51분 */
    const todayCell = card.getByRole('gridcell', { name: new RegExp(`^${koLabel(today)}`) })
    await todayCell.click()
    await page.waitForTimeout(500)
    let detail = await detailText()
    check('상세: 오늘 총 시간', detail.includes('총 2시간 51분'), detail)
    check('상세: 오늘 학원·숙제 시간', detail.includes('2시간 11분') && detail.includes('40분'), detail)
    check('상세: 오늘 푼 문제 43개·6개', detail.includes('43개') && detail.includes('6개'), detail)
    check('상세: 등·하원 표 없으면 안내', detail.includes('등·하원 기록 없음'), detail)
    check('달력: 오늘 칸에 학원·숙제 점 2개', (await todayCell.locator('i').count()) === 2, `${await todayCell.locator('i').count()}개`)

    /* 하루 전 — 학원만 */
    const prevCell = card.getByRole('gridcell', { name: new RegExp(`^${koLabel(dayText(-1))}`) })
    await prevCell.click()
    await page.waitForTimeout(400)
    detail = await detailText()
    check('상세: 다른 날을 누르면 그날 값', detail.includes('1시간 30분') && detail.includes('30개'), detail)

    /* 기록 없는 날 (4일 전·오늘 사이에서 study_logs 없는 날) */
    const emptyDate = dayText(-2)
    const emptyCell = card.getByRole('gridcell', { name: new RegExp(`^${koLabel(emptyDate)}`) })
    await emptyCell.click()
    await page.waitForTimeout(400)
    detail = await detailText()
    check('상세: 기록 없는 날 안내', detail.includes('이 날은 등·하원도 공부 기록도 없어요'), detail)
    check('달력: 기록 없는 칸에는 점 없음', (await emptyCell.locator('i').count()) === 0)

    /* 달 이동 */
    await card.getByRole('button', { name: '이전 달' }).click()
    await page.waitForTimeout(900)
    const prevMonthText = (await card.innerText()).replace(/\s+/g, ' ')
    check(
      `달력: 이전 달로 이동 (${prevMonthYear}년 ${prevMonthNumber}월)`,
      prevMonthText.includes(`${prevMonthYear}년 ${prevMonthNumber}월`),
      prevMonthText.slice(0, 80),
    )
    check('달력: 이번 달에서 「다음 달」은 잠김', (await card.getByRole('button', { name: '이전 달' }).isEnabled()) === true)
    await card.getByRole('button', { name: '다음 달' }).click()
    await page.waitForTimeout(900)
    check(
      '달력: 이번 달로 돌아오기',
      (await card.innerText()).includes(`${thisMonth.slice(0, 4)}년 ${monthNumber}월`),
    )
    check(
      '달력: 이번 달에서는 다음 달 버튼이 잠김',
      await card.getByRole('button', { name: '다음 달' }).isDisabled(),
    )
  } else {
    /* 실제 학생 — 달의 날짜를 하나씩 눌러 등·하원 문구를 모은다 */
    const lines = []
    const total = await gridcells.count()
    for (let index = 0; index < total; index += 1) {
      const cell = gridcells.nth(index)
      if (await cell.isDisabled()) continue
      const label = (await cell.getAttribute('aria-label')) ?? ''
      const monthMatch = label.match(/^(\d{1,2})월 (\d{1,2})일/)
      if (!monthMatch || Number(monthMatch[1]) !== monthNumber) continue
      await cell.click()
      await page.waitForTimeout(120)
      lines.push(`${monthMatch[2]}일: ${await detailText()}`)
    }
    const joined = lines.join(' | ')
    const dotCount = await gridcells.locator('i').count()
    check('실제: 달력에 학원·숙제 점이 있음', dotCount > 0, `${dotCount}개`)
    check('실제: 등원 ~ 하원 시각이 보이는 날 있음', /등원 ~ \d\d:\d\d 하원/.test(joined), joined.slice(0, 200))
    const autoDay = lines.find((line) => line.includes('하원 미확인(자동 마감)'))
    check('실제: 자동 마감 안내', Boolean(autoDay), autoDay ?? '')
    check('실제: 등·하원 없는 날 안내', joined.includes('등·하원 기록 없음'))
    if (autoDay) {
      const dayNumber = Number(autoDay.slice(0, autoDay.indexOf('일')))
      const autoCell = card.getByRole('gridcell', { name: new RegExp(`^${monthNumber}월 ${dayNumber}일`) })
      await autoCell.click()
      await page.waitForTimeout(400)
    }
  }

  /* 360px 가로 넘침 */
  const cardBox = await card.boundingBox()
  check('360px: 카드가 화면 안', Boolean(cardBox) && cardBox.x >= 0 && cardBox.x + cardBox.width <= 360, JSON.stringify(cardBox))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check('360px: 가로 스크롤 없음', overflow <= 1, `${overflow}px`)

  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await card.screenshot({ path: `${shotDir}/${shotName}-card-360.png` })
  await page.screenshot({ path: `${shotDir}/${shotName}-360.png` })
  console.log(`스크린샷: ${shotDir}/${shotName}-card-360.png · ${shotDir}/${shotName}-360.png`)
} catch (error) {
  failed += 1
  console.log(`FAIL 실행: ${error instanceof Error ? error.message : String(error)}`)
} finally {
  if (browser) await browser.close().catch(() => {})
  /* 검증용 학생은 지운다(기록·세션 함께). 실제 학생(--code)은 손대지 않는다 */
  if (!realCode && student?.id) {
    await supabase.from('study_sessions').delete().eq('student_id', student.id)
    const { error } = await supabase.from('students').delete().eq('id', student.id)
    const left = await supabase.from('students').select('id').eq('id', student.id)
    console.log(`검증용 학생 정리: ${error ? `FAIL ${error.message}` : '삭제 요청 완료'} · 남은 행 ${left.data?.length ?? '?'}건`)
    if (error || (left.data?.length ?? 0) > 0) failed += 1
  }
}

console.log(failed === 0 ? 'ALL STUDENT CALENDAR CHECKS PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
