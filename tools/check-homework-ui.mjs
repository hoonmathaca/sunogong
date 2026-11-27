/**
 * 숙제 공부 사진 인증 · 관리자 숙제관리 — 실서비스 화면 확인 (360px, 개발용)
 *   node tools/check-homework-ui.mjs [url] [screenshot-dir]
 * 확인하는 것
 *   · 학생: 숙제 공부 종료 → 「숙제 공부 제출」 창(확정 안내 문구·사진 고르기·문제 수) → 제출 → 승인 대기 안내
 *   · 학생 홈: 숙제 제출 목록에 승인 대기 → (승인 뒤) 승인 표시
 *   · 관리자: 상단 탭 「숙제관리」와 배지 → 제출 상세(사진·시간·숙제 수·승인/반려·반려 사유) → 확인(저장)
 * 검증용 학생·기록·사진은 끝나고 지운다.
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

/* 1x1 PNG — 숙제 사진으로 올릴 파일 */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** 한마디 없는 승인 건을 만들 때 쓰는 사진 한 장 */
const uploadExtraPhoto = async () => {
  const path = `${student.id}/check/${Date.now()}-extra.png`
  const { error } = await supabase.storage.from('homework-photos').upload(path, PNG_1PX, {
    contentType: 'image/png',
    upsert: false,
  })
  if (error) throw new Error(`사진 올리기 실패: ${error.message}`)
  return path
}

