/**
 * 학원 세션 「0분 종료」 가드 확인 — 실서비스 화면 확인 (360×780, 개발용)
 *   node tools/check-academy-guard.mjs [url] [screenshot-dir]
 *
 * 2026-11-27 — 출훈이 등원으로 연 학원 세션이 0분 만에 끝나던 문제의 재발 방지 확인.
 * 확인하는 것
 *   · 하트비트가 끊긴 학원 세션: 앱을 열어도 일시정지되지 않는다(예전에는 paused 가 됐다)
 *   · 1분 넘게 공부한 학원 세션: 종료가 그대로 된다(정상 흐름 유지)
 *   · 방금 시작한 학원 세션: 종료가 거부되고 안내 문구가 화면에 보인다(세션은 계속 running)
 *   · 학생 폰(anon)이 표를 직접 고쳐 끝내려 하면 DB 가 막는다
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
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString()

const code = String(Math.floor(1000 + Math.random() * 8999))
const student = await run(
  supabase.from('students').insert({ name: '검증가드', code, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id}`)

const sessionState = async (id) =>
  run(
    supabase
      .from('study_sessions')
      .select('id,status,minutes,problems,paused_at,auto_pause_count,ended_at')
      .eq('id', id)
      .single(),
  )

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

  const enter = async () => {
    await page.goto(`${base}/`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    for (const digit of code) {
      await page.getByRole('button', { name: digit, exact: true }).click()
    }
    await page.getByRole('button', { name: '확인', exact: true }).click()
    await page.waitForTimeout(1500)
  }

  /* ── 1) 하트비트가 끊긴 학원 세션 — 앱을 열어도 멈추지 않는다 ─────────── */
  const stale = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'academy' }))
  await run(
    supabase
      .from('study_sessions')
      .update({ started_at: iso(6 * 60_000), last_heartbeat_at: iso(5 * 60_000) })
      .eq('id', stale.id),
  )
  await enter()
  const timerText = await text(page)
  check('앱 열림: 학원 타이머 표시', timerText.includes('학원 공부는 화면이 꺼져도 계속 가요'), timerText.slice(0, 120))
  const afterOpen = await sessionState(stale.id)
  check(
    '가드: 끊긴 학원 세션은 일시정지되지 않음',
    afterOpen.status === 'running' && afterOpen.paused_at === null && afterOpen.auto_pause_count === 0,
    `status=${afterOpen.status}, paused_at=${afterOpen.paused_at}, auto_pause_count=${afterOpen.auto_pause_count}`,
  )
  await page.screenshot({ path: `${shotDir}/sunogong-academy-guard-running-360.png` })

  /* ── 2) 6분 공부한 학원 세션 — 종료는 그대로 된다 ─────────────────────── */
  await page.getByRole('button', { name: '종료', exact: true }).click()
  await page.getByRole('button', { name: '마칠래요' }).click()
  const problemModal = page.getByRole('dialog', { name: '오늘 푼 문제 수' })
  await problemModal.waitFor({ state: 'visible', timeout: 8000 })
  await problemModal.getByRole('button', { name: '3', exact: true }).click()
  await problemModal.getByRole('button', { name: '저장', exact: true }).click()
  await page.waitForTimeout(2000)
  const done = await sessionState(stale.id)
  check(
    '정상 종료: 6분·3문제로 끝남',
    done.status === 'finished' && (done.minutes ?? 0) >= 5 && done.problems === 3,
    `status=${done.status}, minutes=${done.minutes}, problems=${done.problems}`,
  )

  /* ── 3) 방금 시작한 학원 세션 — 종료가 거부되고 안내가 보인다 ─────────── */
  await page.evaluate(() => localStorage.clear())
  const fresh = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'academy' }))
  await run(supabase.from('study_sessions').update({ started_at: iso(0) }).eq('id', fresh.id))
  await enter()
  await page.getByRole('button', { name: '종료', exact: true }).click()
  await page.getByRole('button', { name: '마칠래요' }).click()
  const freshModal = page.getByRole('dialog', { name: '오늘 푼 문제 수' })
  await freshModal.waitFor({ state: 'visible', timeout: 8000 })
  await freshModal.getByRole('button', { name: '저장', exact: true }).click()
  await page.waitForTimeout(2000)
  const freshState = await sessionState(fresh.id)
  const guardText = await text(page)
  check('0분 종료 거부: 세션은 계속 running', freshState.status === 'running' && freshState.ended_at === null, `status=${freshState.status}`)
  check('0분 종료 거부: 화면 안내', guardText.includes('방금 시작한 학원 공부'), guardText.slice(0, 200))
  await page.screenshot({ path: `${shotDir}/sunogong-academy-guard-too-short-360.png` })

  /* ── 4) 학생 폰(anon)이 표를 직접 고쳐 끝내기 — DB 가 막는다 ───────────── */
  const patch = await supabase
    .from('study_sessions')
    .update({ status: 'finished', minutes: 0 })
    .eq('id', fresh.id)
  check('직접 수정 차단: anon UPDATE 거부', Boolean(patch.error) && /kiosk|42501/.test(patch.error.message), patch.error?.message ?? '통과됨')
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
