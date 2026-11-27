/**
 * 「학원 등원 중 숙제 공부 시작 차단」 실서비스 확인 (2026-11-28, 개발용)
 *   node tools/check-academy-homework-block.mjs [url] [screenshot-dir]
 *
 * 확인하는 것 (360×780)
 *   · 등원 전: 홈의 「숙제 공부 시작」이 눌린다
 *   · 훈출 등원(attendance_apply check_in) 뒤 홈에 그대로 머물러 있어도
 *     안내 문구가 뜨고 버튼이 잠긴다(30초 주기·화면 복귀 확인)
 *   · 잠긴 버튼을 눌러도 타이머로 가지 않고, DB(start_session)도 academy_session_active 로 거부
 *   · 훈출 하원(attendance_apply check_out) 뒤에는 안내가 사라지고 숙제 공부를 시작할 수 있다
 *   · 학원 세션은 하원 때 그때까지 시간으로 정산된다(훈출 흐름 그대로)
 * 검증용 학생·출결·세션·기록·포인트·감사 로그는 끝나고 지운다.
 */
import pw from '/workspace/tmp/pw/node_modules/playwright/index.js'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

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
/* 훈출(키오스크)은 service_role 로 attendance_apply 를 부른다 — 있으면 같은 경로로 등·하원을 흉내 낸다.
 * (없으면 start_session('academy') 로 학원 세션만 만들어 화면·가드만 확인한다.)
 * 키는 환경변수로만 받고 파일에 남기지 않는다. */
