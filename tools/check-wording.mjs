/**
 * 문구 점검 — 통합 앱 이름 「훈출」 (2026-11-27) · 관리자 「푼 숙제」 (2026-11-28)
 *   node tools/check-wording.mjs [dist 디렉터리]
 *
 * 확인하는 것
 *   · src 의 .ts/.tsx 어디에도 옛 표기 「출훈」 이 없다
 *   · 빌드 결과(dist/assets/*.js)에도 「출훈」 이 없다
 *   · 대신 「훈출」 안내 문구가 들어 있다(훈출에서 하원하면 자동으로 마무리돼요)
 *   · 관리자 화면(src/admin)에는 「푼 문제」 가 없고 「푼 숙제」 로 통일돼 있다
 *   · 학생 화면의 「지난번 푼 문제 수」 는 그대로 남아 있다 (원장님 지시)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

const srcFiles = walk('src').filter((path) => ['.ts', '.tsx'].includes(extname(path)))
const srcHits = srcFiles.filter((path) => readFileSync(path, 'utf8').includes('출훈'))
check('src 에 옛 표기(출훈) 없음', srcHits.length === 0, srcHits.join(', '))

const srcText = srcFiles.map((path) => readFileSync(path, 'utf8')).join('\n')
check('src 에 「훈출」 안내 있음', srcText.includes('훈출(등·하원)') && srcText.includes('훈출에서 하원하면 자동으로 마무리돼요'))

/* 2026-11-28 — 관리자 문구는 「푼 숙제」, 학생 화면은 「지난번 푼 문제 수」 그대로 */
const adminFiles = srcFiles.filter((path) => path.includes('/admin/'))
const adminText = adminFiles.map((path) => readFileSync(path, 'utf8')).join('\n')
const studentText = srcFiles
  .filter((path) => path.includes('/student/'))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')
check('관리자 화면에 「푼 문제」 없음', !adminText.includes('푼 문제'))
check('관리자 화면에 「푼 숙제」 있음', adminText.includes('푼 숙제'))
check('학생 화면 「지난번 푼 문제 수」 그대로', studentText.includes('지난번 푼 문제 수'))

const distDir = process.argv[2] ?? 'dist'
const assetsDir = join(distDir, 'assets')
let bundleHits = []
let bundleText = ''
try {
  const bundles = readdirSync(assetsDir).filter((name) => name.endsWith('.js'))
  for (const name of bundles) {
    const text = readFileSync(join(assetsDir, name), 'utf8')
    bundleText += text
    if (text.includes('출훈')) bundleHits.push(name)
  }
  check(`빌드 결과에 옛 표기(출훈) 없음 (${bundles.length}개 번들)`, bundleHits.length === 0, bundleHits.join(', '))
  check('빌드 결과에 「훈출」 안내 있음', bundleText.includes('훈출(등·하원)') && bundleText.includes('훈출에서 하원하면 자동으로 마무리돼요'))
  check('빌드 결과에 관리자 「푼 숙제」 있음', bundleText.includes('푼 숙제'))
  check('빌드 결과에 학생 「지난번 푼 문제 수」 있음', bundleText.includes('지난번 푼 문제 수'))
} catch (error) {
  check('빌드 결과 확인', false, error instanceof Error ? error.message : String(error))
}

console.log(failed === 0 ? 'ALL WORDING CHECKS PASSED' : `${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
