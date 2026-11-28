/**
 * 선생님 답변이 도착하면 학생 홈 맨 위에 바로 알림 배너 — 실서비스 확인 (360px, 개발용)
 *   node tools/check-answer-banner.mjs [url] [screenshot-dir]
 * 확인하는 것
 *   · 답변 대기 질문만 있으면 배너가 뜨지 않는다
 *   · 답변이 달리면 로그인(코드 입력) 직후 홈 맨 위(오늘 공부 카드보다 위)에 배너
 *       💬 선생님 답변이 도착했어요! + 어떤 질문인지 한 줄 + [답변 보기] [확인했어요]
 *   · [답변 보기] → 질문 화면에서 그 질문 카드로 내려가 강조되고 답변이 보인다
 *   · 돌아오면 배너가 사라지고, 다시 로그인해도 뜨지 않는다 (student_read_at)
 *   · [확인했어요] 로 닫아도 읽음으로 남아 다음 로그인에 뜨지 않는다
 *   · 두 개가 쌓이면 '새 답변 2개' 로 보인다
 * 검증용 학생·질문은 끝나고 지운다 (실제 학생 데이터는 건드리지 않는다).
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

const STUDENT_NAME = '검증답변'
const code = String(Math.floor(1000 + Math.random() * 8999))
const student = await run(
  supabase.from('students').insert({ name: STUDENT_NAME, code, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id}`)

/** 질문 한 건 (답변은 선택) — 사진 파일은 만들지 않고 경로만 둔다 */
const addQuestion = async ({ memo, answer = null, answeredAt = null }) =>
  run(
    supabase
      .from('study_questions')
      .insert({
        student_id: student.id,
        memo,
        image_path: `verify/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`,
        answer,
        answered_at: answeredAt,
      })
      .select('*')
      .single(),
  )

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
  const banner = page.locator('[data-answer-banner="true"]')

  /* ── 0) 답변 대기만 있으면 배너 없음 ─────────────────────────────── */
  const waiting = await addQuestion({ memo: '아직 답이 없는 질문' })
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })
  await enterCode(page)
  check('0 답변 대기만 있으면 배너 없음', (await banner.count()) === 0)

  /* ── 1) 답변이 달리면 로그인 직후 맨 위에 배너 ──────────────────── */
  const answered = await addQuestion({
    memo: '3번에서 막혔어요',
    answer: '통분해서 분모를 맞추면 돼요',
    answeredAt: new Date().toISOString(),
  })
  await enterCode(page)
  await banner.first().waitFor({ state: 'visible', timeout: 8000 })
  const bannerText = (await banner.first().innerText()).replace(/\s+/g, ' ')
  check('1 배너: 제목', bannerText.includes('선생님 답변이 도착했어요!'), bannerText.slice(0, 120))
  check('1 배너: 어떤 질문인지', bannerText.includes('3번에서 막혔어요') && bannerText.includes('질문에 답변이 달렸어요'))
  check('1 배너: 답변 보기·확인했어요 버튼', bannerText.includes('답변 보기') && bannerText.includes('확인했어요'))
  check('1 배너: 답변 대기 질문은 안내하지 않음', !bannerText.includes('아직 답이 없는 질문'))

  /* 오늘 공부 카드보다 위에 있다 */
  const bannerBox = await banner.first().boundingBox()
  const todayBox = await page.getByText('오늘 공부한 시간').first().boundingBox()
  check(
    '1 배너: 오늘 공부 카드보다 위',
    Boolean(bannerBox && todayBox && bannerBox.y < todayBox.y),
    `배너 y=${Math.round(bannerBox?.y ?? -1)}, 카드 y=${Math.round(todayBox?.y ?? -1)}`,
  )
  check('1 배너: 360px 안에 들어옴', Boolean(bannerBox && bannerBox.x >= 0 && bannerBox.x + bannerBox.width <= 360))
  await page.screenshot({ path: `${shotDir}/sunogong-answer-banner-360.png`, fullPage: false })

  /* ── 2) 답변 보기 → 그 질문으로 내려가 강조·답변 표시 ───────────── */
  await banner.first().getByRole('button', { name: '답변 보기' }).click()
  await page.waitForTimeout(1200)
  const boardText = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  check('2 질문 화면으로 이동', boardText.includes('선오공에게 질문하기') && boardText.includes('내 질문'))
  check('2 답변 글이 보임', boardText.includes('통분해서 분모를 맞추면 돼요'))
  const focused = page.locator('[data-focus-question="true"]')
  check('2 그 질문 카드가 강조됨', (await focused.count()) === 1)
  if ((await focused.count()) === 1) {
    const focusText = (await focused.innerText()).replace(/\s+/g, ' ')
    check('2 강조된 카드가 내 질문', focusText.includes('3번에서 막혔어요'))
    const scrolled = await page.evaluate(() => window.scrollY)
    check('2 그 질문으로 내려감(스크롤)', scrolled > 40, `scrollY=${scrolled}`)
  }
  await page.screenshot({ path: `${shotDir}/sunogong-answer-banner-question-360.png`, fullPage: false })

  /* 읽음 반영 — DB student_read_at */
  await page.waitForTimeout(600)
  const readRow = await run(supabase.from('study_questions').select('*').eq('id', answered.id).single())
  check('2 읽음으로 남음(student_read_at)', Boolean(readRow.student_read_at), readRow.student_read_at)
  const waitingRow = await run(supabase.from('study_questions').select('*').eq('id', waiting.id).single())
  check('2 답변 대기 질문은 그대로', waitingRow.student_read_at === null && waitingRow.answer === null)

  /* ── 3) 홈으로 돌아오면 배너가 사라지고, 다시 로그인해도 안 뜬다 ── */
  await page.getByRole('button', { name: '뒤로' }).first().click()
  await page.waitForTimeout(1200)
  check('3 홈으로 돌아오면 배너 없음', (await banner.count()) === 0)
  await enterCode(page)
  check('3 다시 로그인해도 배너 없음', (await banner.count()) === 0)

  /* ── 4) 두 개가 쌓이면 '새 답변 2개' ─────────────────────────────── */
  const second = await addQuestion({
    memo: '5번도 봐주세요',
    answer: '먼저 그래프를 그려 보세요',
    answeredAt: new Date(Date.now() + 1000).toISOString(),
  })
  const third = await addQuestion({
    memo: '7번이 어려워요',
    answer: '닮음비를 써 보세요',
    answeredAt: new Date(Date.now() + 2000).toISOString(),
  })
  await enterCode(page)
  await banner.first().waitFor({ state: 'visible', timeout: 8000 })
  const twoText = (await banner.first().innerText()).replace(/\s+/g, ' ')
  check('4 배너: 새 답변 2개', twoText.includes('새 답변 2개'), twoText.slice(0, 120))
  check('4 배너: 가장 최근 답변 질문', twoText.includes('7번이 어려워요'))
  await page.screenshot({ path: `${shotDir}/sunogong-answer-banner-two-360.png`, fullPage: false })

  /* ── 5) 확인했어요 → 닫히고 읽음으로 남아 다음 로그인에 안 뜬다 ── */
  await banner.first().getByRole('button', { name: '확인했어요' }).click()
  await page.waitForTimeout(600)
  check('5 확인했어요: 배너 닫힘', (await banner.count()) === 0)
  const readSecond = await run(supabase.from('study_questions').select('*').eq('id', second.id).single())
  const readThird = await run(supabase.from('study_questions').select('*').eq('id', third.id).single())
  check('5 확인했어요: 두 답변 모두 읽음', Boolean(readSecond.student_read_at) && Boolean(readThird.student_read_at))
  await enterCode(page)
  check('5 다시 로그인해도 배너 없음', (await banner.count()) === 0)

  /* 홈의 질문하기 카드 배지도 0 (새 답변 없음) */
  const homeText = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  check('5 홈 질문 카드에 새 답변 배지 없음', !homeText.includes('새 답변'))
} finally {
  if (browser) await browser.close().catch(() => {})
  /* 검증 데이터 정리 — 남은 0건 */
  await supabase.from('study_questions').delete().eq('student_id', student.id)
  await supabase.from('students').delete().eq('id', student.id)
  const leftQuestions = await run(supabase.from('study_questions').select('id').eq('student_id', student.id))
  const leftStudent = await run(supabase.from('students').select('id').eq('id', student.id))
  console.log(`정리: 학생 ${leftStudent.length} · 질문 ${leftQuestions.length}`)
  if (leftQuestions.length || leftStudent.length) failed += 1
  console.log(failed === 0 ? 'ALL ANSWER BANNER CHECKS PASSED' : `${failed} FAILED`)
  process.exit(failed === 0 ? 0 : 1)
}