const code = String(Math.floor(1000 + Math.random() * 8999))
const student = await run(
  supabase.from('students').insert({ name: '검증화면', code, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id}`)

/* 이미 25분 공부한 숙제 세션을 만들어 두고, 학생이 이어서 마무리하는 것처럼 연다 */
const session = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'homework' }))
await run(
  supabase
    .from('study_sessions')
    .update({
      started_at: new Date(Date.now() - 25 * 60_000).toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    })
    .eq('id', session.id),
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

  /* ── 학생: 코드 입력 → 숙제 타이머(이어서) → 제출 ───────────────── */
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  for (const digit of code) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
  await page.getByRole('button', { name: '확인', exact: true }).click()
  await page.waitForTimeout(1200)

  check('학생: 숙제 타이머로 이어짐', await page.getByText('숙제 공부는 화면을 끄거나 나가면 멈춰요').first().isVisible())

  /* 질문 창의 사진 찍기·앨범에서도 같은 방식(투명 input)으로 열린다 */
  await page.getByRole('button', { name: '선오공에게 질문하기' }).first().click()
  const askModal = page.getByRole('dialog', { name: '선오공에게 질문하기' })
  await askModal.waitFor({ state: 'visible', timeout: 8000 })
  const askCamera = askModal.locator('[data-photo-capture="camera"]')
  const askAlbum = askModal.locator('input[data-photo-input="album"]')
  check(
    '질문: 사진 찍기는 앱 카메라 버튼(폰 카메라 앱 input 없음)',
    (await askCamera.count()) === 1 && (await askModal.locator('input[data-photo-input="camera"]').count()) === 0,
  )
  await askCamera.click()
  const askCameraDialog = page.getByRole('dialog', { name: '사진 찍기' })
  await askCameraDialog.waitFor({ state: 'visible', timeout: 8000 })
  await page.waitForSelector('[data-inapp-camera="error"]', { timeout: 12000 })
  check(
    '질문: 카메라를 못 열면 이유·사진 선택기 안내',
    ((await askCameraDialog.innerText()).replace(/\s+/g, ' ')).includes('사진 선택기로 고르기'),
  )
  const [askChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
    askCameraDialog.locator('input[data-photo-input="camera-fallback"]').click({ position: { x: 10, y: 10 } }),
  ])
  check('질문: 카메라가 없으면 사진 선택기로 이어짐', Boolean(askChooser))
  if (askChooser) await askChooser.setFiles([]).catch(() => {})
  check('질문: 앨범은 여러 장(multiple)', await askAlbum.evaluate((el) => el.hasAttribute('multiple') && el.getAttribute('capture') === null))
  /* 카메라 창만 닫고(제출·질문 창은 그대로) 질문 창을 닫는다 */
  await askCameraDialog.getByRole('button', { name: '닫기' }).last().click()
  await askCameraDialog.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  await page.getByRole('button', { name: '종료', exact: true }).click()
  await page.getByRole('button', { name: '마칠래요' }).click()

  const submitModal = page.getByRole('dialog', { name: '숙제 공부 제출' })
  await submitModal.waitFor({ state: 'visible', timeout: 8000 })
  const modalText = (await submitModal.innerText()).replace(/\s+/g, ' ')
  check('학생: 제출 창 제목', modalText.includes('숙제 공부 제출'))
  check('학생: 확정 안내 문구', modalText.includes('오늘 공부한 페이지를 찍어올리고 푼 문제수를 적어주세요'))
  check('학생: 사진 고르기 자리', modalText.includes('공부한 페이지 사진') && modalText.includes('0/5'))
  check('학생: 승인 안내', modalText.includes('선생님이 확인한 뒤 오늘 기록에 들어가요'))
  check('학생: 제출 버튼', modalText.includes('제출'))
  await submitModal.screenshot({ path: `${shotDir}/sunogong-homework-picker-empty-360.png` })

  /* 📷 바로 찍기 / 🖼️ 앨범에서 고르기 — 두 버튼과 input 속성, 몇 번을 다시 눌러도 열리는지 */
  const cameraButton = submitModal.locator('[data-photo-capture="camera"]')
  const albumInput = submitModal.locator('input[data-photo-input="album"]')
  check('학생: 바로 찍기 버튼', modalText.includes('📷 바로 찍기'))
  check('학생: 앨범에서 고르기 버튼', modalText.includes('🖼️ 앨범에서 고르기'))
  check(
    '학생: 바로 찍기는 앱 카메라 버튼(폰 카메라 앱 input 없음)',
    (await cameraButton.count()) === 1 && (await submitModal.locator('input[data-photo-input="camera"]').count()) === 0,
  )
  check('학생: 바로 찍기 버튼이 보임', await cameraButton.isVisible())
  const albumAttrs = await albumInput.evaluate((el) => ({
    accept: el.accept,
    capture: el.getAttribute('capture'),
    multiple: el.hasAttribute('multiple'),
    display: getComputedStyle(el).display,
  }))
  check('학생: 앨범 input 은 여러 장(multiple)', albumAttrs.multiple && albumAttrs.capture === null, JSON.stringify(albumAttrs))
  const boxes = await Promise.all(
    [
      ['camera', '[data-photo-capture="camera"]'],
      ['album', 'input[data-photo-input="album"]'],
    ].map(async ([name, selector]) => {
      const box = await submitModal.locator(selector).boundingBox()
      return box ? { name, left: Math.round(box.x), right: Math.round(box.x + box.width), height: Math.round(box.height) } : { name }
    }),
  )
  check(
    '학생: 360px 안에서 두 버튼이 나란히·잘리지 않음',
    boxes.every((box) => box.right !== undefined && box.left >= 0 && box.right <= 360 && box.height >= 40),
    JSON.stringify(boxes),
  )

  /* 같은 버튼을 여러 번 눌러도 파일 선택기가 계속 열린다 (뒤로가기·앱 전환 뒤 다시 열리지 않던 문제) */
  let reopen = 0
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null),
      albumInput.click({ position: { x: 10, y: 10 } }),
    ])
    if (chooser) {
      reopen += 1
      await chooser.setFiles([]).catch(() => {})
    }
  }
  check('학생: 앨범 버튼을 세 번 다시 눌러도 매번 열림', reopen === 3, `${reopen}/3`)
  let cameraOpen = 0
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await cameraButton.click()
    const opened = await page
      .getByRole('dialog', { name: '사진 찍기' })
      .waitFor({ state: 'visible', timeout: 6000 })
      .then(() => true)
      .catch(() => false)
    if (opened) cameraOpen += 1
    await page.waitForSelector('[data-inapp-camera="error"]', { timeout: 12000 }).catch(() => {})
    await page.getByRole('dialog', { name: '사진 찍기' }).getByRole('button', { name: '닫기' }).last().click().catch(() => {})
    await page.waitForTimeout(500)
  }
  check('학생: 바로 찍기 버튼도 다시 눌러 열림(앱 카메라 창)', cameraOpen === 2, `${cameraOpen}/2`)

  await albumInput.setInputFiles([{ name: 'homework.png', mimeType: 'image/png', buffer: PNG_1PX }])
  await page.waitForTimeout(600)
  const afterPhoto = (await submitModal.innerText()).replace(/\s+/g, ' ')
  check('학생: 사진 1장 담김', afterPhoto.includes('1/5'))
  check('학생: 사진 미리 보기', (await submitModal.locator('img').count()) >= 1)

  await page.screenshot({ path: `${shotDir}/sunogong-homework-submit-360.png`, fullPage: false })

  /* 다섯 장을 다 담으면 두 버튼이 잠기고 안내가 바뀐다 (합쳐서 5장 제한) */
  const fourMore = Array.from({ length: 4 }, (_, index) => ({
    name: `homework-${index + 2}.png`,
    mimeType: 'image/png',
    buffer: PNG_1PX,
  }))
  await albumInput.setInputFiles(fourMore)
  await page.waitForTimeout(500)
  const fullText = (await submitModal.innerText()).replace(/\s+/g, ' ')
  check('학생: 다섯 장이면 5/5', fullText.includes('5/5'))
  check('학생: 다섯 장이면 두 버튼 잠김', (await cameraButton.isDisabled()) && (await albumInput.isDisabled()))
  check('학생: 다섯 장이면 바꾸는 방법 안내', fullText.includes('5장을 다 담았어요'))
  check('학생: 합쳐서 다섯 장만 담김', (await submitModal.locator('img').count()) === 5)
  await submitModal.screenshot({ path: `${shotDir}/sunogong-homework-picker-full-360.png` })

  /* 하나씩 빼서 다시 한 장만 남긴다 */
  for (let index = 0; index < 4; index += 1) {
    await submitModal.getByRole('button', { name: '1번 사진 빼기' }).click()
    await page.waitForTimeout(150)
  }
  const oneLeft = (await submitModal.innerText()).replace(/\s+/g, ' ')
  check('학생: 사진을 빼면 다시 고를 수 있음', oneLeft.includes('1/5') && !(await albumInput.isDisabled()))
  await submitModal.screenshot({ path: `${shotDir}/sunogong-homework-picker-360.png` })

  for (const digit of ['3', '0']) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
  await page.getByRole('button', { name: '제출', exact: true }).click()
  await page.waitForTimeout(2500)

  const resultText = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  check('학생: 제출 결과 안내', resultText.includes('선생님 확인을 기다려요'))
  check('학생: 오늘 기록(승인된 것)', resultText.includes('오늘 기록(승인된 것)'))

  const submission = await run(
    supabase.from('homework_submissions').select('*').eq('student_id', student.id).single(),
  )
  check('저장: 승인 대기 한 줄', [submission.status, submission.submitted_minutes, submission.submitted_problems], ['pending', 25, 30])
  check('저장: 사진 1장', submission.photo_paths.length, 1)
  check('저장: 기록에는 아직 없음', (await supabase.from('study_logs').select('id').eq('student_id', student.id)).data?.length === 0)

  await page.getByRole('button', { name: '홈으로' }).click()
  await page.waitForTimeout(1500)
  const homeText = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  check('학생 홈: 숙제 제출 목록', homeText.includes('숙제 제출'))
  check('학생 홈: 승인 대기 표시', homeText.includes('승인 대기'))
  await page.getByRole('heading', { name: '숙제 제출' }).scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${shotDir}/sunogong-homework-student-status-360.png`, fullPage: false })

  /* ── 관리자: 숙제관리 탭 → 상세 → 확인(저장) ─────────────────────── */
  const admin = await context.newPage()
  await admin.goto(`${base}/admin`, { waitUntil: 'networkidle' })
  await admin.waitForTimeout(600)
  if (await admin.getByLabel('관리자 비밀번호').isVisible().catch(() => false)) {
    await admin.getByLabel('관리자 비밀번호').fill(adminPassword)
    await admin.getByRole('button', { name: '입장' }).click()
    await admin.waitForTimeout(800)
  }
  const navText = (await admin.locator('nav').innerText()).replace(/\s+/g, ' ')
  check('관리자: 상단 탭에 숙제관리', navText.includes('숙제관리'))
  /* 대기 건수는 실제 학생 제출까지 포함될 수 있어 1건 이상인지만 본다 (검증 학생 몫은 반드시 들어 있다) */
  check('관리자: 숙제관리 배지(1 이상)', /숙제관리\s*[1-9]/.test(navText), navText)

  await admin.getByRole('button', { name: /숙제관리/ }).first().click()
  await admin.waitForTimeout(1500)
  const panelText = (await admin.locator('main').innerText()).replace(/\s+/g, ' ')
  check('관리자: 숙제관리 제목', panelText.includes('숙제 제출 확인'))
  check('관리자: 대기 목록에 학생', panelText.includes('검증화면'))
  check('관리자: 필터(승인 대기·승인·반려·전체)', ['승인 대기', '승인', '반려', '전체'].every((word) => panelText.includes(word)))
  await admin.screenshot({ path: `${shotDir}/sunogong-homework-admin-list-360.png`, fullPage: false })

  await admin.getByRole('button', { name: /검증화면/ }).first().click()
  await admin.waitForTimeout(1200)
  const detail = admin.getByRole('dialog', { name: '숙제 제출 확인' })
  await detail.waitFor({ state: 'visible', timeout: 8000 })
  const detailText = (await detail.innerText()).replace(/\s+/g, ' ')
  check('상세: 학생·날짜', detailText.includes('검증화면'))
  check('상세: 공부 시각', detailText.includes('공부 시각') && detailText.includes('시작'))
  check('상세: 제출 시간 25분', detailText.includes('25분'))
  check('상세: 제출 숙제 30개', detailText.includes('제출 숙제 수') && detailText.includes('숙제 30개'))
  check('상세: 시간 승인/반려', detailText.includes('공부 시간') && detailText.includes('반려(0)'))
  check('상세: 숙제 수 승인/반려', detailText.includes('숙제 수'))
  check('상세: 모두 승인·모두 반려', detailText.includes('모두 승인') && detailText.includes('모두 반려'))
  check('상세: 반려 사유 칩', ['풀이 흔적 부족', '답만 작성됨', '사진 식별 불가'].every((chip) => detailText.includes(chip)))
  check('상세: 선생님 칭찬 한마디 칸(선택)', detailText.includes('선생님 칭찬 한마디') && detailText.includes('(선택 · 학생에게 보여요)'))
  check('상세: 칭찬 칩 다섯 개', ['풀이가 꼼꼼해요', '글씨가 깔끔해요', '어려운 문제 잘 고민했어요', '꾸준히 잘하고 있어요', '스스로 잘 풀었어요'].every((chip) => detailText.includes(chip)))
  check('상세: 비워 두면 예전처럼 승인 안내', detailText.includes('비워 두면 한마디 없이 예전처럼 승인돼요'))
  /* 사진은 서명 URL 로 늦게 뜰 수 있다 — 잠깐 기다렸다 센다 */
  await detail.locator('img').first().waitFor({ state: 'visible', timeout: 6000 }).catch(() => {})
  const detailPhotos = await detail.locator('img').count()
  check('상세: 사진 1장', detailText.includes('숙제 사진') && detailPhotos >= 1, `${detailPhotos}장`)
  await admin.screenshot({ path: `${shotDir}/sunogong-homework-admin-detail-360.png`, fullPage: false })

  /* 칭찬 한마디 — 칩을 누르고 직접 한마디를 덧붙인다 */
  const praiseChip = detail.getByRole('button', { name: '풀이가 꼼꼼해요', exact: true })
  await praiseChip.click()
  await admin.waitForTimeout(200)
  const praiseBox = detail.locator('textarea').first()
  await praiseBox.fill('풀이가 꼼꼼해요 다음에도 이렇게 해봐요!')
  await admin.waitForTimeout(200)
  check('상세: 칩이 눌린 상태로 보임', (await praiseChip.getAttribute('aria-pressed')) === 'true')
  check('상세: 칭찬 입력칸에 글이 들어감', (await praiseBox.inputValue()) === '풀이가 꼼꼼해요 다음에도 이렇게 해봐요!')
  await detail.screenshot({ path: `${shotDir}/sunogong-homework-praise-editor-360.png` })

  /* 사진 크게 보기 (좌우 넘기기) */
  await detail.locator('button:has(img)').first().click()
  await admin.waitForTimeout(500)
  const pagerText = (await admin.locator('[data-swipe-ignore="photo-pager"]').innerText()).replace(/\s+/g, ' ')
  check('상세: 사진 크게 보기', pagerText.includes('1 / 1') && pagerText.includes('닫기'))
  await admin.getByRole('button', { name: '닫기' }).last().click()
  await admin.waitForTimeout(400)

  /* 360px 에서는 내용이 길어 저장 버튼이 창 아래쪽에 있다 — 창을 끝까지 내린 뒤 누른다 */
  await detail.evaluate((node) => node.scrollTo(0, node.scrollHeight))
  await admin.waitForTimeout(300)
  await detail.getByRole('button', { name: '확인(저장)' }).click()
  await admin.waitForTimeout(2500)
  const afterReview = (await admin.locator('body').innerText()).replace(/\s+/g, ' ')
  check('관리자: 저장 결과 안내', afterReview.includes('승인했어요'))
  /* 다른 학생의 대기 건이 남아 있으면 창이 다음 학생으로 넘어간다 — 검증 학생 몫만 사라졌는지 본다 */
  check('관리자: 저장 뒤 검증 학생은 대기 목록에서 사라짐', !afterReview.includes('검증화면'))

  const reviewed = await run(
    supabase.from('homework_submissions').select('*').eq('id', submission.id).single(),
  )
  check('저장: 승인 상태', [reviewed.status, reviewed.time_verdict, reviewed.problems_verdict], ['approved', 'approved', 'approved'])
  check('저장: 승인된 값', [reviewed.approved_minutes, reviewed.approved_problems], [25, 30])
  check('저장: 선생님 한마디가 그대로', reviewed.teacher_comment, '풀이가 꼼꼼해요 다음에도 이렇게 해봐요!')
  /* 다음 대기 학생이 남아 있으면 확인 창이 열린 채다 — Esc 로 닫고 승인 목록으로 */
  await admin.keyboard.press('Escape')
  await admin.waitForTimeout(500)
  await admin.getByRole('button', { name: /^승인\s*\d/ }).first().click()
  await admin.waitForTimeout(1200)
  const approvedPanel = (await admin.locator('main').innerText()).replace(/\s+/g, ' ')
  check('관리자: 승인 목록에도 한마디 보임', approvedPanel.includes('풀이가 꼼꼼해요 다음에도 이렇게 해봐요!'), approvedPanel.slice(0, 200))
  await admin.screenshot({ path: `${shotDir}/sunogong-homework-admin-approved-360.png`, fullPage: false })

  /* 처리 완료 건을 다시 열어도 칭찬 한마디가 보인다 */
  await admin.getByRole('button', { name: /검증화면/ }).first().click()
  await admin.waitForTimeout(1200)
  const doneDetail = admin.getByRole('dialog', { name: '숙제 제출 확인' })
  await doneDetail.waitFor({ state: 'visible', timeout: 8000 })
  const doneText = (await doneDetail.innerText()).replace(/\s+/g, ' ')
  check('상세: 이미 승인한 건에도 한마디 보임', doneText.includes('선생님 한마디:') && doneText.includes('풀이가 꼼꼼해요 다음에도 이렇게 해봐요!'), doneText.slice(0, 200))
  check('상세: 처리 완료 안내', doneText.includes('이미 확인한 제출이에요'))
  await doneDetail.screenshot({ path: `${shotDir}/sunogong-homework-praise-approved-detail-360.png` })
  await admin.getByRole('button', { name: '닫기' }).last().click()
  await admin.waitForTimeout(400)
  const log = await run(supabase.from('study_logs').select('*').eq('student_id', student.id).maybeSingle())
  check('저장: 기록에 숙제 25분·30문제', [log?.homework_minutes, log?.homework_problems], [25, 30])
  const after = await run(supabase.from('students').select('dragonball_count').eq('id', student.id).single())
  check('저장: 드래곤볼은 주지 않음(별개)', after.dragonball_count === 0, after.dragonball_count)
  const { count: grantRows } = await supabase
    .from('dragonball_grants')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', student.id)
  check('저장: 드래곤볼 지급 이력 없음', grantRows === 0, grantRows)

  /* 홈에서 승인 표시 확인 (앱을 새로 열면 코드를 다시 넣는다) */
  await page.bringToFront()
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  for (const digit of code) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
  await page.getByRole('button', { name: '확인', exact: true }).click()
  await page.waitForTimeout(1800)
  const homeAfter = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  check('학생 홈: 승인 표시', homeAfter.includes('숙제 제출') && /승인(?!\s*대기)/.test(homeAfter), homeAfter.slice(0, 160))
  check('학생 홈: 민트색 선생님 한마디 박스', homeAfter.includes('선생님 한마디:') && homeAfter.includes('풀이가 꼼꼼해요 다음에도 이렇게 해봐요!'))
  check('학생 홈: 한마디 박스는 승인 건에만 1개', (homeAfter.match(/선생님 한마디:/g) ?? []).length === 1)
  const praiseColor = await page
    .locator('li', { hasText: '선생님 한마디:' })
    .first()
    .evaluate((el) => {
      const box = Array.from(el.querySelectorAll('p')).find((node) => node.textContent?.includes('선생님 한마디:'))
      return box ? getComputedStyle(box).backgroundColor : ''
    })
  check('학생 홈: 한마디 박스는 연두/민트색', praiseColor === 'rgb(233, 250, 240)', praiseColor)
  await page.getByRole('heading', { name: '숙제 제출' }).scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${shotDir}/sunogong-homework-student-approved-360.png`, fullPage: false })
  await page.screenshot({ path: `${shotDir}/sunogong-homework-praise-360.png`, fullPage: false })

  /* 한마디가 없는 승인 건은 박스 없이 (서버에 바로 한 건 더 만들어 확인) */
  const session2 = await run(supabase.rpc('start_session', { p_student_id: student.id, p_kind: 'homework' }))
  await run(
    supabase
      .from('study_sessions')
      .update({ started_at: new Date(Date.now() - 10 * 60_000).toISOString(), last_heartbeat_at: new Date().toISOString() })
      .eq('id', session2.id),
  )
  const extra = await run(
    supabase.rpc('submit_homework', {
      p_session_id: session2.id,
      p_problems: 3,
      p_photo_paths: [await uploadExtraPhoto()],
    }),
  )
  await run(
    supabase.rpc('review_homework_submission', {
      p_submission_id: extra.submission_id,
      p_time_approved: true,
      p_problems_approved: true,
      p_reject_reason: null,
    }),
  )
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  for (const digit of code) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
  await page.getByRole('button', { name: '확인', exact: true }).click()
  await page.waitForTimeout(1800)
  const homeTwo = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  check('학생 홈: 승인 두 건이 보임', (homeTwo.match(/승인/g) ?? []).length >= 2, homeTwo.slice(0, 160))
  check('학생 홈: 한마디 없는 건은 박스 없음(여전히 1개)', (homeTwo.match(/선생님 한마디:/g) ?? []).length === 1)
} finally {
  if (browser) await browser.close()
  await supabase.from('homework_submissions').delete().eq('student_id', student.id)
  await supabase.from('study_logs').delete().eq('student_id', student.id)
  await supabase.from('study_sessions').delete().eq('student_id', student.id)
  await supabase.from('dragonball_grants').delete().eq('student_id', student.id)
  await supabase.from('students').delete().eq('id', student.id)
  const { data: files } = await supabase.storage.from('homework-photos').list(`${student.id}`)
  for (const folder of files ?? []) {
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
  check('정리: 검증용 데이터 0건', leftStudents === 0 && leftSubs === 0 && (leftovers?.length ?? 0) === 0, {
    leftStudents,
    leftSubs,
    leftovers: leftovers?.length ?? 0,
  })
}

console.log(failed === 0 ? 'ALL HOMEWORK UI CHECKS PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
