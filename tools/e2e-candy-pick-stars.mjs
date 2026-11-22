/**
 * 사탕교환권 — 쓸 성구 2개를 학생이 직접 고르기 (개발용)
 *   node tools/e2e-candy-pick-stars.mjs
 *
 * 앱과 같은 anon 키로 실제 Supabase 에 붙어서
 *   같은 성구 2개(3성구 2개) · 서로 다른 성구 2개(1성구 + 5성구)
 *   · 잘못된 고르기(1개·3개·0성구·8성구·빈 값·없는 성구) · 예전 호출(p_stars 없이)
 *   · 성구가 모자랄 때 거절 까지 확인하고,
 * 검증용 학생과 그 기록은 끝나고 지운다.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

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
function check(name, ok, detail) {
  if (!ok) failed += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
}

const run = async (promise) => {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  return data
}

/** 오류가 나야 하는 호출 — 오류 문구에 기대한 코드가 들어 있는지 */
const expectError = async (promise, code) => {
  const { error } = await promise
  return { failed: Boolean(error), message: error?.message ?? '', matched: Boolean(error?.message?.includes(code)) }
}

const ballSum = (map) => Object.values(map ?? {}).reduce((sum, value) => sum + Number(value || 0), 0)
const sameList = (left, right) => JSON.stringify(left) === JSON.stringify(right)

const code = String(Math.floor(1000 + Math.random() * 8999))
const student = await run(
  supabase.from('students').insert({ name: '검증사탕', code, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id}`)

/* 1성구 1개 · 3성구 2개 · 5성구 3개 (총 6개) */
const START = { '1': 1, '2': 0, '3': 2, '4': 0, '5': 3, '6': 0, '7': 0 }

try {
  await run(supabase.from('students').update({ dragonballs: START, dragonball_count: 6 }).eq('id', student.id))

  /* 1) 잘못된 고르기 — 하나도 차감되지 않아야 한다 */
  const badPicks = [
    ['성구 1개', [5], 'invalid_stars'],
    ['성구 3개', [5, 5, 5], 'invalid_stars'],
    ['0성구', [0, 5], 'invalid_stars'],
    ['8성구', [8, 5], 'invalid_stars'],
    ['빈 목록', [], 'invalid_stars'],
    ['없는 성구(2성구)', [2, 5], 'dragonballs_shortage'],
    ['가진 개수보다 많은 3성구', [3, 3, 3], 'invalid_stars'],
  ]
  for (const [label, stars, expected] of badPicks) {
    const res = await expectError(
      supabase.rpc('exchange_candy_ticket', { p_student_id: student.id, p_stars: stars }),
      expected,
    )
    check(`거절: ${label}`, res.failed && res.matched, res.message)
  }

  const afterBad = await run(supabase.from('students').select('dragonballs,dragonball_count,candy_tickets').eq('id', student.id).single())
  check('거절: 성구는 그대로', ballSum(afterBad?.dragonballs) === 6 && afterBad?.dragonball_count === 6, afterBad)
  check('거절: 교환권은 그대로 0장', afterBad?.candy_tickets === 0, afterBad?.candy_tickets)

  /* 2) 같은 성구 2개 — 3성구 2개 */
  const same = await run(supabase.rpc('exchange_candy_ticket', { p_student_id: student.id, p_stars: [3, 3] }))
  check('같은 성구: used = [3,3]', sameList(same?.used, [3, 3]), same?.used)
  check('같은 성구: 3성구 0개', same?.dragonballs?.['3'] === 0, same?.dragonballs)
  check('같은 성구: 1성구·5성구는 그대로', same?.dragonballs?.['1'] === 1 && same?.dragonballs?.['5'] === 3, same?.dragonballs)
  check('같은 성구: 총 4개', same?.total === 4 && ballSum(same?.dragonballs) === 4, same?.total)
  check('같은 성구: 사탕교환권 1장', same?.candy_tickets === 1, same?.candy_tickets)

  /* 3) 서로 다른 성구 2개 — 1성구 + 5성구 (고른 차례 그대로) */
  const mixed = await run(supabase.rpc('exchange_candy_ticket', { p_student_id: student.id, p_stars: [1, 5] }))
  check('다른 성구: used = [1,5]', sameList(mixed?.used, [1, 5]), mixed?.used)
  check('다른 성구: 1성구 0개 · 5성구 2개', mixed?.dragonballs?.['1'] === 0 && mixed?.dragonballs?.['5'] === 2, mixed?.dragonballs)
  check('다른 성구: 총 2개', mixed?.total === 2 && ballSum(mixed?.dragonballs) === 2, mixed?.total)
  check('다른 성구: 사탕교환권 2장', mixed?.candy_tickets === 2, mixed?.candy_tickets)

  /* 4) 예전 화면(p_stars 없이) — 가장 많이 가진 5성구 2개가 빠진다 */
  const legacy = await run(supabase.rpc('exchange_candy_ticket', { p_student_id: student.id }))
  check('예전 호출: used = [5,5]', sameList(legacy?.used, [5, 5]), legacy?.used)
  check('예전 호출: 총 0개 · 교환권 3장', legacy?.total === 0 && legacy?.candy_tickets === 3, legacy?.total)
  check('예전 호출: 수집 종류 0', legacy?.collected === 0, legacy?.collected)

  /* 5) 다 쓴 뒤에는 고르든 말든 거절 */
  const emptyPick = await expectError(
    supabase.rpc('exchange_candy_ticket', { p_student_id: student.id, p_stars: [5, 5] }),
    'dragonballs_shortage',
  )
  check('성구 없음: 고른 성구도 거절', emptyPick.failed && emptyPick.matched, emptyPick.message)
  const emptyLegacy = await expectError(supabase.rpc('exchange_candy_ticket', { p_student_id: student.id }), 'dragonballs_shortage')
  check('성구 없음: 예전 호출도 거절', emptyLegacy.failed && emptyLegacy.matched, emptyLegacy.message)

  const after = await run(supabase.from('students').select('dragonballs,dragonball_count,candy_tickets').eq('id', student.id).single())
  check('실패한 요청은 교환권을 바꾸지 않는다', after?.candy_tickets === 3, after?.candy_tickets)

  /* 6) 학생 화면이 읽는 값 — 서버 응답 그대로 반영 */
  const profile = await run(supabase.rpc('student_profile', { p_student_id: student.id }))
  check('프로필: 사탕교환권 3장', profile?.candy_tickets === 3, profile?.candy_tickets)
  check('프로필: 성구 0개', ballSum(profile?.dragonballs) === 0 && profile?.dragonball_count === 0, profile)
} finally {
  const removed = await supabase.from('students').delete().eq('id', student.id)
  if (removed.error) console.log('검증용 학생 삭제 실패:', removed.error.message)
  const left = await run(supabase.from('students').select('id').eq('id', student.id))
  check('정리: 남은 검증용 학생 0명', left.length === 0, left)
  const others = await run(supabase.from('students').select('id').eq('name', '검증사탕'))
  check('정리: 같은 이름 남은 학생 0명', others.length === 0, others)
}

console.log(failed === 0 ? '\nALL CANDY PICK CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`)
process.exit(failed === 0 ? 0 : 1)
