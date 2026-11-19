/** 순수 함수(날짜·집계·랭킹) 점검용 테스트 (개발용) */
import { addDays, formatHMS, formatMinutes, kstDateString, monthRange, rangeDates, weekRange, weekdayOf, kstDayEndMs, kstMidnightMs } from '../src/lib/time'
import { buildStats, indexLogs, longestStreakAllTime, longestStreakInRange, rankEntries } from '../src/lib/stats'
import { computeElapsedSeconds, isHeartbeatStale } from '../src/lib/session'
import { normalizeKind, pausesOnLeave } from '../src/lib/kinds'
import {
  detectPlatform,
  fullscreenHint,
  isFullscreenActive,
  isStandaloneApp,
  PIXEL_SHIFT_INTERVAL_MS,
  pixelShift,
  supportsFullscreen,
} from '../src/lib/fullscreen'
import type { Student, StudyLog } from '../src/lib/types'

let failed = 0
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) console.log(`ok   ${name}`)
  else {
    failed += 1
    console.log(`FAIL ${name}: got ${a} / expected ${e}`)
  }
}

/* 날짜 계산 (한국은 서머타임 없음) */
eq('addDays 말일', addDays('2026-11-30', 1), '2026-12-01')
eq('addDays 역방향', addDays('2026-03-01', -1), '2026-02-28')
eq('addDays 연말', addDays('2026-12-31', 1), '2027-01-01')
eq('요일(2026-11-19=목)', weekdayOf('2026-11-19'), 4)
eq('이번 주(월요일 시작)', weekRange('2026-11-19'), { start: '2026-11-16', end: '2026-11-19' })
eq('이번 주(일요일)', weekRange('2026-11-22'), { start: '2026-11-16', end: '2026-11-22' })
eq('월 범위(2월)', monthRange('2026-02'), { start: '2026-02-01', end: '2026-02-28' })
eq('월 범위(12월)', monthRange('2026-12'), { start: '2026-12-01', end: '2026-12-31' })
eq('날짜 배열', rangeDates('2026-11-17', '2026-11-19').length, 3)
eq('자정(23:59 KST)', new Date(kstDayEndMs('2026-11-19')).toISOString(), '2026-11-19T14:59:00.000Z')
eq('다음 자정(00:00 KST)', new Date(kstMidnightMs('2026-11-19')).toISOString(), '2026-11-19T15:00:00.000Z')
eq('달 끝 다음 자정', new Date(kstMidnightMs('2026-11-30')).toISOString(), '2026-11-30T15:00:00.000Z')
eq('KST 날짜 문자열', kstDateString(Date.parse('2026-11-19T15:30:00Z')), '2026-11-20')

/* 표시 형식 */
eq('분 표시 60', formatMinutes(60), '1시간')
eq('분 표시 90', formatMinutes(90), '1시간 30분')
eq('분 표시 45', formatMinutes(45), '45분')
eq('분 표시 0', formatMinutes(0), '0분')
eq('시:분:초', formatHMS(3661), '01:01:01')
eq('시:분:초 0', formatHMS(0), '00:00:00')

/* 연속 일수 */
const dates = ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-19']
eq('기간 내 최장 연속', longestStreakInRange(dates, '2026-11-15', '2026-11-19'), 3)
eq('기간 밖 제외', longestStreakInRange(dates, '2026-11-17', '2026-11-19'), 1)
eq('역대 최장', longestStreakAllTime(dates), 3)
eq('역대 최장(빈 값)', longestStreakAllTime([]), 0)

/* 집계 */
const students: Student[] = [
  { id: 'a', name: '가학생', code: '0001', grade: '초6', created_at: '' },
  { id: 'b', name: '나학생', code: '0002', grade: '중1', created_at: '' },
]
const logs: StudyLog[] = [
  { id: 'l1', student_id: 'a', date: '2026-11-17', minutes: 60, problems: 10, updated_at: '' },
  { id: 'l2', student_id: 'a', date: '2026-11-18', minutes: 30, problems: 5, updated_at: '' },
  { id: 'l3', student_id: 'b', date: '2026-11-18', minutes: 90, problems: 20, updated_at: '' },
  { id: 'l4', student_id: 'b', date: '2026-11-01', minutes: 999, problems: 1, updated_at: '' },
]
const index = indexLogs(logs)
const stats = buildStats(students, index, '2026-11-17', '2026-11-19')
eq('누적 시간', stats[0].minutes, 90)
eq('누적 문제', stats[0].problems, 15)
eq('제출 일수', stats[0].submittedDays, 2)
eq('기간 밖 기록 제외', stats[1].minutes, 90)

/* 랭킹: 동점은 같은 순위, 그 안에서는 제출 일수 많은 학생 먼저 */
const ranking = rankEntries([
  { student: students[0], value: 100, days: 3 },
  { student: students[1], value: 100, days: 5 },
  { student: { ...students[0], id: 'c', name: '다학생' }, value: 50, days: 9 },
])
eq('랭킹 순서', ranking.map((entry) => entry.student.name), ['나학생', '가학생', '다학생'])
eq('랭킹 순위', ranking.map((entry) => entry.rank), [1, 1, 3])
eq('0은 랭킹 제외', rankEntries([{ student: students[0], value: 0, days: 0 }]).length, 0)

/* 타이머 경과 시간 */
const baseSession = {
  id: 's',
  student_id: 'a',
  status: 'running' as const,
  started_at: '2026-11-19T01:00:00Z',
  paused_at: null,
  ended_at: null,
  last_heartbeat_at: '2026-11-19T01:10:00Z',
  paused_seconds: 0,
  auto_pause_count: 0,
  auto_paused_seconds: 0,
  date: '2026-11-19',
  minutes: null,
  problems: null,
  created_at: '2026-11-19T01:00:00Z',
}
const at = (iso: string) => Date.parse(iso)

