/**
 * 「지난번 푼 문제 수」 저장 확인 — 실서비스 화면 확인 (360×780, 개발용)
 *   node tools/check-pending-problems.mjs <url> <학생코드> <학생id> <출결id> [스크린샷 폴더]
 *
 * 2026-11-27 — 훈출(등·하원)이 연 학원 세션의 문제 수를 저장하지 못하던 문제의 재발 방지 확인.
 * 확인하는 것
 *   · 훈출 세션(attendance_id)이 문제 수 대기로 남으면 「지난번 푼 문제 수」 창이 뜬다
 *   · 창의 안내가 「훈출(등·하원)」 로 나온다 (옛 표기 「출훈」 없음)
 *   · 0을 누르고 「저장」 → 저장되고 창이 닫히며 홈 화면으로 넘어간다
 *   · 저장 뒤 대기 목록이 0건이 된다
 *   · 지빈(이지빈) 계정 창은 건너뛰기로 닫고 기록은 건드리지 않는다
 *
 * 준비: 학생과 마감된 출결 한 줄이 미리 있어야 한다(attendance_sessions 는 anon 권한이 없다).
 *   예) with s as (insert into public.students (name, code, grade) values ('ZZ검증문제수','7727','검증') returning id)
 *       insert into public.attendance_sessions (student_id, seat_id, check_in_at, check_in_by, check_out_at, check_out_by, close_reason, session_date)
 *       select s.id, 'Z-9', now() - interval '20 minutes', 'student', now() - interval '5 minutes', 'staff', 'normal', public.kst_today() from s
 *       returning id as attendance_id, student_id;
 * 검증용 세션·기록은 끝나고 지운다(학생·출결은 부르는 쪽에서 지운다).
 */
import pw from '/workspace/tmp/pw/node_modules/playwright/index.js'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const { chromium } = pw
const base = (process.argv[2] ?? 'https://sunogong.vercel.app').replace(/\/$/, '')
const code = process.argv[3]
const studentId = process.argv[4]
const attendanceId = process.argv[5]
const shotDir = (process.argv[6] ?? '/workspace/downloads').replace(/\/$/, '')
const JIBIN_CODE = '3733'

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

