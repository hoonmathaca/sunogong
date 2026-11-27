/**
 * 관리자 공부기록 달력 · 날짜 상세 일괄 드래곤볼 · 두 선 꺾은선 · 「푼 숙제」 — 화면 확인 (개발용)
 *   node tools/check-admin-calendar.mjs [url] [스크린샷 폴더]
 *
 * 확인하는 것
 *   · 공부기록 달력 — 요일 줄·이전/다음 달·이번 달, 날짜 칸에 🏫 학원(파랑)·🏠 숙제(빨강) 인원·시간
 *   · 날짜를 누르면 그날 학원/숙제 공부한 학생·기록 없는 학생, 학원공부·숙제공부 일괄 버튼
 *   · 일괄 쏘기는 확인 문구를 띄우고, 취소하면 아무것도 보내지 않는다
 *   · 개별 쏘기(검증 학생에게만) — 지급 이력에 남고 학생 드래곤볼이 1개 는다
 *   · 학생 상세 추이 그래프에 학원(파랑)·숙제(빨강) 두 선
 *   · 관리자 문구는 「푼 숙제」, 학생 화면은 「지난번 푼 문제 수」 그대로
 *   · 실시간 탭 「오늘 공부 이력」 — 학원·숙제 일괄 버튼
 *   · 360px 에서 잘리지 않음
 * 검증용 학생·기록·드래곤볼 지급은 끝나고 지운다 (실제 학생에게는 쏘지 않는다).
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

const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const month = today.slice(0, 7)

/* ── 검증용 학생·기록 준비 ─────────────────────────────────────────── */
const codeA = String(Math.floor(1000 + Math.random() * 4000))
const codeB = String(Math.floor(5000 + Math.random() * 4000))
const studentA = await run(
  supabase.from('students').insert({ name: '검증달력A', code: codeA, grade: '검증' }).select('id,name,code').single(),
)
const studentB = await run(
  supabase.from('students').insert({ name: '검증달력B', code: codeB, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${studentA.name}(${codeA}) ${studentA.id} · ${studentB.name}(${codeB}) ${studentB.id}`)

/* 기록이 하나도 없는 날을 골라 그 날에만 검증 기록을 넣는다 (실제 기록과 섞이지 않게) */
const existing = await run(
  supabase.from('study_logs').select('date').gte('date', `${month}-01`).lte('date', today),
)
const usedDates = new Set((existing ?? []).map((row) => row.date))
let quietDate = ''
for (let day = 1; day <= Number(today.slice(8, 10)); day += 1) {
  const date = `${month}-${String(day).padStart(2, '0')}`
  if (!usedDates.has(date)) {
    quietDate = date
    break
  }
}
if (!quietDate) throw new Error('검증할 빈 날짜를 찾지 못했어요.')
console.log(`검증 날짜 ${quietDate} (기존 기록 없는 날)`)

await run(
  supabase.from('study_logs').insert([
    {
      student_id: studentA.id,
      date: quietDate,
      minutes: 70,
      problems: 9,
      academy_minutes: 70,
      academy_problems: 9,
      homework_minutes: 0,
      homework_problems: 0,
    },
    {
      student_id: studentB.id,
      date: quietDate,
      minutes: 40,
      problems: 6,
      academy_minutes: 0,
      academy_problems: 0,
      homework_minutes: 40,
      homework_problems: 6,
    },
    /* 오늘 공부 이력·두 선 그래프 확인용 — A 는 오늘 학원 30분 + 숙제 20분 */
    {
      student_id: studentA.id,
      date: today,
      minutes: 50,
      problems: 7,
      academy_minutes: 30,
      academy_problems: 4,
      homework_minutes: 20,
      homework_problems: 3,
    },
  ]),
)

/* 학생 화면 「지난번 푼 문제 수」 확인용 — 문제 수를 기다리는 세션 하나 */
const pendingSession = await run(
  supabase
    .from('study_sessions')
    .insert({
      student_id: studentA.id,
      kind: 'academy',
      status: 'finished',
      started_at: new Date(Date.now() - 6 * 60_000).toISOString(),
      ended_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      last_heartbeat_at: new Date(Date.now() - 6 * 60_000).toISOString(),
      minutes: 3,
      problems: null,
      problems_pending: true,
      date: today,
    })
    .select('id')
    .single(),
)

const countGrants = async () =>
  run(supabase.from('dragonball_grants').select('id').in('student_id', [studentA.id, studentB.id]))
const dragonballsOf = async (id) => {
  const row = await run(supabase.from('students').select('dragonball_count').eq('id', id).single())
  return Number(row.dragonball_count ?? 0)
}

const grantsBefore = (await countGrants()).length
const aBefore = await dragonballsOf(studentA.id)

let browser = null
try {
  browser = await chromium.launch({
    executablePath:
      process.env.PW_CHROME ?? '/workspace/tmp/pw/browsers/chromium_headless_shell-1148/chrome-linux/headless_shell',
    args: ['--no-sandbox'],
  })
  /* ── 모바일 360 ─────────────────────────────────────────────── */
  const mobile = await browser.newContext({
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: ANDROID_UA,
  })
  const page = await mobile.newPage()

  await page.goto(`${base}/admin`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  if (await page.getByLabel('관리자 비밀번호').isVisible().catch(() => false)) {
    await page.getByLabel('관리자 비밀번호').fill(adminPassword)
    await page.getByRole('button', { name: '입장' }).click()
    await page.waitForTimeout(900)
  }

  const mainText = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  const bodyText = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ')

  check('관리자 로그인', (await bodyText()).includes('선오공 관리자'))

  /* 1) 달력 — 첫 탭이 「실시간」이라 「공부기록」 탭으로 옮긴다 (2026-11-28) */
  await page.getByRole('button', { name: /^공부기록$/ }).first().click()
  await page.waitForTimeout(700)
  const calendarTitle = page.getByText('공부기록 달력', { exact: true })
  await calendarTitle.waitFor({ state: 'visible', timeout: 10000 })
  check('달력: 제목', true)
  const weekdayHeader = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  check('달력: 요일 줄', ['일', '월', '화', '수', '목', '금', '토'].every((label) => weekdayHeader.includes(label)))
  check(
    '달력: 이전·다음 달·이번 달 버튼',
    (await page.getByLabel('이전 달').count()) === 1 &&
      (await page.getByLabel('다음 달').count()) === 1 &&
      (await page.getByRole('button', { name: '이번 달' }).count()) >= 1,
  )

  const quietCell = page.getByRole('button', { name: new RegExp(`^${quietDate} 상세`) })
  await quietCell.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  const cellText = (await quietCell.innerText()).replace(/\s+/g, ' ')
  /* 360px 칸은 좁아 인원은 숫자만, 시간은 '1시간'처럼 짧게 — 정확한 값은 날짜 상세에 */
  check('달력: 검증 날짜 칸 — 학원 1명·1시간', cellText.includes('🏫 1') && cellText.includes('1시간'), cellText)
  check('달력: 검증 날짜 칸 — 숙제 1명·40분', cellText.includes('🏠 1') && cellText.includes('40분'), cellText)
  check('달력: 칸 글자가 세로로 꺾이지 않음', !/🏫\s*\n?\s*\d+\s*\n명/.test(await quietCell.innerText()), JSON.stringify(await quietCell.innerText()))
  const cellBox = await quietCell.boundingBox()
  check('달력: 칸이 360px 안에 있음', Boolean(cellBox) && cellBox.x >= 0 && cellBox.x + cellBox.width <= 360, JSON.stringify(cellBox))
  check('달력: 학원·숙제 색 안내', (await bodyText()).includes('🏫 학원공부 인원·시간') && (await bodyText()).includes('🏠 숙제공부 인원·시간'))
  await page.screenshot({ path: `${shotDir}/sunogong-admin-calendar-360.png`, fullPage: false })

  /* 2) 날짜 상세 */
  await quietCell.click()
  const dialog = page.getByRole('dialog', { name: /공부 이력/ })
  await dialog.waitFor({ state: 'visible', timeout: 8000 })
  const detail = (await dialog.innerText()).replace(/\s+/g, ' ')
  check('상세: 그날 학원 공부한 학생', detail.includes('🏫 학원 공부한 학생 1명') && detail.includes('검증달력A'), detail.slice(0, 200))
  check('상세: 그날 숙제 공부한 학생', detail.includes('🏠 숙제 공부한 학생 1명') && detail.includes('검증달력B'))
  check('상세: 기록 없는 학생 목록', detail.includes('기록 없는 학생') && detail.includes('명'))
  check('상세: 학원·숙제 인원·시간', detail.includes('1명 · 1시간 10분') && detail.includes('1명 · 40분'), detail.slice(0, 200))
  check('상세: 학원공부 일괄 버튼', detail.includes('🏫 학원공부 일괄 1명'))
  check('상세: 숙제공부 일괄 버튼', detail.includes('🏠 숙제공부 일괄 1명'))
  check('상세: 관리자 문구 「푼 문제」 없음', !detail.includes('푼 문제'))
  const detailBox = await dialog.boundingBox()
  check('상세: 360px 안에서 잘리지 않음', Boolean(detailBox) && detailBox.x >= 0 && detailBox.x + detailBox.width <= 360, JSON.stringify(detailBox))
  await page.screenshot({ path: `${shotDir}/sunogong-admin-day-detail-360.png`, fullPage: false })

  /* 3) 일괄 쏘기는 확인 → 취소 (아무것도 보내지 않음) */
  await dialog.getByRole('button', { name: /🏫 학원공부 일괄 1명/ }).click()
  await page.waitForTimeout(300)
  const confirmText = (await dialog.innerText()).replace(/\s+/g, ' ')
  check('일괄: 확인 문구', confirmText.includes('🏫 학원공부한 1명에게 드래곤볼 1개씩 쏠까요?'), confirmText.slice(0, 200))
  await page.screenshot({ path: `${shotDir}/sunogong-admin-day-bulk-confirm-360.png`, fullPage: false })
  await dialog.getByRole('button', { name: '취소' }).click()
  await page.waitForTimeout(500)
  const afterCancel = (await dialog.innerText()).replace(/\s+/g, ' ')
  check('일괄: 취소하면 확인 문구가 사라진다', !afterCancel.includes('쏠까요'))
  const grantsAfterCancel = (await countGrants()).length
  check('일괄: 취소하면 지급 0건', grantsAfterCancel === grantsBefore, `${grantsBefore} → ${grantsAfterCancel}`)
  check('일괄: 취소하면 드래곤볼도 그대로', (await dragonballsOf(studentA.id)) === aBefore)

  /* 4) 개별 쏘기 — 검증 학생에게만 */
  await dialog.getByRole('button', { name: '검증달력A 학원공부 드래곤볼 쏘기' }).click()
  await page.waitForTimeout(1800)
  const afterOne = (await dialog.innerText()).replace(/\s+/g, ' ')
  check('개별: 결과 문구', afterOne.includes('검증달력A · 드래곤볼 1개'), afterOne.slice(-160))
  const aAfter = await dragonballsOf(studentA.id)
  check('개별: 검증 학생 드래곤볼 +1', aAfter === aBefore + 1, `${aBefore} → ${aAfter}`)
  const grantsAfterOne = await countGrants()
  check('개별: 지급 이력 1건 추가', grantsAfterOne.length === grantsBefore + 1, `${grantsBefore} → ${grantsAfterOne.length}`)
  await page.screenshot({ path: `${shotDir}/sunogong-admin-day-sent-360.png`, fullPage: false })
  await dialog.getByRole('button', { name: '닫기' }).first().click()
  await page.waitForTimeout(500)

  /* 5) 실시간 탭 — 오늘 공부 이력 */
  await page.getByRole('button', { name: /실시간/ }).first().click()
  await page.waitForTimeout(2000)
  const live = await mainText()
  check('실시간: 오늘 공부 이력 칸', live.includes('오늘 공부 이력'))
  check(
    '실시간: 오늘 공부한 검증 학생',
    live.includes('검증달력A') && live.includes('🏫 30분 · 푼 숙제 4개') && live.includes('🏠 20분 · 푼 숙제 3개'),
    live.slice(0, 200),
  )
  check('실시간: 오늘 숙제공부 일괄 1명', /🏠\s*숙제공부 일괄 1명/.test(live))
  check('실시간: 학원공부 일괄 버튼', /🏫\s*학원공부 일괄 \d+명/.test(live), live.slice(live.indexOf('오늘 공부 이력'), live.indexOf('오늘 공부 이력') + 400))
  check('실시간: 숙제공부 일괄 버튼', /🏠\s*숙제공부 일괄 \d+명/.test(live))
  check('실시간: 오늘 공부 이력에 「푼 숙제」', live.includes('푼 숙제'))
  await page.getByText('오늘 공부 이력', { exact: true }).scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${shotDir}/sunogong-admin-today-history-360.png`, fullPage: false })

  /* 6) 랭킹 문구 */
  await page.getByRole('button', { name: /랭킹/ }).first().click()
  await page.waitForTimeout(1500)
  const ranking = await mainText()
  check('랭킹: 「푼 숙제」 문구', ranking.includes('학원 공부에서 푼 숙제') && ranking.includes('숙제 공부에서 푼 숙제'), ranking.slice(0, 120))
  check('랭킹: 「푼 문제」 없음', !ranking.includes('푼 문제'))

  /* ── 데스크톱 1280 — 달력 배치·두 선 그래프 ─────────────────── */
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
  const wide = await desktop.newPage()
  await wide.goto(`${base}/admin`, { waitUntil: 'networkidle' })
  await wide.waitForTimeout(700)
  if (await wide.getByLabel('관리자 비밀번호').isVisible().catch(() => false)) {
    await wide.getByLabel('관리자 비밀번호').fill(adminPassword)
    await wide.getByRole('button', { name: '입장' }).click()
    await wide.waitForTimeout(900)
  }
  const wideCell = wide.getByRole('button', { name: new RegExp(`^${quietDate} 상세`) })
  if ((await wideCell.count()) === 0) {
    await wide.getByRole('button', { name: /^공부기록$/ }).first().click()
    await wide.waitForTimeout(700)
  }
  await wideCell.scrollIntoViewIfNeeded()
  await wide.waitForTimeout(500)
  const wideCellBox = await wideCell.boundingBox()
  check('데스크톱: 달력 칸 폭이 넉넉함', Boolean(wideCellBox) && wideCellBox.width >= 100, JSON.stringify(wideCellBox))
  const wideCellText = (await wideCell.innerText()).replace(/\s+/g, ' ')
  check('데스크톱: 칸에 인원·시간 한 줄', wideCellText.includes('🏫 1명') && wideCellText.includes('1시간10분'), wideCellText)
  await wide.screenshot({ path: `${shotDir}/sunogong-admin-calendar-desktop.png`, fullPage: false })

  /* 학생 상세 — 두 선 */
  await wide.getByRole('button', { name: '검증달력A', exact: true }).first().click()
  const studentDialog = wide.getByRole('dialog', { name: /검증달력A/ })
  await studentDialog.waitFor({ state: 'visible', timeout: 8000 })
  await wide.waitForTimeout(1200)
  const lines = await studentDialog.locator('svg polyline').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('stroke')),
  )
  check('두 선: 꺾은선 2개', lines.length === 2, JSON.stringify(lines))
  check('두 선: 학원 파랑', lines.includes('#1D4A9B'), JSON.stringify(lines))
  check('두 선: 숙제 빨강', lines.includes('#E0453E'), JSON.stringify(lines))
  const svgText = (await studentDialog.innerText()).replace(/\s+/g, ' ')
  check('두 선: 범례', svgText.includes('🏫 학원 공부') && svgText.includes('🏠 숙제 공부'))
  await studentDialog.scrollIntoViewIfNeeded()
  await wide.screenshot({ path: `${shotDir}/sunogong-admin-trend-dual-desktop.png`, fullPage: false })

  /* 기록 수정 창 — 「푼 숙제 수」 */
  await studentDialog.getByRole('button', { name: '수정' }).first().click()
  const editDialog = wide.getByRole('dialog', { name: /기록/ })
  await wide.waitForTimeout(600)
  if (await editDialog.count()) {
    const editText = (await editDialog.innerText()).replace(/\s+/g, ' ')
    check('기록 수정: 「푼 숙제 수」 두 칸', (editText.match(/푼 숙제 수/g) ?? []).length === 2, editText.slice(0, 200))
    check('기록 수정: 「푼 문제」 없음', !editText.includes('푼 문제'))
    await wide.screenshot({ path: `${shotDir}/sunogong-admin-log-editor-푼숙제-desktop.png`, fullPage: false })
  } else {
    check('기록 수정: 창이 열린다', false)
  }

  /* ── 학생 화면 — 「지난번 푼 문제 수」 그대로 ───────────────── */
  await page.evaluate(() => localStorage.clear()).catch(() => {})
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const alreadyHome = (await bodyText()).includes('선오공')
  if (!alreadyHome || (await page.getByRole('button', { name: '확인', exact: true }).count()) > 0) {
    for (const digit of codeA) {
      const key = page.getByRole('button', { name: digit, exact: true })
      if (await key.count()) await key.first().click()
    }
    const okButton = page.getByRole('button', { name: '확인', exact: true })
    if (await okButton.count()) await okButton.first().click()
    await page.waitForTimeout(2200)
  }
  const pendingDialog = page.getByRole('dialog', { name: '지난번 푼 문제 수' })
  const pendingVisible = await pendingDialog.isVisible().catch(() => false)
  check('학생 화면: 「지난번 푼 문제 수」 그대로', pendingVisible)
  if (pendingVisible) {
    const pendingText = (await pendingDialog.innerText()).replace(/\s+/g, ' ')
    check('학생 화면: 학원 공부 안내', pendingText.includes('학원 공부'), pendingText.slice(0, 160))
    check('학생 화면: 「푼 숙제」로 바뀌지 않음', !pendingText.includes('푼 숙제'))
    await page.screenshot({ path: `${shotDir}/sunogong-student-pending-problems-360.png`, fullPage: false })
    const skip = page.getByRole('button', { name: '건너뛰기' })
    if (await skip.count()) await skip.first().click()
  }
} catch (error) {
  check('확인 중 오류 없음', false, error instanceof Error ? error.message : String(error))
  console.log(error instanceof Error ? error.stack?.split('\n').slice(0, 4).join(' / ') : '')
} finally {
  if (browser) await browser.close().catch(() => {})

  /* ── 검증 데이터 정리 ─────────────────────────────────────── */
  try {
    const cleanup = [
      await supabase.from('dragonball_grants').delete().in('student_id', [studentA.id, studentB.id]),
      await supabase.from('study_logs').delete().in('student_id', [studentA.id, studentB.id]),
      await supabase.from('study_sessions').delete().eq('id', pendingSession.id),
      await supabase.from('study_sessions').delete().in('student_id', [studentA.id, studentB.id]),
      await supabase.from('students').delete().in('id', [studentA.id, studentB.id]),
    ].filter((res) => res.error)
    if (cleanup.length > 0) console.log(`정리 경고: ${cleanup.map((res) => res.error.message).join(' / ')}`)

    const left = await supabase.from('students').select('id').in('id', [studentA.id, studentB.id])
    const leftGrants = await countGrants()
    console.log(`정리: 남은 검증 학생 ${(left.data ?? []).length}명 · 지급 ${leftGrants.length}건`)
  } catch (error) {
    console.log(`정리 실패: ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log(failed === 0 ? 'ALL ADMIN CALENDAR CHECKS PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
