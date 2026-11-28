/**
 * 이미 승인/반려한 숙제 제출을 다시 고치기 — 실서비스 화면 확인 (360px, 개발용)
 *   node tools/check-homework-rereview.mjs [url] [screenshot-dir]
 * 확인하는 것
 *   · 관리자 숙제관리에서 승인 대기 → 확인(저장) = 승인 (기록 40분·12개)
 *   · 승인 목록에서 다시 열기 → '이미 승인한 제출이에요 — 고쳐서 다시 저장할 수 있어요' +
 *     '지금 기록' + '고쳐서 저장' 버튼 + 지난 결정(승인)이 기본 선택
 *   · 모두 반려로 고쳐 저장 → 그날 기록에서 빠짐(줄 삭제)·반려로 남음·고친 횟수 1
 *   · 반려 목록에서 다시 열기 → 모두 승인으로 고쳐 저장 → 기록 40분·12개 복구·고친 횟수 2
 *   · 시간만 반려로 고침 → 0분·12개 (부분 승인)
 * 검증용 학생·세션·제출·기록은 끝나고 지운다 (실제 학생 데이터는 건드리지 않는다).
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

const STUDENT_NAME = '검증재수정'
const code = String(Math.floor(1000 + Math.random() * 8999))
const student = await run(
  supabase.from('students').insert({ name: STUDENT_NAME, code, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id}`)

/* 40분 공부하고 사진 없이 낸 숙제 (승인 대기) */
const session = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'homework' }))
await run(
  supabase
    .from('study_sessions')
    .update({
      started_at: new Date(Date.now() - 40 * 60_000).toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    })
    .eq('id', session.id),
)
const submission = await run(supabase.rpc('submit_homework', { p_session_id: session.id, p_problems: 12, p_photo_paths: [] }))
const submissionId = submission.submission?.id ?? submission.id
const submissionDate = submission.submission?.date ?? submission.date
console.log(`검증용 제출 ${submissionId} (${submissionDate})`)

const logOf = () =>
  run(supabase.from('study_logs').select('*').eq('student_id', student.id).eq('date', submissionDate).maybeSingle())