const started = new Date(Date.now() - 6 * 60_000).toISOString()
const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const session = await run(
  supabase
    .from('study_sessions')
    .insert({
      student_id: studentId,
      kind: 'academy',
      status: 'finished',
      started_at: started,
      ended_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      last_heartbeat_at: started,
      minutes: 1,
      problems: null,
      problems_pending: true,
      date: today,
      attendance_id: attendanceId,
    })
    .select('id')
    .single(),
)
await run(
  supabase
    .from('study_logs')
    .insert({ student_id: studentId, date: today, minutes: 1, problems: 0, academy_minutes: 1, academy_problems: 0 })
    .select('id'),
)
console.log(`검증용 훈출 세션 ${session.id} (1분 · 문제 수 대기)`)

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

  const enter = async (studentCode) => {
    await page.evaluate(() => localStorage.clear()).catch(() => {})
    await page.goto(`${base}/`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    for (const digit of studentCode) {
      await page.getByRole('button', { name: digit, exact: true }).click()
    }
    await page.getByRole('button', { name: '확인', exact: true }).click()
    await page.waitForTimeout(1800)
  }

  /* ── 1) 훈출 세션 → 「지난번 푼 문제 수」 창이 뜨고 안내가 「훈출」 ───────── */
  await enter(code)
  const modal = page.getByRole('dialog', { name: '지난번 푼 문제 수' })
  await modal.waitFor({ state: 'visible', timeout: 10000 })
  const modalText = (await modal.innerText()).replace(/\s+/g, ' ')
  check('창이 뜬다: 「지난번 푼 문제 수」', true)
  check('창 문구: 「1분 공부 · 학원 공부」', modalText.includes('학원 공부') && modalText.includes('1분 공부'), modalText.slice(0, 120))
  check('창 문구: 옛 표기(출훈) 없음', !modalText.includes('출훈'))
  await page.screenshot({ path: `${shotDir}/sunogong-pending-problems-modal-360.png` })

  /* ── 2) 0 → 저장 → 창이 닫히고 홈으로 ─────────────────────────────────── */
  await modal.getByRole('button', { name: '0', exact: true }).click()
  await modal.getByRole('button', { name: '저장', exact: true }).click()
  await page.waitForTimeout(2500)
  const closed = (await modal.count()) === 0 || !(await modal.isVisible().catch(() => false))
  check('저장 뒤 창이 닫힌다', closed)
  const home = await text(page)
  check('홈 화면으로 넘어간다', home.includes('숙제 공부 시작') || home.includes('오늘의 한줄'), home.slice(0, 160))
  await page.screenshot({ path: `${shotDir}/sunogong-pending-problems-saved-360.png` })

  const saved = await run(supabase.from('study_sessions').select('problems,problems_pending').eq('id', session.id).single())
  check('DB: problems=0 · pending=false', saved.problems === 0 && saved.problems_pending === false, JSON.stringify(saved))
  const pending = await run(supabase.rpc('pending_problem_sessions', { p_student_id: studentId }))
  check('저장 뒤 대기 목록 0건', pending.length === 0, `${pending.length}건`)

  /* ── 2-1) 학원 타이머에서 종료를 누르면 「훈출」 안내가 보인다 ─────────── */
  const running = await run(
    supabase
      .from('study_sessions')
      .insert({
        student_id: studentId,
        kind: 'academy',
        status: 'running',
        started_at: new Date(Date.now() - 5 * 60_000).toISOString(),
        last_heartbeat_at: new Date().toISOString(),
        date: today,
        attendance_id: attendanceId,
      })
      .select('id')
      .single(),
  )
  await enter(code)
  await page.getByRole('button', { name: '종료', exact: true }).click()
  await page.waitForTimeout(1200)
  const hintText = await text(page)
  check(
    '훈출 세션 종료 → 「훈출에서 하원하면 자동으로 마무리돼요」',
    hintText.includes('훈출에서 하원하면 자동으로 마무리돼요'),
    hintText.slice(0, 160),
  )
  check('훈출 안내에 옛 표기(출훈) 없음', !hintText.includes('출훈'))
  await page.screenshot({ path: `${shotDir}/sunogong-pending-problems-hint-360.png` })
  const stillRunning = await run(supabase.from('study_sessions').select('status').eq('id', running.id).single())
  check('종료를 눌러도 세션은 계속 running', stillRunning.status === 'running', stillRunning.status)
  await run(supabase.from('study_sessions').delete().eq('id', running.id))

  /* ── 3) 지빈이 계정 — 창이 뜨고 「훈출」 안내, 건너뛰기로 기록은 그대로 ──── */
  const jibinBefore = await run(
    supabase.from('students').select('id').eq('code', JIBIN_CODE).maybeSingle(),
  )
  if (jibinBefore?.id) {
    const pendingBefore = await run(supabase.rpc('pending_problem_sessions', { p_student_id: jibinBefore.id }))
    await enter(JIBIN_CODE)
    const jibinModal = page.getByRole('dialog', { name: '지난번 푼 문제 수' })
    const jibinOpen = await jibinModal.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)
    const jibinText = jibinOpen ? (await jibinModal.innerText()).replace(/\s+/g, ' ') : (await text(page))
    check('지빈이 계정: 창이 뜬다', jibinOpen)
    check('지빈이 계정: 「1분 공부」 줄', jibinText.includes('1분 공부'), jibinText.slice(0, 120))
    check('지빈이 계정: 옛 표기(출훈) 없음', !jibinText.includes('출훈'))
    await page.screenshot({ path: `${shotDir}/sunogong-pending-problems-jibin-360.png` })
    if (jibinOpen) {
      await jibinModal.getByRole('button', { name: '건너뛰기', exact: true }).click()
      await page.waitForTimeout(1200)
    }
    const pendingAfter = await run(supabase.rpc('pending_problem_sessions', { p_student_id: jibinBefore.id }))
    check(
      '지빈이 기록은 그대로(건너뛰기)',
      pendingAfter.length === pendingBefore.length,
      `before=${pendingBefore.length}, after=${pendingAfter.length}`,
    )
  } else {
    check('지빈이 계정 확인', false, '코드 3733 학생을 찾지 못했습니다')
  }
} finally {
  if (browser) await browser.close().catch(() => {})
  await supabase.from('study_sessions').delete().eq('student_id', studentId)
  await supabase.from('study_logs').delete().eq('student_id', studentId)
}

const left = await run(supabase.from('study_sessions').select('id').eq('student_id', studentId))
check('검증용 세션 정리됨', (left ?? []).length === 0, `${left?.length}건`)

console.log(failed === 0 ? 'ALL CHECKS PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
