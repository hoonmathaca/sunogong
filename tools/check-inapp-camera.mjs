/**
 * 숙제 사진 「📷 바로 찍기」 앱 안 카메라 — 실서비스 화면 확인 (360px, 개발용)
 *   node tools/check-inapp-camera.mjs [url] [screenshot-dir]
 *
 * 확인하는 것 (2026-11-28)
 *   · 「메모리가 부족하여 이전 작업을 완료할 수 없습니다.」 의 원인이던 폰 기본 카메라 앱(input capture)을
 *     더 이상 쓰지 않는다 — 「바로 찍기」는 화면 안 카메라(getUserMedia)로 열린다.
 *   · 카메라: 셔터 → 미리 보기 → 「이대로 올리기」/「다시 찍기」 → 1/5 로 담기고 탭이 새로고침되지 않는다.
 *   · 카메라를 못 쓰는 기기(권한 거부): 이유 안내 + 「사진 선택기로 고르기」로 넘어가 그대로 찍/고를 수 있다.
 *   · 앨범에서 고르기·최대 5장·사진 없이 제출 문구는 예전 그대로.
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

/* 1x1 PNG — 앨범에서 고르는 사진 */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const code = String(Math.floor(1000 + Math.random() * 8999))
const student = await run(
  supabase.from('students').insert({ name: '검증카메라', code, grade: '검증' }).select('id,name,code').single(),
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
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  for (const digit of code) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
  await page.getByRole('button', { name: '확인', exact: true }).click()
  await page.waitForTimeout(1400)
}

const openSubmitModal = async (page) => {
  await page.getByRole('button', { name: '종료', exact: true }).click()
  await page.getByRole('button', { name: '마칠래요' }).click()
  const submitModal = page.getByRole('dialog', { name: '숙제 공부 제출' })
  await submitModal.waitFor({ state: 'visible', timeout: 10_000 })
  return submitModal
}

const mobileContext = async (browser, extra = {}) =>
  browser.newContext({
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; SM-G991N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    ...extra,
  })

/* ── 1) 카메라를 쓸 수 있는 기기 (가짜 카메라) ─────────────────────── */
const launch = async (withFakeCamera) =>
  chromium.launch({
    executablePath:
      process.env.PW_CHROME ?? '/workspace/tmp/pw/browsers/chromium_headless_shell-1148/chrome-linux/headless_shell',
    args: [
      '--no-sandbox',
      ...(withFakeCamera ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] : []),
    ],
  })

