/**
 * 숙제 사진 제출 뒤 화면이 멈추던 문제 — 실서비스 화면 확인 (360px, 개발용)
 *   node tools/check-homework-freeze.mjs [url] [screenshot-dir]
 *
 * 2026-11-28 제보: "사진제출 잘되고 마친다음에 화면이 멈춤. 물론 나가기 눌러짐.
 *                    앱을 아예 종료 후에 다시 됨. 뒤로가기로는 안 됨."
 *
 * 원인은 창(모달)마다 따로 body 스크롤 잠금을 저장·복원하던 것. 창이 두 겹(숙제 제출 + 사진 찍기)
 * 으로 뜨면 나중에 뜬 창의 "원래 값(hidden)" 이 먼저 창의 값까지 덮어써서, 둘 다 닫힌 뒤에도
 * body 에 overflow:hidden 이 남았다 → 홈이 스크롤되지 않고(화면이 멈춘 것처럼) 새로 열어야 풀렸다.
 *
 * 확인하는 것
 *   · 창이 떠 있는 동안에는 body 스크롤이 잠긴다 (그대로)
 *   · 사진을 찍어 제출(다시 찍기 포함)한 뒤 결과 → 홈에서 body 잠금이 남지 않는다
 *   · 홈에서 스크롤·달력 날짜·근두운 「바꾸기」·「숙제 공부 시작」·「나가기」가 모두 눌린다
 *   · 사진 없이 제출(확인 창) · 제출 창 취소 후 다시 열기 경로도 잠금이 남지 않는다
 *   · 창을 닫으면 잠금이 풀린다 (겹쳐 열어도)
 *
 * 검증용 학생·세션·제출·사진은 끝나고 지운다(잔여 0건).
 */
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

