/**
 * 배포된 로그인 화면(360px)에서 헤더 마스코트·푸터 배지를 확인해 스크린샷을 남긴다 (개발용)
 *   PW_CHROME=... node tools/check-login-mascot.mjs
 */
import { readFileSync } from 'node:fs'
import pw from '/workspace/tmp/pw/node_modules/playwright/index.js'

const { chromium } = pw
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-P613) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.46'

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
  await page.goto('https://sunogong.vercel.app/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  /* 이미지가 실제로 그려졌는지 (깨진 그림 없음) */
  const imgs = await page.evaluate(() =>
    [...document.querySelectorAll('img')].map((img) => ({
      src: img.getAttribute('src'),
      ok: img.complete && img.naturalWidth > 0,
      w: Math.round(img.getBoundingClientRect().width),
    })),
  )
  console.log(JSON.stringify(imgs.filter((img) => img.src?.includes('images/')), null, 1))

  await page.screenshot({ path: '/workspace/browser/sunogong-login-mascot-360.png', fullPage: false })
  const header = page.locator('header').first()
  await header.screenshot({ path: '/workspace/browser/sunogong-login-mascot-header-360.png' })
  const footer = page.locator('footer').first()
  await footer.screenshot({ path: '/workspace/browser/sunogong-login-mascot-footer-360.png' })
  await context.close()
} finally {
  await browser.close()
}
console.log('done')