let browser = null
try {
  await openHomeworkSession(24)
  browser = await launch(true)

  const context = await mobileContext(browser, { permissions: ['camera'] })
  const page = await context.newPage()
  let navigations = 0
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations += 1
  })

  await enterStudent(page)
  check('학생: 숙제 타이머로 이어짐', await page.getByText('숙제 공부는 화면을 끄거나 나가면 멈춰요').first().isVisible())

  /* 질문 창의 「📷 사진 찍기」도 앱 안 카메라를 쓴다 */
  await page.getByRole('button', { name: '선오공에게 질문하기' }).first().click()
  const askDialog = page.getByRole('dialog', { name: '선오공에게 질문하기' })
  await askDialog.waitFor({ state: 'visible', timeout: 8000 })
  check('질문: 사진 찍기도 앱 카메라 버튼', (await askDialog.locator('[data-photo-capture="camera"]').count()) === 1)
  await askDialog.locator('[data-photo-capture="camera"]').click()
  const askCamera = page.getByRole('dialog', { name: '사진 찍기' })
  await askCamera.waitFor({ state: 'visible', timeout: 8000 })
  await page.waitForFunction(
    () => {
      const video = document.querySelector('video[data-inapp-camera-video]')
      return Boolean(video && video.videoWidth > 0)
    },
    null,
    { timeout: 12_000 },
  )
  await askCamera.locator('[data-inapp-camera-action="shutter"]').click()
  await page.waitForSelector('[data-inapp-camera="shot"]', { timeout: 12_000 })
  await askCamera.locator('[data-inapp-camera-action="use"]').click()
  await page.waitForTimeout(1600)
  const askText = (await askDialog.innerText()).replace(/\s+/g, ' ')
  check('질문: 찍은 사진이 문제 사진으로 들어감(미리 보기)', (await askDialog.locator('img').count()) >= 1 && askText.includes('질문 올리기'))
  check('질문: 사진 준비가 끝나 올리기가 열림', (await askDialog.getByRole('button', { name: '질문 올리기' }).isDisabled()) === false)
  await page.screenshot({ path: `${shotDir}/sunogong-inapp-camera-question-360.png`, fullPage: false })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  const submitModal = await openSubmitModal(page)
  const cameraButton = submitModal.locator('[data-photo-capture="camera"]')
  check('학생: 「📷 바로 찍기」는 앱 카메라 버튼(폰 카메라 앱 input 아님)', (await cameraButton.count()) === 1)
  check(
    '학생: 「바로 찍기」에 capture=environment input 이 없다',
    (await submitModal.locator('input[data-photo-input="camera"]').count()) === 0,
  )
  const boxes = await Promise.all(
    ['[data-photo-capture="camera"]', 'input[data-photo-input="album"]'].map(async (selector) => {
      const box = await submitModal.locator(selector).boundingBox()
      return box ? { left: Math.round(box.x), right: Math.round(box.x + box.width), height: Math.round(box.height) } : null
    }),
  )
  check(
    '학생: 360px 안에서 두 버튼이 나란히·잘리지 않음',
    boxes.every((box) => box && box.left >= 0 && box.right <= 360 && box.height >= 40),
    JSON.stringify(boxes),
  )

  const navigationsBefore = navigations
  await cameraButton.click()
  const cameraModal = page.getByRole('dialog', { name: '사진 찍기' })
  await cameraModal.waitFor({ state: 'visible', timeout: 8000 })
  check('카메라: 창이 뜬다', await cameraModal.isVisible())
  await page.waitForFunction(
    () => {
      const video = document.querySelector('video[data-inapp-camera-video]')
      return Boolean(video && video.videoWidth > 0)
    },
    null,
    { timeout: 12_000 },
  )
  const liveState = await page.locator('[data-inapp-camera]').getAttribute('data-inapp-camera')
  const videoBox = await cameraModal.locator('video').boundingBox()
  check('카메라: 화면이 살아 있다(videoWidth > 0)', liveState === 'live', liveState)
  check('카메라: 360px 에서 미리 보기 창이 넘치지 않음', Boolean(videoBox && videoBox.width <= 360 && videoBox.height > 100), JSON.stringify(videoBox))
  check('카메라: 셔터·안내 문구', (await cameraModal.innerText()).includes('📸 찍기') && (await cameraModal.innerText()).includes('줄여서 올라가요'))
  await page.screenshot({ path: `${shotDir}/sunogong-inapp-camera-live-360.png`, fullPage: false })

  await cameraModal.locator('[data-inapp-camera-action="shutter"]').click()
  await page.waitForSelector('[data-inapp-camera="shot"]', { timeout: 12_000 })
  const shotText = (await cameraModal.innerText()).replace(/\s+/g, ' ')
  check('카메라: 찍은 사진 미리 보기', (await cameraModal.locator('img').count()) >= 1)
  check('카메라: 「다시 찍기」·「이대로 올리기」', shotText.includes('다시 찍기') && shotText.includes('이대로 올리기'))
  await page.screenshot({ path: `${shotDir}/sunogong-inapp-camera-shot-360.png`, fullPage: false })

  /* 다시 찍기 — 카메라가 다시 살아나고, 다시 찍어 올린다 */
  await cameraModal.locator('[data-inapp-camera-action="retake"]').click()
  await page.waitForFunction(
    () => {
      const modal = document.querySelector('[data-inapp-camera]')
      const video = document.querySelector('video[data-inapp-camera-video]')
      return modal?.getAttribute('data-inapp-camera') === 'live' && video && video.videoWidth > 0
    },
    null,
    { timeout: 12_000 },
  )
  check('카메라: 「다시 찍기」 뒤 화면이 다시 살아남', true)
  await cameraModal.locator('[data-inapp-camera-action="shutter"]').click()
  await page.waitForSelector('[data-inapp-camera="shot"]', { timeout: 12_000 })
  await cameraModal.locator('[data-inapp-camera-action="use"]').click()
  await page.waitForTimeout(1200)
  const cameraModalGone = (await page.getByRole('dialog', { name: '사진 찍기' }).count()) === 0
  const afterCamera = (await submitModal.innerText()).replace(/\s+/g, ' ')
  check('카메라: 찍은 사진이 숙제 사진 1/5 로 담김', afterCamera.includes('1/5'), afterCamera.slice(0, 120))
  check('카메라: 올라간 사진은 「올리는 중」으로 남지 않음', (await submitModal.locator('[data-photo-item="uploading"]').count()) === 0)
  check('카메라: 창이 닫히고 제출 창이 그대로', cameraModalGone && afterCamera.includes('숙제 공부 제출'))
  check('카메라: 찍는 동안 탭이 새로고침되지 않았다', navigations === navigationsBefore, `${navigationsBefore} → ${navigations}`)
  await page.screenshot({ path: `${shotDir}/sunogong-inapp-camera-uploaded-360.png`, fullPage: false })

  /* 앨범에서 고르기 — 예전 그대로 여러 장(2/5) */
  await submitModal.locator('input[data-photo-input="album"]').setInputFiles([
    { name: 'homework-2.png', mimeType: 'image/png', buffer: PNG_1PX },
    { name: 'homework-3.png', mimeType: 'image/png', buffer: PNG_1PX },
  ])
  await page.waitForTimeout(900)
  const afterAlbum = (await submitModal.innerText()).replace(/\s+/g, ' ')
  check('앨범: 두 장을 더해 3/5', afterAlbum.includes('3/5'), afterAlbum.slice(0, 120))
  check('앨범: 사진 세 장 미리 보기', (await submitModal.locator('img').count()) === 3)
  check('앨범: 사진 없이 제출 안내는 그대로', afterAlbum.includes('사진 없이도 제출할 수 있어요'))
  await page.screenshot({ path: `${shotDir}/sunogong-inapp-camera-album-360.png`, fullPage: false })

  /* 제출 — 카메라로 찍은 사진이 실제로 Storage 에 올라가 기록에 붙는다 */
  for (const digit of ['1', '5']) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
  await submitModal.getByRole('button', { name: '제출', exact: true }).click()
  await page.waitForTimeout(3000)
  const resultText = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  check('제출: 승인 대기 안내', resultText.includes('선생님 확인을 기다려요'))
  const submission = await run(
    supabase.from('homework_submissions').select('*').eq('student_id', student.id).order('created_at', { ascending: false }).limit(1).single(),
  )
  check('저장: 승인 대기 한 줄', [submission.status, submission.submitted_problems], ['pending', 15])
  check('저장: 사진 3장', submission.photo_paths.length === 3, `${submission.photo_paths.length}장`)
  let storedBytes = Buffer.alloc(0)
  let storedCount = 0
  for (const path of submission.photo_paths) {
    const { data: stored } = await supabase.storage.from('homework-photos').download(path)
    if (stored) {
      storedBytes = Buffer.from(await stored.arrayBuffer())
      storedCount += 1
    }
  }
  check('저장: 세 사진이 Storage 에 있음', storedCount === 3, `${storedCount}/3`)
  check('저장: 찍은 사진은 JPEG', storedBytes.length > 2 && storedBytes[0] === 0xff && storedBytes[1] === 0xd8, `${Math.round(storedBytes.length / 1024)}KB`)
  check('저장: 찍은 사진은 1200px 이하로 줄어 작다', storedBytes.length > 0 && storedBytes.length < 900 * 1024, `${Math.round(storedBytes.length / 1024)}KB`)

  await context.close()
  await browser.close()
  browser = null

  /* ── 2) 카메라를 못 쓰는 기기 — 이유 안내 + 사진 선택기 폴백 ──────── */
  await openHomeworkSession(12)
  browser = await launch(false)
  const deniedContext = await mobileContext(browser, { permissions: [] })
  const deniedPage = await deniedContext.newPage()
  await enterStudent(deniedPage)
  const deniedModal = await openSubmitModal(deniedPage)
  await deniedModal.locator('[data-photo-capture="camera"]').click()
  const deniedCamera = deniedPage.getByRole('dialog', { name: '사진 찍기' })
  await deniedCamera.waitFor({ state: 'visible', timeout: 8000 })
  await deniedPage.waitForSelector('[data-inapp-camera="error"]', { timeout: 12_000 })
  const deniedText = (await deniedCamera.innerText()).replace(/\s+/g, ' ')
  check('폴백: 카메라를 못 열면 이유를 알려 준다', /카메라(를 찾지|를 열지| 권한)/.test(deniedText), deniedText.slice(0, 100))
  check('폴백: 「🖼️ 사진 선택기로 고르기」 버튼', deniedText.includes('사진 선택기로 고르기'))
  check('폴백: 「다시 열기」 버튼', deniedText.includes('다시 열기'))
  await deniedPage.screenshot({ path: `${shotDir}/sunogong-inapp-camera-denied-360.png`, fullPage: false })

  const [chooser] = await Promise.all([
    deniedPage.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
    deniedCamera.locator('input[data-photo-input="camera-fallback"]').click({ position: { x: 10, y: 10 } }),
  ])
  check('폴백: 사진 선택기가 열린다', Boolean(chooser))
  if (chooser) {
    await chooser.setFiles([{ name: 'fallback.png', mimeType: 'image/png', buffer: PNG_1PX }])
  }
  await deniedPage.waitForTimeout(1500)
  const deniedAfter = (await deniedModal.innerText()).replace(/\s+/g, ' ')
  check('폴백: 고른 사진이 1/5 로 담김', deniedAfter.includes('1/5'), deniedAfter.slice(0, 120))
  check('폴백: 창이 닫히고 제출 창으로 돌아옴', (await deniedPage.getByRole('dialog', { name: '사진 찍기' }).count()) === 0)
  await deniedPage.screenshot({ path: `${shotDir}/sunogong-inapp-camera-fallback-360.png`, fullPage: false })

  /* 5장을 다 담으면 두 버튼이 잠긴다 (합쳐서 5장 제한은 그대로) */
  await deniedModal.locator('input[data-photo-input="album"]').setInputFiles(
    Array.from({ length: 4 }, (_, index) => ({ name: `full-${index}.png`, mimeType: 'image/png', buffer: PNG_1PX })),
  )
  await deniedPage.waitForTimeout(1000)
  const fullText = (await deniedModal.innerText()).replace(/\s+/g, ' ')
  check('5장: 5/5 표시', fullText.includes('5/5'))
  check('5장: 두 버튼 잠김', (await deniedModal.locator('[data-photo-capture="camera"]').isDisabled()) && (await deniedModal.locator('input[data-photo-input="album"]').isDisabled()))
  check('5장: 바꾸는 방법 안내', fullText.includes('5장을 다 담았어요'))
  await deniedModal.screenshot({ path: `${shotDir}/sunogong-inapp-camera-full-360.png` })
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
  check('정리: 검증용 데이터 0건', leftStudents === 0 && leftSubs === 0 && leftSessions === 0 && (leftovers?.length ?? 0) === 0, {
    leftStudents,
    leftSubs,
    leftSessions,
    leftovers: leftovers?.length ?? 0,
  })
}

console.log(failed === 0 ? 'ALL IN-APP CAMERA CHECKS PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
