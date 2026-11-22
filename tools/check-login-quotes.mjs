/**
 * 배포된 로그인 화면(360px)에서 「오늘의 한줄」 카드를 확인하고 스크린샷을 남긴다 (개발용)
 *   node tools/check-login-quotes.mjs [url] [screenshot path]
 * 확인하는 것: 카드 라벨·명언·출처 표시, 누를 수 없는 일반 카드(탭해도 그대로),
 *             새로 열 때마다 무작위로 한 개(여러 번 열면 서로 다른 명언이 나옴),
 *             360px 화면에서 키패드·확인·카드·관리자 버튼이 잘리지 않고 화면 안에 들어옴
 */
import pw from '/workspace/tmp/pw/node_modules/playwright/index.js'

const { chromium } = pw
const url = process.argv[2] ?? 'https://sunogong.vercel.app/'
const shotPath = process.argv[3] ?? '/workspace/downloads/sunogong-login-quotes-360.png'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-P613) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.46'

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({
  executablePath:
    process.env.PW_CHROME ?? '/workspace/tmp/pw/browsers/chromium_headless_shell-1148/chrome-linux/headless_shell',
  args: ['--no-sandbox'],
})
try {
  const context = await browser.newContext({
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: ANDROID_UA,
  })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  const card = page.locator('[data-quote-card]')
  check('한줄 카드가 보임', (await card.count()) === 1)
  const readQuote = () =>
    card.evaluate((el) => ({
      tag: el.tagName,
      text: (el.querySelector('[data-quote-text]')?.textContent ?? '').replace(/[“”]/g, '').trim(),
      source: (el.querySelector('[data-quote-source]')?.textContent ?? '').trim(),
      label: (el.textContent ?? '').includes('오늘의 한줄'),
      oldLabel: (el.textContent ?? '').includes('오늘의 명언'),
      tapHint: (el.textContent ?? '').includes('눌러서 바꾸기'),
      aria: el.getAttribute('aria-label') ?? '',
      role: el.getAttribute('role') ?? '',
      insideButton: Boolean(el.closest('button')),
    }))
  const first = await readQuote()
  check('라벨이 「오늘의 한줄」', first.label)
  check('예전 라벨 「오늘의 명언」은 없음', !first.oldLabel)
  check('「눌러서 바꾸기」 문구 없음', !first.tapHint)
  check('카드는 <div> 일반 카드(버튼 아님)', first.tag === 'DIV' && !first.insideButton, first.tag)
  check('누르라는 안내(aria-label·role) 없음', !first.aria.includes('누르') && first.role !== 'button', `${first.aria} / ${first.role}`)
  check('명언 문구가 있음', first.text.length > 5, first.text)
  check('출처(—)가 함께 나옴', first.source.startsWith('—'), first.source)

  /* 눌러도 바뀌지 않는지 — 20번 탭 */
  let changed = 0
  let blank = 0
  let previous = first.text
  for (let i = 0; i < 20; i += 1) {
    await card.click({ force: true })
    await page.waitForTimeout(40)
    const now = await readQuote()
    if (now.text !== previous) changed += 1
    if (!now.text) blank += 1
    previous = now.text
  }
  check('눌러도 명언이 바뀌지 않음', changed === 0, `20번 탭 중 바뀐 횟수 ${changed}`)
  check('탭한 뒤에도 명언 문구가 비지 않음', blank === 0)

  /* 새로 열 때마다 무작위로 한 개 — 12번 새로 열어 서로 다른 명언이 나오는지 */
  const seen = new Set([first.text])
  for (let i = 0; i < 12; i += 1) {
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    const now = await readQuote()
    if (now.text && now.source.startsWith('—')) seen.add(now.text)
  }
  check('새로 열 때마다 명언이 무작위로 나옴', seen.size >= 6, `12번 새로 열어 ${seen.size}종`)
  check('새로 열어도 한 번에 한 개만', (await page.locator('[data-quote-card]').count()) === 1)

  /* 360px 화면에서 키패드·버튼이 잘리지 않는지 */
  const boxes = await page.evaluate(() => {
    const r = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }
    }
    const buttons = [...document.querySelectorAll('button')]
    const byLabel = (label) => buttons.find((x) => x.getAttribute('aria-label') === label)
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      scrollHeight: document.documentElement.scrollHeight,
      key1: r(byLabel('1')),
      key0: r(byLabel('0')),
      confirm: r(buttons.find((x) => x.textContent?.trim() === '확인')),
      admin: r(buttons.find((x) => x.textContent?.trim() === '관리자')),
      quote: r(document.querySelector('[data-quote-card]')),
    }
  })
  const inside = (box) => box && box.top >= 0 && box.bottom <= boxes.viewport.h && box.left >= 0 && box.right <= 360
  check('키패드 1~0 이 화면 안에 있음', inside(boxes.key1) && inside(boxes.key0), JSON.stringify(boxes.key1))
  check('확인 버튼이 잘리지 않음', inside(boxes.confirm), JSON.stringify(boxes.confirm))
  check('한줄 카드가 잘리지 않음', inside(boxes.quote), JSON.stringify(boxes.quote))
  check('관리자 버튼이 화면 안에 있음', inside(boxes.admin), JSON.stringify(boxes.admin))
  console.log(`     화면 ${boxes.viewport.w}×${boxes.viewport.h} · 문서 높이 ${boxes.scrollHeight}`)

  await page.screenshot({ path: shotPath, fullPage: false })
  console.log(`     스크린샷: ${shotPath}`)

  /* 더 작은 화면(360×640 브라우저)에서도 키패드·확인은 잘리지 않는지 */
  const small = await browser.newContext({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: ANDROID_UA,
  })
  const smallPage = await small.newPage()
  await smallPage.goto(url, { waitUntil: 'networkidle' })
  await smallPage.waitForTimeout(600)
  const smallBoxes = await smallPage.evaluate(() => {
    const r = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { top: Math.round(b.top), bottom: Math.round(b.bottom) }
    }
    const buttons = [...document.querySelectorAll('button')]
    return {
      h: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      key1: r(buttons.find((x) => x.getAttribute('aria-label') === '1')),
      confirm: r(buttons.find((x) => x.textContent?.trim() === '확인')),
      quote: r(document.querySelector('[data-quote-card]')),
    }
  })
  const fits = (box) => box && box.top >= 0 && box.bottom <= smallBoxes.h
  check(
    '360×640 에서도 키패드·확인·한줄 카드가 잘리지 않음',
    fits(smallBoxes.key1) && fits(smallBoxes.confirm) && fits(smallBoxes.quote),
    JSON.stringify(smallBoxes),
  )
  await smallPage.screenshot({ path: '/workspace/browser/sunogong-login-quotes-360x640.png', fullPage: true })
  await small.close()
  await context.close()
} finally {
  await browser.close()
}
console.log(failed === 0 ? 'LOGIN QUOTES CHECK PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