eq('경과(진행 중)', computeElapsedSeconds(baseSession, at('2026-11-19T01:10:00Z')), 600)
eq(
  '경과(일시정지 시간 제외)',
  computeElapsedSeconds({ ...baseSession, paused_seconds: 120 }, at('2026-11-19T01:10:00Z')),
  480,
)
eq(
  '경과(일시정지 중에는 멈춤)',
  computeElapsedSeconds(
    { ...baseSession, status: 'paused', paused_at: '2026-11-19T01:05:00Z', paused_seconds: 60 },
    at('2026-11-19T03:00:00Z'),
  ),
  240,
)
eq(
  '경과(종료 후 고정)',
  computeElapsedSeconds(
    { ...baseSession, status: 'finished', ended_at: '2026-11-19T01:30:00Z', paused_seconds: 600 },
    at('2026-11-19T09:00:00Z'),
  ),
  1200,
)
eq('경과(최대 5시간)', computeElapsedSeconds(baseSession, at('2026-11-19T10:00:00Z')), 18000)
eq('경과(시작 전)', computeElapsedSeconds(baseSession, at('2026-11-19T00:50:00Z')), 0)
eq('하트비트 끊김(30초 초과)', isHeartbeatStale(baseSession, at('2026-11-19T01:10:31Z')), true)
eq('하트비트 살아있음', isHeartbeatStale(baseSession, at('2026-11-19T01:10:10Z')), false)
eq('하트비트(일시정지 중엔 해당 없음)', isHeartbeatStale({ ...baseSession, status: 'paused' }, at('2026-11-19T05:00:00Z')), false)

/* 화면을 벗어날 때 멈추는 종류 (숙제 공부만) */
eq('숙제 공부는 나가면 멈춤', pausesOnLeave('homework'), true)
eq('학원 공부는 나가도 계속', pausesOnLeave('academy'), false)
eq('종류가 없으면 학원 공부로 봄', pausesOnLeave(undefined), false)
eq('모르는 값은 학원 공부로 봄', pausesOnLeave('something'), false)
eq('종류 정규화(homework)', normalizeKind('homework'), 'homework')
eq('종류 정규화(그 외)', normalizeKind(null), 'academy')

/* 마지막 신호 시각에서 멈춘 세션 — 그 뒤로 흐른 시간은 공부 시간에 들어가지 않는다 */
eq(
  '경과(마지막 신호에서 멈춤)',
  computeElapsedSeconds(
    { ...baseSession, status: 'paused', paused_at: baseSession.last_heartbeat_at, paused_seconds: 0 },
    at('2026-11-19T03:00:00Z'),
  ),
  600,
)

/* 전체화면·잔상 방지 */
eq('기기(아이폰)', detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'ios')
eq('기기(아이패드는 맥처럼 보임)', detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5), 'ios')
eq('기기(안드로이드)', detectPlatform('Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36'), 'android')
eq('기기(PC)', detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'other')
eq('기기(값 없음)', detectPlatform(undefined), 'other')

eq('잔상 이동(처음엔 그대로)', pixelShift(0), { x: 0, y: 0 })
eq('잔상 이동(1분)', PIXEL_SHIFT_INTERVAL_MS, 60000)
eq('잔상 이동(음수·소수 안전)', [pixelShift(-3), pixelShift(2.7)], [pixelShift(3), pixelShift(2)])
let shiftCycle = 1
while (shiftCycle < 32 && JSON.stringify(pixelShift(shiftCycle)) !== JSON.stringify(pixelShift(0))) shiftCycle += 1
eq('잔상 이동(한 바퀴 돌면 처음으로)', shiftCycle < 32, true)
const shifts = Array.from({ length: shiftCycle }, (_, index) => pixelShift(index))
const shiftInRange = shifts.slice(1).every(({ x, y }) => {
  const distance = Math.max(Math.abs(x), Math.abs(y))
  return distance >= 2 && distance <= 6
})
eq('잔상 이동(2~6px 안, 0으로 돌아오지 않음)', shiftInRange, true)
eq('잔상 이동(이웃 칸이 서로 다름)', shifts.every((point, index) => index === 0 || point.x !== shifts[index - 1].x || point.y !== shifts[index - 1].y), true)

eq('아이폰 안내', fullscreenHint({ platform: 'ios', supported: false, standalone: false }), '아이폰은 ‘홈 화면에 추가’로 열면 주소창 없이 전체화면으로 쓸 수 있어요')
eq(
  '홈 화면 앱이면 안내가 다름',
  fullscreenHint({ platform: 'ios', supported: false, standalone: true }),
  '이미 홈 화면 앱으로 열려 있어서 주소창 없이 쓸 수 있어요',
)
eq('지원하면 안내 없음', fullscreenHint({ platform: 'android', supported: true, standalone: false }), null)
eq('한 번 실패했을 때', fullscreenHint({ platform: 'android', supported: true, standalone: false, failed: true }), '전체화면을 켜지 못했어요. 한 번 더 눌러주세요')
eq('SSR: 전체화면 미지원으로 처리', supportsFullscreen(undefined), false)
eq('SSR: 전체화면 아님', isFullscreenActive(undefined), false)
eq('SSR: 홈 화면 앱 아님', isStandaloneApp(), false)

console.log(failed === 0 ? 'ALL LIB TESTS PASSED' : `${failed} FAILED`)
