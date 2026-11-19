/** 순수 함수(날짜·집계·랭킹) 점검용 테스트 (개발용) */
import { addDays, formatHMS, formatMinutes, kstDateString, monthRange, rangeDates, weekRange, weekdayOf, kstDayEndMs, kstMidnightMs } from '../src/lib/time'
import { buildStats, indexLogs, longestStreakAllTime, longestStreakInRange, rankEntries } from '../src/lib/stats'
import { computeElapsedSeconds, isHeartbeatStale } from '../src/lib/session'
import { normalizeKind, pausesOnLeave } from '../src/lib/kinds'
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

console.log(failed === 0 ? 'ALL LIB TESTS PASSED' : `${failed} FAILED`)