const submissionOf = () => run(supabase.from('homework_submissions').select('*').eq('id', submissionId).single())

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
  const admin = await context.newPage()
  await admin.goto(`${base}/admin`, { waitUntil: 'networkidle' })
  await admin.waitForTimeout(700)
  if (await admin.getByLabel('관리자 비밀번호').isVisible().catch(() => false)) {
    await admin.getByLabel('관리자 비밀번호').fill(adminPassword)
    await admin.getByRole('button', { name: '입장' }).click()
    await admin.waitForTimeout(900)
  }
  await admin.getByRole('button', { name: /숙제관리/ }).first().click()
  await admin.waitForTimeout(1600)

  /* 다른 학생의 대기 건이 자동으로 열릴 수 있다 — 우리 검증 학생일 때만 손댄다 */
  const reviewDialog = admin.getByRole('dialog', { name: '숙제 제출 확인' })
  const openMine = async () => {
    const already = await reviewDialog.isVisible().catch(() => false)
    if (already) {
      const text = (await reviewDialog.innerText()).replace(/\s+/g, ' ')
      if (text.includes(STUDENT_NAME)) return reviewDialog
      await admin.keyboard.press('Escape')
      await admin.waitForTimeout(500)
    }
    await admin.getByRole('button', { name: new RegExp(STUDENT_NAME) }).first().click()
    await admin.waitForTimeout(1200)
    await reviewDialog.waitFor({ state: 'visible', timeout: 8000 })
    return reviewDialog
  }

  /* ── 1) 승인 대기 → 확인(저장) = 승인 ───────────────────────────── */
  let dialog = await openMine()
  let text = (await dialog.innerText()).replace(/\s+/g, ' ')
  check('1 상세: 제출 40분·숙제 12개', text.includes('40분') && text.includes('숙제 12개'))
  check('1 상세: 처음 확인이면 다시 고치기 안내 없음', !text.includes('고쳐서 다시 저장할 수 있어요'))
  check('1 상세: 버튼은 확인(저장)', text.includes('확인(저장)'))
  await dialog.evaluate((node) => node.scrollTo(0, node.scrollHeight))
  await admin.waitForTimeout(300)
  await dialog.getByRole('button', { name: '확인(저장)' }).click()
  await admin.waitForTimeout(2500)
  const afterFirst = (await admin.locator('body').innerText()).replace(/\s+/g, ' ')
  check('1 저장: 승인 안내', afterFirst.includes('승인했어요'), afterFirst.slice(-160))
  await admin.keyboard.press('Escape')
  await admin.waitForTimeout(600)

  let row = await submissionOf()
  let log = await logOf()
  check('1 저장: 승인 상태', [row.status, row.time_verdict, row.problems_verdict], ['approved', 'approved', 'approved'])
  check('1 저장: 승인 값', [row.approved_minutes, row.approved_problems], [40, 12])
  check('1 저장: 고친 횟수 0 (처음 확인)', row.review_edit_count, 0)
  check('1 저장: 처음 확인 시각 남음', Boolean(row.first_reviewed_at), row.first_reviewed_at)
  check('1 저장: 그날 기록 40분·12개', [log?.homework_minutes, log?.homework_problems, log?.minutes], [40, 12, 40])

  /* ── 2) 승인 목록에서 다시 열기 → 고치기 화면 ─────────────────────── */
  await admin.getByRole('button', { name: /^승인\s*\d/ }).first().click()
  await admin.waitForTimeout(1200)
  dialog = await openMine()
  text = (await dialog.innerText()).replace(/\s+/g, ' ')
  check('2 다시 열기: 고치기 안내', text.includes('이미 승인한 제출이에요 — 고쳐서 다시 저장할 수 있어요'), text.slice(0, 200))
  check('2 다시 열기: 지금 기록 40분·12개', text.includes('지금 기록:') && text.includes('시간 40분 승인') && text.includes('문항 12문제 승인'))
  check('2 다시 열기: 고친 횟수 0번', text.includes('고친 적 0번'))
  check('2 다시 열기: 기록 반영 안내', text.includes('이전 승인분을 빼고 새 결정을 반영해요'))
  check('2 다시 열기: 버튼은 고쳐서 저장', text.includes('고쳐서 저장'))
  /* 지난 결정(승인·승인)이 기본 선택으로 보인다 */
  const pressed = await dialog.getByRole('button', { name: '승인', exact: true }).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-pressed')),
  )
  check('2 다시 열기: 지난 결정(승인)이 선택돼 있음', pressed.length === 2 && pressed.every((value) => value === 'true'), JSON.stringify(pressed))
  await dialog.screenshot({ path: `${shotDir}/sunogong-rereview-1-open-360.png` })

  /* ── 3) 모두 반려로 고쳐 저장 → 기록에서 빠진다 ──────────────────── */
  await dialog.getByRole('button', { name: '모두 반려' }).click()
  await admin.waitForTimeout(300)
  text = (await dialog.innerText()).replace(/\s+/g, ' ')
  check('3 고치기: 모두 반려 안내', text.includes('모두 반려로 고쳐 저장하면 이 제출의 승인분이 그날 기록에서 빠져요'))
  await dialog.evaluate((node) => node.scrollTo(0, node.scrollHeight))
  await admin.waitForTimeout(300)
  await dialog.getByRole('button', { name: '고쳐서 저장' }).click()
  await admin.waitForTimeout(2500)
  const afterReject = (await admin.locator('body').innerText()).replace(/\s+/g, ' ')
  check('3 저장: 반려로 고쳤다는 안내', afterReject.includes('반려로 고쳤어요. 이전 승인 40분 · 12개를 그날 기록에서 뺐어요.'), afterReject.slice(-200))
  await admin.keyboard.press('Escape')
  await admin.waitForTimeout(600)

  row = await submissionOf()
  log = await logOf()
  check('3 저장: 반려 상태', [row.status, row.time_verdict, row.problems_verdict], ['rejected', 'rejected', 'rejected'])
  check('3 저장: 승인 값 0', [row.approved_minutes, row.approved_problems], [0, 0])
  check('3 저장: 반려 사유 저장', row.reject_reason ?? '', '')
  check('3 저장: 고친 횟수 1', row.review_edit_count, 1)
  check('3 저장: 그날 기록 사라짐', log === null, log ? `${log.minutes}분` : 'null')

  /* ── 4) 반려 목록에서 다시 열어 승인으로 되돌리기 ────────────────── */
  await admin.getByRole('button', { name: /^반려\s*\d/ }).first().click()
  await admin.waitForTimeout(1200)
  dialog = await openMine()
  text = (await dialog.innerText()).replace(/\s+/g, ' ')
  check('4 반려 다시 열기: 안내', text.includes('이미 반려한 제출이에요 — 고쳐서 다시 저장할 수 있어요'))
  check('4 반려 다시 열기: 지금 기록 0', text.includes('지금 기록: 시간 0분 · 문항 0문제'))
  await dialog.getByRole('button', { name: '모두 승인' }).click()
  await admin.waitForTimeout(300)
  await dialog.evaluate((node) => node.scrollTo(0, node.scrollHeight))
  await admin.waitForTimeout(300)
  await dialog.getByRole('button', { name: '고쳐서 저장' }).click()
  await admin.waitForTimeout(2500)
  const afterApprove = (await admin.locator('body').innerText()).replace(/\s+/g, ' ')
  check('4 저장: 승인으로 고쳤다는 안내', afterApprove.includes('승인으로 고쳤어요. 그날 기록: 0분 · 0개 → 40분 · 12개'), afterApprove.slice(-200))
  await admin.keyboard.press('Escape')
  await admin.waitForTimeout(600)

  row = await submissionOf()
  log = await logOf()
  check('4 저장: 승인 상태', [row.status, row.time_verdict, row.problems_verdict], ['approved', 'approved', 'approved'])
  check('4 저장: 고친 횟수 2', row.review_edit_count, 2)
  check('4 저장: 그날 기록 복구 40분·12개', [log?.homework_minutes, log?.homework_problems, log?.minutes, log?.problems], [40, 12, 40, 12])

  /* ── 5) 시간만 반려로 고치기 (부분 승인) ─────────────────────────── */
  await admin.getByRole('button', { name: /^승인\s*\d/ }).first().click()
  await admin.waitForTimeout(1200)
  dialog = await openMine()
  const timeRow = dialog.locator('div').filter({ hasText: /^공부 시간/ }).last()
  await timeRow.getByRole('button', { name: '반려(0)' }).click()
  await admin.waitForTimeout(300)
  await dialog.evaluate((node) => node.scrollTo(0, node.scrollHeight))
  await admin.waitForTimeout(300)
  await dialog.getByRole('button', { name: '고쳐서 저장' }).click()
  await admin.waitForTimeout(2500)
  await admin.keyboard.press('Escape')
  await admin.waitForTimeout(600)
  row = await submissionOf()
  log = await logOf()
  check('5 부분 고침: 시간 반려·문항 승인', [row.status, row.time_verdict, row.problems_verdict], ['approved', 'rejected', 'approved'])
  check('5 부분 고침: 고친 횟수 3', row.review_edit_count, 3)
  check('5 부분 고침: 기록 0분·12개', [log?.homework_minutes, log?.homework_problems, log?.minutes, log?.problems], [0, 0, 0, 12])

  /* 승인 목록 화면 (고친 건이 그대로 보인다) */
  await admin.getByRole('button', { name: /^승인\s*\d/ }).first().click()
  await admin.waitForTimeout(1200)
  await admin.screenshot({ path: `${shotDir}/sunogong-rereview-2-approved-list-360.png`, fullPage: false })

  /* 훈출 등·하원 기록과 드래곤볼은 건드리지 않는다 */
  const after = await run(supabase.from('students').select('dragonball_count').eq('id', student.id).single())
  check('드래곤볼은 그대로(별개)', after.dragonball_count === 0, after.dragonball_count)
  const { count: grantRows } = await supabase
    .from('dragonball_grants')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', student.id)
  check('드래곤볼 지급 이력 없음', grantRows === 0, grantRows)
  const { count: attendanceRows } = await supabase
    .from('attendance_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', student.id)
  check('훈출 등·하원 기록 그대로(0건)', attendanceRows === 0, attendanceRows)
} finally {
  if (browser) await browser.close().catch(() => {})
  /* 검증 데이터 정리 — 남은 0건 */
  await supabase.from('study_logs').delete().eq('student_id', student.id)
  await supabase.from('homework_submissions').delete().eq('student_id', student.id)
  await supabase.from('study_sessions').delete().eq('student_id', student.id)
  await supabase.from('students').delete().eq('id', student.id)
  const left = await run(supabase.from('students').select('id').eq('id', student.id))
  const leftLogs = await run(supabase.from('study_logs').select('id').eq('student_id', student.id))
  const leftSubs = await run(supabase.from('homework_submissions').select('id').eq('student_id', student.id))
  console.log(`정리: 학생 ${left.length} · 기록 ${leftLogs.length} · 제출 ${leftSubs.length}`)
  if (left.length || leftLogs.length || leftSubs.length) failed += 1
  console.log(failed === 0 ? 'ALL REREVIEW CHECKS PASSED' : `${failed} FAILED`)
  process.exit(failed === 0 ? 0 : 1)
}