const code = String(Math.floor(1000 + Math.random() * 8999))
const student = await run(
  supabase.from('students').insert({ name: '검증멈춤', code, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id}`)

/** 이미 조금 공부한 숙제 세션을 만들어 두고, 학생이 이어서 마무리하는 것처럼 연다 */
const openHomeworkSession = async (minutesAgo) => {
  const session = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'homework' }))
  await run(
    supabase
      .from('study_sessions')
      .update({
        started_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
        last_heartbeat_at: new Date().toISOString(),
      })
      .eq('id', session.id),
  )
  return session
}

const enterStudent = async (page) => {
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '확인', exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(400)
  for (const digit of code) await page.getByRole('button', { name: digit, exact: true }).click()
  await page.getByRole('button', { name: '확인', exact: true }).click()
  await page.waitForTimeout(1600)
}

const openSubmitModal = async (page) => {
  await page.getByRole('button', { name: '종료', exact: true }).click()
  await page.getByRole('button', { name: '마칠래요' }).click()
  const modal = page.getByRole('dialog', { name: '숙제 공부 제출' })
  await modal.waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForTimeout(400)
  return modal
}

const openCamera = async (page) => {
  await page.locator('[data-photo-capture="camera"]').click()
  const camera = page.getByRole('dialog', { name: '사진 찍기' })
  await camera.waitFor({ state: 'visible', timeout: 8000 })
  await page.waitForFunction(
    () => {
      const video = document.querySelector('video[data-inapp-camera-video]')
      return Boolean(video && video.videoWidth > 0)
    },
    null,
    { timeout: 12_000 },
  )
  return camera
}

/** body 스크롤 잠금·덮인 창이 남아 있는지 */
const scrollState = (page) =>
  page.evaluate(() => {
    const body = document.body
    const overlays = Array.from(document.querySelectorAll('body *')).filter((el) => {
      const style = getComputedStyle(el)
      return style.position === 'fixed' && Number(style.zIndex) >= 40 && style.display !== 'none'
    })
    return {
      bodyStyle: body.getAttribute('style') ?? '',
      overflow: getComputedStyle(body).overflow,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      locked: getComputedStyle(body).overflow === 'hidden' || getComputedStyle(body).overflowY === 'hidden',
      overlays: overlays.length,
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      canScroll: (document.scrollingElement?.scrollHeight ?? 0) > window.innerHeight + 4,
      fullscreen: Boolean(document.fullscreenElement),
    }
  })

const wheelScroll = async (page) => {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.mouse.move(180, 600)
  await page.mouse.wheel(0, 800)
  await page.waitForTimeout(500)
  const moved = await page.evaluate(() => window.scrollY)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(200)
  return moved
}

/** 홈이 실제로 만져지는지 — 스크롤·달력·바꾸기·숙제 시작 */
const checkHomeWorks = async (page, tag) => {
  const state = await scrollState(page)
  check(`${tag} 홈: body 스크롤 잠금 없음`, !state.locked && state.overlays === 0 && state.dialogs === 0, JSON.stringify(state))
  check(`${tag} 홈: 스크롤이 된다`, (await wheelScroll(page)) > 0)

  /* 달력에서 지난 날짜를 누르면 그 날 상세가 바뀐다 */
  const cell = page.locator('[role="gridcell"]').first()
  await cell.scrollIntoViewIfNeeded()
  const label = (await cell.getAttribute('aria-label')) ?? ''
  await cell.click()
  await page.waitForTimeout(400)
  const detail = await page.evaluate(() => {
    const pressed = document.querySelector('[role="gridcell"][aria-pressed="true"]')
    return pressed?.getAttribute('aria-label') ?? ''
  })
  check(`${tag} 달력: 날짜를 누르면 그 날이 골라진다`, detail === label.replace(/ 오늘$/, '') || detail.startsWith(label.split(' · ')[0]), `${label} → ${detail}`)
  await page.screenshot({ path: `${shotDir}/sunogong-freeze-${tag}-calendar-360.png` })

  /* 근두운 「바꾸기」 창 — 떠 있는 동안은 잠기고, 닫으면 풀린다 */
  await page.getByRole('button', { name: '바꾸기', exact: true }).click()
  const nickname = page.getByRole('dialog').first()
  await nickname.waitFor({ state: 'visible', timeout: 6000 })
  const whileOpen = await scrollState(page)
  check(`${tag} 바꾸기 창: 떠 있는 동안은 스크롤 잠김`, whileOpen.locked, JSON.stringify(whileOpen))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  const afterClose = await scrollState(page)
  check(`${tag} 바꾸기 창: 닫으면 잠금이 풀린다`, !afterClose.locked && afterClose.dialogs === 0, JSON.stringify(afterClose))

  /* 숙제 공부 시작 → 타이머 */
  await page.getByRole('button', { name: /숙제 공부 시작/ }).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: /숙제 공부 시작/ }).click()
  const timerShown = await page
    .getByText('숙제 공부는 화면을 끄거나 나가면 멈춰요')
    .first()
    .waitFor({ state: 'visible', timeout: 12_000 })
    .then(() => true)
    .catch(() => false)
  check(`${tag} 숙제 공부 시작: 타이머로 들어간다`, timerShown)
  const timerState = await scrollState(page)
  check(`${tag} 타이머: 스크롤 잠금 없음`, !timerState.locked, JSON.stringify(timerState))
}

let browser = null
try {
  browser = await chromium.launch({
    executablePath:
      process.env.PW_CHROME ?? '/workspace/tmp/pw/browsers/chromium_headless_shell-1148/chrome-linux/headless_shell',
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  })
  const context = await browser.newContext({
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    permissions: ['camera'],
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; SM-G991N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })
  let page = await context.newPage()
  page.on('pageerror', (error) => console.log('pageerror:', error.message))

  /* 단계마다 새 탭을 쓴다 — 카메라·사진을 여러 번 열어 메모리가 모자라지 않게 */
  const renewPage = async () => {
    await page.close().catch(() => undefined)
    page = await context.newPage()
    page.on('pageerror', (error) => console.log('pageerror:', error.message))
    return page
  }

  /* ── 1) 인앱 카메라로 찍어 제출 (다시 찍기까지) ─────────────────── */
  await openHomeworkSession(24)
  await enterStudent(page)
  check('학생: 숙제 타이머로 이어짐', await page.getByText('숙제 공부는 화면을 끄거나 나가면 멈춰요').first().isVisible())

  const submit = await openSubmitModal(page)
  const lockedWhileOpen = await scrollState(page)
  check('제출 창: 떠 있는 동안은 스크롤 잠김(그대로)', lockedWhileOpen.locked, JSON.stringify(lockedWhileOpen))

  const camera = await openCamera(page)
  const lockedBoth = await scrollState(page)
  check('카메라 창: 두 겹으로 떠도 스크롤 잠김', lockedBoth.locked && lockedBoth.dialogs === 2, JSON.stringify(lockedBoth))

  await camera.locator('[data-inapp-camera-action="shutter"]').click()
  await page.waitForSelector('[data-inapp-camera="shot"]', { timeout: 12_000 })
  await camera.locator('[data-inapp-camera-action="retake"]').click()
  await page.waitForFunction(
    () => {
      const modal = document.querySelector('[data-inapp-camera]')
      const video = document.querySelector('video[data-inapp-camera-video]')
      return modal?.getAttribute('data-inapp-camera') === 'live' && video && video.videoWidth > 0
    },
    null,
    { timeout: 12_000 },
  )
  await camera.locator('[data-inapp-camera-action="shutter"]').click()
  await page.waitForSelector('[data-inapp-camera="shot"]', { timeout: 12_000 })
  await camera.locator('[data-inapp-camera-action="use"]').click()
  await page.waitForTimeout(1800)
  const afterCamera = (await submit.innerText()).replace(/\s+/g, ' ')
  check('카메라: 찍은 사진이 1/5 로 담김', afterCamera.includes('1/5'), afterCamera.slice(0, 100))
  const afterCameraState = await scrollState(page)
  check('카메라: 창이 닫히고 제출 창만 잠금 유지', afterCameraState.locked && afterCameraState.dialogs === 1, JSON.stringify(afterCameraState))

  for (const digit of ['1', '4']) await page.getByRole('button', { name: digit, exact: true }).click()
  await submit.getByRole('button', { name: '제출', exact: true }).click()
  await page.getByRole('button', { name: '홈으로', exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(600)
  const resultText = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  check('제출: 승인 대기 결과 화면', resultText.includes('선생님 확인을 기다려요'))
  const resultState = await scrollState(page)
  check('제출 뒤 결과 화면: 스크롤 잠금 남지 않음', !resultState.locked && resultState.overlays === 0, JSON.stringify(resultState))

  const submission = await run(
    supabase
      .from('homework_submissions')
      .select('*')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
  )
  check('저장: 승인 대기 한 줄·문제 14개·사진 1장', [submission.status, submission.submitted_problems, submission.photo_paths.length], ['pending', 14, 1])

  await page.getByRole('button', { name: '홈으로', exact: true }).click()
  await page.waitForTimeout(2200)
  await page.screenshot({ path: `${shotDir}/sunogong-freeze-1-home-360.png` })
  const homeState = await scrollState(page)
  check('홈: 스크롤 잠금이 남지 않았다 (2026-11-28 제보)', !homeState.locked && homeState.overlays === 0, JSON.stringify(homeState))

  /* 화면에 깔린 것이 없이 실제 요소가 잡히는지 */
  const hits = await page.evaluate(() =>
    [
      [180, 200],
      [180, 520],
      [180, 740],
    ].map(([x, y]) => {
      const el = document.elementFromPoint(x, y)
      return el ? `${el.tagName}:${(el.className || '').toString().slice(0, 24)}` : 'none'
    }),
  )
  check('홈: 화면 위를 덮은 투명 상자가 없다', !hits.some((hit) => hit.startsWith('none')) && hits.length === 3, JSON.stringify(hits))

  /* 나가기 → 코드 화면 → 다시 들어오기 */
  await page.getByRole('button', { name: '나가기', exact: true }).click()
  const codeScreen = await page
    .getByText('코드', { exact: false })
    .first()
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  check('홈: 「나가기」가 눌린다', codeScreen)
  await enterStudent(page)
  await checkHomeWorks(page, '사진제출')

  /* ── 2) 사진 없이 제출 (확인 창을 거치는 경로) ───────────────────── */
  await renewPage()
  await openHomeworkSession(18)
  await enterStudent(page)
  const submit2 = await openSubmitModal(page)
  for (const digit of ['1', '2']) await page.getByRole('button', { name: digit, exact: true }).click()
  await submit2.getByRole('button', { name: '제출', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: '사진 없이 제출할까요?' })
  await confirm.waitFor({ state: 'visible', timeout: 8000 })
  await confirm.getByRole('button', { name: '그래도 제출' }).click()
  await page.getByRole('button', { name: '홈으로', exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(600)
  const afterConfirm = await scrollState(page)
  check('사진 없이 제출: 결과 화면에 잠금 남지 않음', !afterConfirm.locked && afterConfirm.overlays === 0, JSON.stringify(afterConfirm))
  await page.getByRole('button', { name: '홈으로', exact: true }).click()
  await page.waitForTimeout(2200)
  const home2 = await scrollState(page)
  check('사진 없이 제출: 홈에 잠금 남지 않음', !home2.locked, JSON.stringify(home2))
  check('사진 없이 제출: 홈이 스크롤된다', (await wheelScroll(page)) > 0)

  /* ── 3) 제출 창을 취소로 닫았다가 다시 열어서 제출 ──────────────── */
  await renewPage()
  await openHomeworkSession(9)
  await enterStudent(page)
  const submit3 = await openSubmitModal(page)
  await submit3.getByRole('button', { name: '취소', exact: true }).click()
  await page.waitForTimeout(500)
  const afterCancel = await scrollState(page)
  check('제출 창 취소: 잠금이 풀린다', !afterCancel.locked && afterCancel.dialogs === 0, JSON.stringify(afterCancel))
  const submit4 = await openSubmitModal(page)
  check('제출 창 다시 열기: 다시 잠긴다', (await scrollState(page)).locked)
  for (const digit of ['1', '1']) await page.getByRole('button', { name: digit, exact: true }).click()
  await submit4.getByRole('button', { name: '제출', exact: true }).click()
  await page.getByRole('dialog', { name: '사진 없이 제출할까요?' })
    .getByRole('button', { name: '그래도 제출' })
    .click()
  await page.getByRole('button', { name: '홈으로', exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByRole('button', { name: '홈으로', exact: true }).click()
  await page.waitForTimeout(2200)
  const home3 = await scrollState(page)
  check('취소 뒤 다시 제출: 홈에 잠금 남지 않음', !home3.locked, JSON.stringify(home3))
  await page.screenshot({ path: `${shotDir}/sunogong-freeze-3-home-360.png` })

  await context.close()
} finally {
  if (browser) await browser.close()
  await supabase.from('homework_submissions').delete().eq('student_id', student.id)
  await supabase.from('study_logs').delete().eq('student_id', student.id)
  await supabase.from('study_sessions').delete().eq('student_id', student.id)
  await supabase.from('dragonball_grants').delete().eq('student_id', student.id)
  await supabase.from('students').delete().eq('id', student.id)
  const { data: folders } = await supabase.storage.from('homework-photos').list(`${student.id}`)
  for (const folder of folders ?? []) {
    const { data: inner } = await supabase.storage.from('homework-photos').list(`${student.id}/${folder.name}`)
    const paths = (inner ?? []).map((file) => `${student.id}/${folder.name}/${file.name}`)
    if (paths.length > 0) await supabase.storage.from('homework-photos').remove(paths)
  }
  const { data: leftovers } = await supabase.storage.from('homework-photos').list(`${student.id}`)
  const { count: leftStudents } = await supabase.from('students').select('id', { count: 'exact', head: true }).eq('id', student.id)
  const { count: leftSubs } = await supabase
    .from('homework_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', student.id)
  const { count: leftSessions } = await supabase
    .from('study_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', student.id)
  const { count: leftLogs } = await supabase.from('study_logs').select('id', { count: 'exact', head: true }).eq('student_id', student.id)
  check(
    '정리: 검증용 데이터 0건',
    leftStudents === 0 && leftSubs === 0 && leftSessions === 0 && leftLogs === 0 && (leftovers?.length ?? 0) === 0,
    JSON.stringify({ leftStudents, leftSubs, leftSessions, leftLogs, leftovers: leftovers?.length ?? 0 }),
  )
}

console.log(failed === 0 ? 'ALL HOMEWORK FREEZE CHECKS PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