const serviceKey = process.env.SB_SERVICE_KEY ?? ''
const hunsu = serviceKey
  ? createClient(env.VITE_SUPABASE_URL, serviceKey, { auth: { persistSession: false } })
  : supabase

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
  supabase.from('students').insert({ name: '검증등원', code, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id}`)

const ocrAt = new Date(Date.now() - 8 * 60_000).toISOString()
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
    await page.waitForTimeout(1500)
  }

  /* 홈이 화면에 다시 보인 것처럼 만들어, 다음 확인 주기를 기다리지 않고 바로 읽게 한다 */
  const pokeHome = async () => {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.waitForTimeout(1800)
  }

  /* ── 1) 등원 전 홈 — 숙제 공부 시작이 눌린다 ─────────────────────────── */
  await enter()
  const startButton = page.getByRole('button', { name: /숙제 공부 시작/ }).first()
  check('홈: 숙제 공부 시작 버튼 있음', await startButton.isVisible())
  check('홈: 등원 전에는 버튼이 눌린다', !(await startButton.isDisabled()))
  check('홈: 등원 전에는 안내 문구 없음', !(await text(page)).includes('학원 등원 중에는 숙제 공부를 시작할 수 없어요'))
  await startButton.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${shotDir}/sunogong-home-homework-enabled-360.png` })

  /* ── 2) 훈출 등원 — 홈에 머문 채로 학원 세션이 열린다 ───────────────────── */
  let checkedIn = false
  if (serviceKey) {
    const checkIn = await run(
      hunsu.rpc('attendance_apply', {
        p_op: {
          op: 'check_in',
          student_id: student.id,
          seat_id: 'Z-1',
          client_id: randomUUID(),
          actor_kind: 'student',
          at: ocrAt,
        },
      }),
    )
    checkedIn = Boolean(checkIn?.ok)
    check(
      '훈출 등원 → 학원 세션 열림',
      checkedIn && checkIn?.study_session?.kind === 'academy',
      `code=${checkIn?.code ?? '-'}, session=${checkIn?.study_session?.id ?? '-'}`,
    )
  } else {
    const session = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'academy' }))
    check('학원 세션 열림(start_session 대체 경로)', session?.kind === 'academy', session?.id)
  }

  await pokeHome()
  const blockedText = await text(page)
  const blockedButton = page.getByRole('button', { name: /숙제 공부 시작/ }).first()
  check('홈: 등원 중 안내 문구가 보인다', blockedText.includes('학원 등원 중에는 숙제 공부를 시작할 수 없어요'))
  check('홈: 등원 중에는 숙제 버튼이 잠긴다', await blockedButton.isDisabled())
  await blockedButton.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${shotDir}/sunogong-home-academy-blocked-360.png` })

  /* ── 3) 잠긴 버튼을 눌러도 타이머로 가지 않는다 ─────────────────────────── */
  await blockedButton.click({ force: true, timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const afterClick = await text(page)
  check('홈: 잠긴 버튼을 눌러도 숙제 타이머로 안 감',
    !afterClick.includes('숙제 공부는 화면을 끄거나 나가면 멈춰요') && afterClick.includes('학원 등원 중에는'),
    afterClick.slice(0, 120))

  /* ── 4) DB 도 같은 규칙으로 거부한다 (앱과 같은 anon 키) ───────────────── */
  const attempt = await supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'homework' })
  check(
    'DB: 등원 중 숙제 시작 거부(academy_session_active)',
    Boolean(attempt.error) && attempt.error.message.includes('academy_session_active'),
    attempt.error?.message ?? '거부되지 않고 세션이 만들어졌습니다',
  )
  const openAfter = await run(
    supabase.from('study_sessions').select('id,kind').eq('student_id', student.id).neq('status', 'finished'),
  )
  check('DB: 거부 뒤에도 진행 중 세션은 학원 1건', (openAfter ?? []).length === 1 && openAfter[0].kind === 'academy',
    JSON.stringify(openAfter))

  /* ── 5) 훈출 하원 — 학원 시간이 정산되고 숙제 공부가 열린다 ─────────────── */
  let checkOut = null
  if (checkedIn) {
    checkOut = await run(
      hunsu.rpc('attendance_apply', {
        p_op: { op: 'check_out', student_id: student.id, client_id: randomUUID(), actor_kind: 'staff', at: new Date().toISOString() },
      }),
    )
  } else {
    /* service 키가 없을 때는 출결 표에 등원 줄 자체가 없다(위에서 start_session 으로만 열었다).
       그래서 하원은 학원 세션을 관리자 종료로 정산한다 — 출결 표(attendance_sessions)는 anon 이 못 읽는다. */
    const open = await run(
      supabase.from('study_sessions').select('id').eq('student_id', student.id).eq('kind', 'academy').single(),
    )
    await run(supabase.rpc('admin_end_study_session', { p_session_id: open.id, p_problems: 0 }))
    checkOut = { ok: true }
  }
  const settled = await run(
    supabase.from('study_sessions').select('id,kind,status,minutes,problems_pending').eq('student_id', student.id).eq('kind', 'academy').single(),
  )
  if (checkedIn) {
    check('훈출 하원 → 학원 세션 정산(8분)',
      Boolean(checkOut?.ok) && settled?.status === 'finished' && settled?.minutes >= 8,
      `ok=${checkOut?.ok}, status=${settled?.status}, minutes=${settled?.minutes}`)
  } else {
    /* service 키가 없는 환경 — 학원 세션을 방금 열어 0분으로 정산되는 것이 정상이다 */
    check('학원 세션 정산(대체 경로 — 방금 시작해 0분)',
      Boolean(checkOut?.ok) && settled?.status === 'finished' && (settled?.minutes ?? -1) >= 0,
      `ok=${checkOut?.ok}, status=${settled?.status}, minutes=${settled?.minutes}`)
  }
  if (checkedIn) {
    check('정산된 학원 세션은 문제 수를 묻는다(1분 이상)', settled?.problems_pending === true, String(settled?.problems_pending))
  }

  await page.evaluate(() => localStorage.clear())
  await enter()
  const lockedModal = page.getByRole('dialog', { name: '지난번 푼 문제 수' })
  if (await lockedModal.isVisible().catch(() => false)) {
    await lockedModal.getByRole('button', { name: '0', exact: true }).click()
    await lockedModal.getByRole('button', { name: '저장', exact: true }).click()
    await page.waitForTimeout(1500)
  }
  const unlockedText = await text(page)
  const unlockedButton = page.getByRole('button', { name: /숙제 공부 시작/ }).first()
  check('홈: 하원 뒤 안내가 사라진다', !unlockedText.includes('학원 등원 중에는 숙제 공부를 시작할 수 없어요'))
  check('홈: 하원 뒤 버튼이 다시 눌린다', !(await unlockedButton.isDisabled()))
  await unlockedButton.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${shotDir}/sunogong-home-homework-unlocked-360.png` })

  /* ── 6) 하원 뒤 숙제 공부 시작 → 숙제 타이머 ───────────────────────────── */
  await unlockedButton.click()
  await page.waitForTimeout(1800)
  const homeworkText = await text(page)
  check('숙제 공부 시작 → 숙제 타이머',
    homeworkText.includes('숙제 공부는 화면을 끄거나 나가면 멈춰요'),
    homeworkText.slice(0, 160))
  await page.screenshot({ path: `${shotDir}/sunogong-homework-timer-after-checkout-360.png` })

  const homework = await run(
    supabase.from('study_sessions').select('id,kind,status').eq('student_id', student.id).eq('kind', 'homework').maybeSingle(),
  )
  check('DB: 숙제 세션이 새로 열림', homework?.status === 'running', JSON.stringify(homework))

  const log = await run(supabase.from('study_logs').select('*').eq('student_id', student.id).maybeSingle())
  if (checkedIn) {
    check('DB: 학원 8분이 그날 기록에 들어감', (log?.academy_minutes ?? 0) >= 8 && (log?.homework_minutes ?? 0) === 0,
      `academy=${log?.academy_minutes}, homework=${log?.homework_minutes}`)
  } else {
    check('DB: 0분 학원 세션은 기록을 만들지 않는다', (log?.academy_minutes ?? 0) === 0 && (log?.homework_minutes ?? 0) === 0,
      `academy=${log?.academy_minutes}, homework=${log?.homework_minutes}`)
  }

  /* ── 7) 화면이 아직 잠기기 전(홈을 연 직후)에 누르면 DB 거부 안내가 뜬다 ───── */
  if (serviceKey) {
  await run(supabase.rpc('admin_end_study_session', { p_session_id: homework.id, p_problems: 0 }))
  const secondIn = new Date(Date.now() - 3 * 60_000).toISOString()
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  for (const digit of code) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
  await page.getByRole('button', { name: '확인', exact: true }).click()
  await page.waitForTimeout(1200)
  /* 홈이 아직 등원 전 상태(버튼 열림)인 사이에 훈출이 등원시킨 상황 */
  const earlyIn = await run(
    hunsu.rpc('attendance_apply', {
      p_op: { op: 'check_in', student_id: student.id, seat_id: 'Z-2', client_id: randomUUID(), actor_kind: 'student', at: secondIn },
    }),
  )
  const earlyButton = page.getByRole('button', { name: /숙제 공부 시작/ }).first()
  const wasOpen = !(await earlyButton.isDisabled())
  await earlyButton.click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const toastText = await text(page)
  check('홈: 잠기기 전에 누르면 DB 거부 안내가 뜬다',
    wasOpen && toastText.includes('학원 등원 중에는 숙제 공부를 시작할 수 없어요'),
    `버튼 열림=${wasOpen}, 화면=${toastText.slice(-160)}`)
  const noHomework = await run(
    supabase.from('study_sessions').select('id,kind').eq('student_id', student.id).neq('status', 'finished'),
  )
  check('DB: 안내 뒤에도 숙제 세션은 없음(학원 1건)',
    (noHomework ?? []).length === 1 && noHomework[0].kind === 'academy', JSON.stringify(noHomework))
  await page.screenshot({ path: `${shotDir}/sunogong-home-academy-blocked-toast-360.png` })
  await run(
    hunsu.rpc('attendance_apply', {
      p_op: { op: 'check_out', student_id: student.id, client_id: randomUUID(), actor_kind: 'staff', at: new Date().toISOString() },
    }),
  )
  }
} finally {
  if (browser) await browser.close().catch(() => {})
  /* 정리 — 훈출 키가 있으면 그쪽으로(출결·감사 로그까지 지울 수 있다), 없으면 앱 키로 */
  const cleaner = serviceKey ? hunsu : supabase
  await cleaner.from('point_ledger').delete().eq('student_id', student.id)
  await cleaner.from('audit_log').delete().eq('detail->>student_id', student.id)
  await cleaner.from('homework_submissions').delete().eq('student_id', student.id)
  await cleaner.from('study_sessions').delete().eq('student_id', student.id)
  await cleaner.from('study_logs').delete().eq('student_id', student.id)
  await cleaner.from('attendance_sessions').delete().eq('student_id', student.id)
  await cleaner.from('students').delete().eq('id', student.id)
}

const left = await run(supabase.from('students').select('id').eq('id', student.id))
check('검증용 학생 정리됨', (left ?? []).length === 0, left?.length)
const leftAtt = serviceKey ? await run(hunsu.from('attendance_sessions').select('id').eq('student_id', student.id)) : null
if (leftAtt) check('검증용 출결 정리됨', leftAtt.length === 0, leftAtt.length)

console.log(failed === 0 ? 'ALL CHECKS PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
