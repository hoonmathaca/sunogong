/**
 * 배포된 로그인 화면(360px)에서 「오늘의 명언」 카드를 확인하고 스크린샷을 남긴다 (개발용)
 *   node tools/check-login-quotes.mjs [url] [screenshot path]
 * 확인하는 것: 명언 카드·출처 표시, 누르면 다른 명언으로 바뀜(직전 명언 반복 없음),
 *             360px 화면에서 키패드·확인·관리자 버튼이 잘리지 않고 화면 안에 들어옴
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
  check('명언 카드가 보임', (await card.count()) === 1)
  const readQuote = () =>
    card.evaluate((el) => ({
      text: (el.querySelector('[data-quote-text]')?.textContent ?? '').replace(/[“”]/g, '').trim(),
      source: (el.querySelector('[data-quote-source]')?.textContent ?? '').trim(),
      aria: el.getAttribute('aria-label') ?? '',
    }))
  const first = await readQuote()
  check('명언 문구가 있음', first.text.length > 5, first.text)
  check('출처(—)가 함께 나옴', first.source.startsWith('—'), first.source)
  check('카드가 눌러서 바꾸는 버튼', first.aria.includes('누르면 다른 명언'), first.aria)

  /* 20번 눌러 매번 다른 명언으로 바뀌고 직전 명언이 바로 다시 나오지 않는지 */
  const seen = new Set([first.text])
  let sameAsBefore = 0
  let sameTwice = 0
  let previous = first.text
  for (let i = 0; i < 20; i += 1) {
    await card.click()
    await page.waitForTimeout(60)
    const now = await readQuote()
    if (now.text === previous) sameTwice += 1
    if (!now.text) sameAsBefore += 1
    seen.add(now.text)
    previous = now.text
  }
  check('누르면 바로 다른 명언으로 바뀜', sameTwice === 0, `20번 중 같은 명언 ${sameTwice}번`)
  check('명언 문구가 비는 경우 없음', sameAsBefore === 0)
  check('누를 때마다 여러 명언이 나옴', seen.size >= 15, `${seen.size}종`)

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
  check('명언 카드가 잘리지 않음', inside(boxes.quote), JSON.stringify(boxes.quote))
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
    '360×640 에서도 키패드·확인·명언 카드가 잘리지 않음',
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
