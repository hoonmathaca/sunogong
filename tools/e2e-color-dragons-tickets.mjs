/**
 * 일반용 7종 · 무지개용 · 교환권 — 실서비스 E2E (개발용)
 *   node tools/e2e-color-dragons-tickets.mjs
 *
 * 앱과 같은 anon 키로 실제 Supabase 에 붙어서
 *   드래곤볼 지급 → 성구 2개 → 사탕교환권 → 1~7성구 → 일반용 → 7종 → 무지개용
 *   → 1,000P·10,000P 교환권 → 관리자 사용 처리(차감) 까지 확인하고,
 * 검증용 학생과 그 기록(지급·사용 이력 포함)은 끝나고 지운다.
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

const code = String(Math.floor(1000 + Math.random() * 8999))
const student = await run(
  supabase.from('students').insert({ name: '검증일반용', code, grade: '검증' }).select('id,name,code').single(),
)
console.log(`검증용 학생 ${student.name} (${code}) ${student.id}`)

const EMPTY_BALLS = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0 }
const EMPTY_DRAGONS = { red: 0, orange: 0, yellow: 0, green: 0, blue: 0, navy: 0, purple: 0 }
const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple']
const ballSum = (map) => Object.values(map ?? {}).reduce((sum, value) => sum + Number(value || 0), 0)
const dragonSum = (map) => COLORS.reduce((sum, color) => sum + Number(map?.[color] ?? 0), 0)

try {
  /* 0) 새 학생의 기본값 */
  const profile0 = await run(supabase.rpc('student_profile', { p_student_id: student.id }))
  check('기본값: 성구 0개', profile0?.dragonball_count === 0 && ballSum(profile0?.dragonballs) === 0)
  check('기본값: 일반용 0마리', dragonSum(profile0?.dragons) === 0, profile0?.dragons)
  check(
    '기본값: 교환권 0장',
    [profile0?.candy_tickets, profile0?.point_1000_tickets, profile0?.point_10000_tickets, profile0?.secret_tickets].every(
      (n) => n === 0,
    ),
  )
  check('기본값: 검은용 0마리', profile0?.black_dragon_count === 0, profile0?.black_dragon_count)

  /* 1) 드래곤볼 21개 지급 */
  const granted = await run(
    supabase.rpc('grant_dragonballs', {
      p_student_ids: [student.id],
      p_amount: 21,
      p_mode: 'single',
      p_note: 'E2E 검증',
    }),
  )
  check('지급: 21개', granted?.last_total === 21, granted?.last_total)

  /* 2) 성구 2개 → 사탕교환권 1장 */
  const beforeCandy = await run(supabase.rpc('student_profile', { p_student_id: student.id }))
  const candy = await run(supabase.rpc('exchange_candy_ticket', { p_student_id: student.id }))
  check('사탕: 교환됨', candy?.exchanged === true)
  check('사탕: 성구 2개 사용', Array.isArray(candy?.used) && candy.used.length === 2, candy?.used)
  check(
    '사탕: 가장 많은 성구부터',
    candy?.used?.every((star) => (beforeCandy?.dragonballs?.[String(star)] ?? 0) >= 1),
    { used: candy?.used, before: beforeCandy?.dragonballs },
  )
  check('사탕: 총 19개로 줄어듦', candy?.total === 19, candy?.total)
  check('사탕: 교환권 1장', candy?.candy_tickets === 1, candy?.candy_tickets)
  check('사탕: 성구 합계와 총 개수가 같다', ballSum(candy?.dragonballs) === candy?.total, candy?.dragonballs)

  /* 3) 성구가 2개보다 적으면 바꿀 수 없다 */
  await run(
    supabase
      .from('students')
      .update({ dragonballs: { ...EMPTY_BALLS, '1': 1 }, dragonball_count: 1 })
      .eq('id', student.id),
  )
  const candyShort = await expectError(supabase.rpc('exchange_candy_ticket', { p_student_id: student.id }), 'dragonballs_shortage')
  check('사탕: 성구 1개면 거절', candyShort.failed && candyShort.matched, candyShort.message)

  /* 4) 1~7성구가 다 없으면 일반용을 뽑을 수 없다 */
  const colorShort = await expectError(supabase.rpc('craft_color_dragon', { p_student_id: student.id }), 'dragonballs_incomplete')
  check('일반용: 한 종류가 없으면 거절', colorShort.failed && colorShort.matched, colorShort.message)

  /* 5) 1~7성구 하나씩 → 일반용 1마리 (랜덤 색) */
  const fullSet = { '1': 2, '2': 2, '3': 2, '4': 2, '5': 2, '6': 2, '7': 2 }
  await run(supabase.from('students').update({ dragonballs: fullSet, dragonball_count: 14 }).eq('id', student.id))
  const crafted = await run(supabase.rpc('craft_color_dragon', { p_student_id: student.id }))
  check('일반용: 태어남', crafted?.crafted === true)
  check('일반용: 7색 중 하나', COLORS.includes(crafted?.color), crafted?.color)
  check('일반용: 그 색 1마리', crafted?.dragons?.[crafted?.color] === 1, crafted?.dragons)
  check('일반용: 성구는 하나씩만 빠짐', Object.values(crafted?.dragonballs ?? {}).every((count) => count === 1), crafted?.dragonballs)
  check('일반용: 총 7개로 줄어듦', crafted?.total === 7, crafted?.total)
  check('일반용: 아직 무지개용 아님', crafted?.rainbow_dragon_ready === false)

  /* 6) 7종을 다 모으면 무지개용 1마리 */
  const oneEach = Object.fromEntries(COLORS.map((color) => [color, 1]))
  await run(supabase.from('students').update({ dragons: oneEach }).eq('id', student.id))
  const rainbow = await run(supabase.rpc('craft_rainbow_dragon', { p_student_id: student.id }))
  check('무지개용: 만들어짐', rainbow?.crafted === true)
  check('무지개용: 1마리', rainbow?.rainbow_dragon_count === 1, rainbow?.rainbow_dragon_count)
  check('무지개용: 일반용은 모두 소모', dragonSum(rainbow?.dragons) === 0, rainbow?.dragons)

  /* 7) 무지개용 1마리 → 10,000포인트 교환권 1장 */
  const rainbowTicket = await run(
    supabase.rpc('exchange_point_ticket', { p_student_id: student.id, p_kind: 'rainbow' }),
  )
  check('10,000P: 교환됨', rainbowTicket?.exchanged === true && rainbowTicket?.kind === 'rainbow')
  check('10,000P: 무지개용 0마리', rainbowTicket?.rainbow_dragon_count === 0, rainbowTicket?.rainbow_dragon_count)
  check('10,000P: 교환권 1장', rainbowTicket?.point_10000_tickets === 1, rainbowTicket?.point_10000_tickets)
  const rainbowShort = await expectError(
    supabase.rpc('exchange_point_ticket', { p_student_id: student.id, p_kind: 'rainbow' }),
    'rainbow_dragon_shortage',
  )
  check('10,000P: 무지개용이 없으면 거절', rainbowShort.failed && rainbowShort.matched, rainbowShort.message)

  /* 8) 일반용 1마리 → 1,000포인트 교환권 1장 */
  await run(supabase.from('students').update({ dragons: { ...EMPTY_DRAGONS, blue: 2 } }).eq('id', student.id))
  const pointTicket = await run(
    supabase.rpc('exchange_point_ticket', { p_student_id: student.id, p_kind: 'dragon' }),
  )
  check('1,000P: 교환됨', pointTicket?.exchanged === true && pointTicket?.kind === 'dragon')
  check('1,000P: 가장 많은 색(파랑)에서 빠짐', pointTicket?.color === 'blue', pointTicket?.color)
  check('1,000P: 일반용 1마리 남음', dragonSum(pointTicket?.dragons) === 1, pointTicket?.dragons)
  check('1,000P: 교환권 1장', pointTicket?.point_1000_tickets === 1, pointTicket?.point_1000_tickets)

  /* 9) 관리자 — 교환권 사용 처리 */
  const useCandy = await run(supabase.rpc('use_ticket', { p_student_id: student.id, p_ticket: 'candy', p_amount: 1 }))
  check('사용: 사탕교환권 0장', useCandy?.candy_tickets === 0, useCandy?.candy_tickets)
  const useCandyAgain = await expectError(
    supabase.rpc('use_ticket', { p_student_id: student.id, p_ticket: 'candy', p_amount: 1 }),
    'ticket_shortage',
  )
  check('사용: 없는 교환권은 거절', useCandyAgain.failed && useCandyAgain.matched, useCandyAgain.message)

  const use1000 = await run(supabase.rpc('use_ticket', { p_student_id: student.id, p_ticket: 'point1000', p_amount: 1 }))
  check('사용: 1,000P 0장', use1000?.point_1000_tickets === 0, use1000?.point_1000_tickets)
  const use10000 = await run(supabase.rpc('use_ticket', { p_student_id: student.id, p_ticket: 'point10000', p_amount: 1 }))
  check('사용: 10,000P 0장', use10000?.point_10000_tickets === 0, use10000?.point_10000_tickets)

  const uses = await run(
    supabase.from('ticket_uses').select('ticket,amount').eq('student_id', student.id).order('created_at'),
  )
  check(
    '사용 기록: 세 번 남음',
    uses?.length === 3 && uses.map((row) => row.ticket).join(',') === 'candy,point1000,point10000',
    uses,
  )

  /* 10) 학생 화면이 읽는 값 */
  const profile = await run(supabase.rpc('student_profile', { p_student_id: student.id }))
  check('프로필: 일반용 1마리(파랑)', dressCheck(profile?.dragons), profile?.dragons)
  check('프로필: 교환권 모두 0장', [profile?.candy_tickets, profile?.point_1000_tickets, profile?.point_10000_tickets].every((n) => n === 0))
  const dex = await run(supabase.rpc('student_dragonballs', { p_student_id: student.id }))
  check('도감: 성구 7개', dex?.total === 7 && ballSum(dex?.dragonballs) === 7, { total: dex?.total, map: dex?.dragonballs })
  check('도감: 뽑기 가능', dex?.color_dragon_ready === true)
  check('도감: 무지개용 불가', dex?.rainbow_dragon_ready === false, dex?.dragons)

  /* 11) 히든 검은용 → 시크릿쿠폰 → 관리자 사용 처리 */
  const roll = await supabase.rpc('roll_black_dragon')
  check('히든: 앱(anon)에서는 확률 함수를 부를 수 없다', Boolean(roll.error), roll.error?.message ?? 'callable')

  await run(supabase.from('students').update({ black_dragon_count: 1 }).eq('id', student.id))
  const secret = await run(supabase.rpc('exchange_secret_ticket', { p_student_id: student.id }))
  check('히든: 검은용 1마리 → 시크릿쿠폰 1장', secret?.secret_tickets === 1 && secret?.black_dragon_count === 0, secret)
  const secretShort = await expectError(
    supabase.rpc('exchange_secret_ticket', { p_student_id: student.id }),
    'black_dragon_shortage',
  )
  check('히든: 검은용이 없으면 거절', secretShort.failed && secretShort.matched, secretShort.message)

  const useSecret = await run(supabase.rpc('use_ticket', { p_student_id: student.id, p_ticket: 'secret', p_amount: 1 }))
  check('히든: 시크릿쿠폰 사용 처리', useSecret?.secret_tickets === 0, useSecret?.secret_tickets)
  const secretUses = await run(
    supabase.from('ticket_uses').select('ticket').eq('student_id', student.id).eq('ticket', 'secret'),
  )
  check('히든: 시크릿쿠폰 사용 기록 1줄', secretUses?.length === 1, secretUses)

  /* 12) 예전 함수 이름도 그대로 동작한다 (배포 중 열려 있던 화면 호환) */
  const legacy = await run(supabase.rpc('craft_rainbow_ball', { p_student_id: student.id }))
  check('호환: craft_rainbow_ball → 일반용', legacy?.crafted === true && COLORS.includes(legacy?.color), legacy?.color)
} finally {
  /* 검증용 학생을 지운다 (지급·사용 이력도 함께) */
  const removed = await supabase.from('students').delete().eq('id', student.id)
  if (removed.error) console.log('검증용 학생 삭제 실패:', removed.error.message)
  const left = await run(supabase.from('students').select('id').eq('id', student.id))
  const leftUses = await run(supabase.from('ticket_uses').select('id').eq('student_id', student.id))
  const leftGrants = await run(supabase.from('dragonball_grants').select('id').eq('student_id', student.id))
  check('정리: 남은 검증용 학생 0명', left.length === 0)
  check('정리: 남은 사용 기록 0줄', leftUses.length === 0)
  check('정리: 남은 지급 기록 0줄', leftGrants.length === 0)
}

function dressCheck(map) {
  return map?.blue === 1 && dragonSum(map) === 1
}

console.log(failed === 0 ? '\nALL E2E CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`)
process.exit(failed === 0 ? 0 : 1)
