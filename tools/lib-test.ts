/** 순수 함수(날짜·집계·랭킹) 점검용 테스트 (개발용) */
import { addDays, formatHMS, formatMinutes, formatMinutesCompact, kstDateString, monthRange, rangeDates, weekRange, weekdayOf, kstDayEndMs, kstMidnightMs } from '../src/lib/time'
import { buildStats, indexLogs, longestStreakAllTime, longestStreakInRange, rankEntries, splitLog, splitPercents, sumSplits } from '../src/lib/stats'
import { editTotals, editValuesFromLog, normalizeEditValues } from '../src/lib/logEdit'
import { computeElapsedSeconds, isHeartbeatStale } from '../src/lib/session'
import { normalizeKind, pausesOnLeave } from '../src/lib/kinds'
import {
  ANSWER_MEDIA_MAX_BYTES,
  answerMediaPath,
  answerStateLabel,
  cleanupCutoffIso,
  countUnanswered,
  countUnreadAnswers,
  filterQuestions,
  fitInside,
  formatQuestionTime,
  isAnswered,
  isCleanupTarget,
  isUnreadAnswer,
  mediaExtension,
  mediaKindFromPath,
  mediaKindOfFile,
  mergeQuestion,
  normalizeAnswer,
  normalizeMemo,
  parseAutoCleanup,
  QUESTION_MEMO_MAX,
  questionImagePath,
  questionStudent,
  sortQuestionsForAdmin,
  validateAnswerMedia,
} from '../src/lib/questionBoard'
import { isMobileOrTablet, isStudentScreenBlocked, readDeviceFingerprint } from '../src/lib/device'
import {
  detectPushPlatform,
  isExpiredSubscription,
  isStandaloneDisplay,
  PUSH_IOS_INSTALL_MESSAGE,
  PUSH_TEST_BODY,
  PUSH_TITLE,
  PUSH_UNSUPPORTED_MESSAGE,
  pushApiErrorMessage,
  pushAvailability,
  pushResultSummary,
  pushStateHint,
  pushStateLabel,
  questionPushBody,
  toSubscriptionRow,
  urlBase64ToUint8Array,
  VAPID_PUBLIC_KEY,
} from '../src/lib/pushBoard'
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
import type { StudyQuestion } from '../src/lib/types'

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
eq('짧은 분 표시 90', formatMinutesCompact(90), '1시간30분')
eq('짧은 분 표시 60', formatMinutesCompact(60), '1시간')
eq('짧은 분 표시 5', formatMinutesCompact(5), '5분')
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

/* 학원 공부 / 숙제 공부 나눠 집계 */
eq('종류별 값이 없는 예전 기록은 학원 공부', splitLog(logs[0]), {
  academyMinutes: 60,
  academyProblems: 10,
  homeworkMinutes: 0,
  homeworkProblems: 0,
})
const mixedLog: StudyLog = {
  id: 'm1',
  student_id: 'a',
  date: '2026-11-20',
  minutes: 100,
  problems: 40,
  academy_minutes: 70,
  academy_problems: 25,
  homework_minutes: 30,
  homework_problems: 15,
  updated_at: '',
}
eq('학원·숙제 나눠 읽기', splitLog(mixedLog), {
  academyMinutes: 70,
  academyProblems: 25,
  homeworkMinutes: 30,
  homeworkProblems: 15,
})
eq(
  '숙제만 있는 기록(문제는 학원)',
  splitLog({ ...mixedLog, minutes: 4, problems: 47, academy_minutes: 0, academy_problems: 47, homework_minutes: 4, homework_problems: 0 }),
  { academyMinutes: 0, academyProblems: 47, homeworkMinutes: 4, homeworkProblems: 0 },
)
eq('기록 없음', splitLog(null), { academyMinutes: 0, academyProblems: 0, homeworkMinutes: 0, homeworkProblems: 0 })

const splitStats = buildStats(
  [students[0]],
  indexLogs([mixedLog, logs[0]]),
  '2026-11-17',
  '2026-11-20',
)
eq('학생별 학원 합계', [splitStats[0].academyMinutes, splitStats[0].academyProblems], [130, 35])
eq('학생별 숙제 합계', [splitStats[0].homeworkMinutes, splitStats[0].homeworkProblems], [30, 15])
eq('학생별 전체 합계', [splitStats[0].minutes, splitStats[0].problems], [160, 50])
eq('나뉜 값과 합계가 같으면 기타 없음', splitStats[0].otherMinutes, 0)
eq('기간 밖 기록은 종류별로도 제외', buildStats([students[1]], indexLogs([{ ...mixedLog, student_id: 'b', date: '2026-10-01' }]), '2026-11-17', '2026-11-20')[0].academyMinutes, 0)
const summed = sumSplits(splitStats)
eq('합계 집계', [summed.minutes, summed.academyMinutes, summed.homeworkMinutes], [160, 130, 30])
const editedStats = buildStats([students[0]], indexLogs([{ ...mixedLog, minutes: 140 }]), '2026-11-17', '2026-11-20')
eq('합계만 고친 기록은 기타로', editedStats[0].otherMinutes, 40)
eq('기타 합계 집계', sumSplits(editedStats).otherMinutes, 40)

/* 관리자 기록 수정: 학원·숙제 따로 입력 → 합계 자동 */
const legacyEdit = editValuesFromLog(logs[0])
eq('수정 초기값: 예전 기록은 학원 공부', legacyEdit.values, {
  academyMinutes: 60,
  academyProblems: 10,
  homeworkMinutes: 0,
  homeworkProblems: 0,
})
eq('수정 초기값: 예전 기록 안내', [legacyEdit.filledFromTotal, legacyEdit.filledMinutes], [true, 60])
const mixedEdit = editValuesFromLog(mixedLog)
eq('수정 초기값: 나뉜 기록은 그대로', mixedEdit.values, {
  academyMinutes: 70,
  academyProblems: 25,
  homeworkMinutes: 30,
  homeworkProblems: 15,
})
eq('수정 초기값: 나뉜 기록은 안내 없음', mixedEdit.filledFromTotal, false)
eq(
  '수정 초기값: 모자란 합계는 학원 공부로 채움',
  editValuesFromLog({ ...mixedLog, academy_minutes: 0, academy_problems: 0, homework_minutes: 20, homework_problems: 5 }).values,
  { academyMinutes: 80, academyProblems: 35, homeworkMinutes: 20, homeworkProblems: 5 },
)
eq('수정 초기값: 기록 없음', editValuesFromLog(null).values, {
  academyMinutes: 0,
  academyProblems: 0,
  homeworkMinutes: 0,
  homeworkProblems: 0,
})
eq('수정 합계 = 학원 + 숙제', editTotals({ academyMinutes: 45, academyProblems: 12, homeworkMinutes: 25, homeworkProblems: 8 }), {
  minutes: 70,
  problems: 20,
})
eq('수정 합계: 음수·소수·빈 칸 정리', normalizeEditValues({ academyMinutes: -5, academyProblems: 3.7, homeworkMinutes: 12.9, homeworkProblems: Number.NaN }), {
  academyMinutes: 0,
  academyProblems: 3,
  homeworkMinutes: 12,
  homeworkProblems: 0,
})
eq('수정 저장 뒤 합계가 줄지 않음(예전 기록)', editTotals(legacyEdit.values), { minutes: 60, problems: 10 })
eq('수정 저장 뒤 합계 그대로(나뉜 기록)', editTotals(mixedEdit.values), { minutes: 100, problems: 40 })
eq('수정 저장 뒤 합계 그대로(합계만 고친 기록)', editTotals(editValuesFromLog({ ...mixedLog, minutes: 140 }).values), {
  minutes: 140,
  problems: 40,
})

/* 인바디형 비율 */
eq('비율 3:1', splitPercents(90, 30), { academy: 75, homework: 25 })
eq('비율은 항상 합 100', splitPercents(1, 2), { academy: 33, homework: 67 })
eq('비율(숙제만)', splitPercents(0, 45), { academy: 0, homework: 100 })
eq('비율(기록 없음)', splitPercents(0, 0), { academy: 0, homework: 0 })

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

/* 학생 화면 기기 확인(스마트폰·태블릿만 허용, 컴퓨터는 차단) */
const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  ipadDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  iphoneKakao:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.2',
  androidPhone:
    'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
  chromeos:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
}

eq('기기 허용(아이폰)', isStudentScreenBlocked({ userAgent: UA.iphone, maxTouchPoints: 5 }), false)
eq('기기 허용(아이패드)', isStudentScreenBlocked({ userAgent: UA.ipad, maxTouchPoints: 5 }), false)
eq(
  '기기 허용(아이패드가 맥처럼 보일 때)',
  isStudentScreenBlocked({ userAgent: UA.ipadDesktop, maxTouchPoints: 5, platform: 'MacIntel' }),
  false,
)
eq('기기 허용(아이폰 카톡 안)', isStudentScreenBlocked({ userAgent: UA.iphoneKakao, maxTouchPoints: 5 }), false)
eq('기기 허용(안드로이드 폰)', isStudentScreenBlocked({ userAgent: UA.androidPhone, maxTouchPoints: 5 }), false)
eq('기기 허용(안드로이드 태블릿)', isStudentScreenBlocked({ userAgent: UA.androidTablet, maxTouchPoints: 5 }), false)
eq('기기 허용(User-Agent 줄어든 안드로이드)', isStudentScreenBlocked({ userAgent: 'Mozilla/5.0 (Linux; Android 10; K)', maxTouchPoints: 5 }), false)
eq('기기 차단(맥)', isStudentScreenBlocked({ userAgent: UA.mac, maxTouchPoints: 0, platform: 'MacIntel' }), true)
eq('기기 차단(윈도우)', isStudentScreenBlocked({ userAgent: UA.windows, maxTouchPoints: 0, platform: 'Win32' }), true)
eq(
  '기기 차단(터치스크린 윈도우 노트북)',
  isStudentScreenBlocked({ userAgent: UA.windows, maxTouchPoints: 10, platform: 'Win32' }),
  true,
)
eq('기기 차단(리눅스)', isStudentScreenBlocked({ userAgent: UA.linux, maxTouchPoints: 0 }), true)
eq('기기 차단(크롬북)', isStudentScreenBlocked({ userAgent: UA.chromeos, maxTouchPoints: 0 }), true)
eq('기기 차단(User-Agent 없음)', isStudentScreenBlocked({}), true)
eq('기기 허용(터치 없는 아이패드 User-Agent)', isStudentScreenBlocked({ userAgent: UA.ipad, maxTouchPoints: 0 }), false)
eq('기기(맥 + 터치 1개는 컴퓨터)', isMobileOrTablet({ userAgent: UA.mac, maxTouchPoints: 1 }), false)
eq('SSR: 브라우저 정보 없음 → 컴퓨터로 처리', isStudentScreenBlocked(readDeviceFingerprint()), true)

/* '선오공에게 질문하기' Q&A — 배지·정렬·파일 고르기·7일 정리 계산 */
const questionBase: StudyQuestion = {
  id: 'q1',
  student_id: 'a',
  memo: '3번에서 막혔어요',
  image_path: 'a/1700000000000-token.jpg',
  answer: null,
  answer_media_path: null,
  answered_at: null,
  answered_by: '선오공이',
  student_read_at: null,
  created_at: '2026-11-20T05:00:00Z',
  updated_at: '2026-11-20T05:00:00Z',
}
const answeredQuestion: StudyQuestion = {
  ...questionBase,
  id: 'q2',
  answer: '통분하면 돼요',
  answer_media_path: 'answers/q2-1-token.mp4',
  answered_at: '2026-11-20T06:00:00Z',
}
const readQuestion: StudyQuestion = { ...answeredQuestion, id: 'q3', student_read_at: '2026-11-20T07:00:00Z' }

const questionList = [readQuestion, questionBase, answeredQuestion]
eq('질문: 답변 없음', isAnswered(questionBase), false)
eq('질문: 빈 답변은 답변 아님', isAnswered({ ...questionBase, answer: '   ' }), false)
eq('질문: 답변 있음', isAnswered(answeredQuestion), true)
eq('질문: 사진만 보낸 답변도 답변 완료', isAnswered({ ...questionBase, answer: null, answered_at: '2026-11-21T00:00:00Z' }), true)
eq('질문: 새 답변(안 읽음)', isUnreadAnswer(answeredQuestion), true)
eq('질문: 읽은 답변은 배지 없음', isUnreadAnswer(readQuestion), false)
eq('질문: 답변 대기에는 새 답변 없음', isUnreadAnswer(questionBase), false)
eq('질문: 상태 문구(대기)', answerStateLabel(questionBase), '답변 대기')
eq('질문: 상태 문구(완료)', answerStateLabel(answeredQuestion), '답변 완료')
eq('질문: 답변 대기 수', countUnanswered(questionList), 1)
eq('질문: 새 답변 수', countUnreadAnswers(questionList), 1)
eq('질문: 필터(대기)', filterQuestions(questionList, 'waiting').map((q) => q.id), ['q1'])
eq('질문: 필터(완료)', filterQuestions(questionList, 'answered').map((q) => q.id), ['q3', 'q2'])
eq('질문: 필터(전체)', filterQuestions(questionList, 'all').length, 3)

const olderWaiting: StudyQuestion = { ...questionBase, id: 'old', created_at: '2026-11-01T05:00:00Z' }
const newerAnswered: StudyQuestion = { ...answeredQuestion, id: 'new-answered', created_at: '2026-11-20T09:00:00Z' }
const newerWaiting: StudyQuestion = { ...questionBase, id: 'new-waiting', created_at: '2026-11-20T10:00:00Z' }
eq(
  '질문: 관리자 정렬(답변 대기 먼저, 그 안에서 최근 순)',
  sortQuestionsForAdmin([olderWaiting, newerAnswered, newerWaiting]).map((q) => q.id),
  ['new-waiting', 'old', 'new-answered'],
)

eq('질문: 메모 정리(줄바꿈·공백)', normalizeMemo('  3번\n\n에서   막혔어요 '), '3번 에서 막혔어요')
eq('질문: 메모 최대 길이', normalizeMemo('가'.repeat(QUESTION_MEMO_MAX + 20)).length, QUESTION_MEMO_MAX)
eq('질문: 답변은 줄바꿈 유지', normalizeAnswer('  첫 줄\r\n둘째 줄  '), '첫 줄\n둘째 줄')
eq('질문: 시각 표시(한국 시간)', formatQuestionTime('2026-11-20T05:05:00Z'), '11월 20일 (금) 14:05')
eq('질문: 시각 표시(값 없음)', formatQuestionTime(null), '')

eq('질문: 사진 경로', questionImagePath('abc-123', 1700000000000, 'tok123'), 'abc-123/1700000000000-tok123.jpg')
eq('질문: 사진 경로(이상한 글자 제거)', questionImagePath('a/b:c', 1, 't'), 'abc/1-t.jpg')
eq('답변: 영상 경로', answerMediaPath('q1', 'MP4', 1, 't'), 'answers/q1-1-t.mp4')
eq('답변: 확장자(동영상)', mediaExtension({ type: 'video/quicktime', name: 'clip.mov' }), 'mov')
eq('답변: 확장자(이름으로)', mediaExtension({ type: '', name: 'clip.webm' }), 'webm')
eq('답변: 확장자(사진)', mediaExtension({ type: 'image/jpeg', name: 'a' }), 'jpg')
eq('답변: 종류(경로)', [mediaKindFromPath('a/1.jpg'), mediaKindFromPath('answers/1.mov'), mediaKindFromPath('a/x')], ['image', 'video', null])
eq('답변: 종류(파일)', [mediaKindOfFile({ type: 'video/mp4' }), mediaKindOfFile({ type: '', name: 'a.MOV' }), mediaKindOfFile({ type: 'application/pdf' })], ['video', 'video', null])
const answerFile = (size: number, type: string, name = 'a'): File =>
  ({ size, type, name }) as unknown as File
eq('답변: 사진 허용', validateAnswerMedia(answerFile(1024, 'image/jpeg', 'a.jpg')), null)
eq(
  '답변: 50MB 넘는 영상 막음',
  validateAnswerMedia(answerFile(ANSWER_MEDIA_MAX_BYTES + 1, 'video/mp4', 'a.mp4')),
  '영상은 50MB까지만 올릴 수 있어요. 1분 안팎으로 짧게 찍어 주세요.',
)
eq('답변: 50MB 영상 허용', validateAnswerMedia(answerFile(ANSWER_MEDIA_MAX_BYTES, 'video/webm', 'a.webm')), null)
eq(
  '답변: 사진·영상이 아니면 막음',
  validateAnswerMedia(answerFile(100, 'application/pdf', 'a.pdf')),
  '사진(JPG·PNG)이나 동영상(MP4·WebM·MOV)만 올릴 수 있어요.',
)
eq('답변: 파일 없음', validateAnswerMedia(null), '해설지 사진이나 영상을 골라주세요.')

eq('사진 크기(긴 쪽 맞추기)', fitInside(4000, 3000, 1400), { width: 1400, height: 1050 })
eq('사진 크기(작으면 그대로)', fitInside(800, 600, 1400), { width: 800, height: 600 })
eq('사진 크기(세로 사진)', fitInside(1200, 4000, 1400), { width: 420, height: 1400 })
eq('사진 크기(0·음수 안전)', [fitInside(0, 0, 1400), fitInside(-5, 10, 1400)], [{ width: 1, height: 1 }, { width: 1, height: 10 }])

eq('정리: 7일 기준 시각', cleanupCutoffIso(7, Date.parse('2026-11-21T00:00:00Z')), '2026-11-14T00:00:00.000Z')
eq('정리: 8일 지난 답변은 대상', isCleanupTarget({ ...answeredQuestion, answered_at: '2026-11-10T00:00:00Z' }, '2026-11-14T00:00:00.000Z'), true)
eq('정리: 3일 지난 답변은 그대로', isCleanupTarget({ ...answeredQuestion, answered_at: '2026-11-18T00:00:00Z' }, '2026-11-14T00:00:00.000Z'), false)
eq('정리: 답변 대기는 지우지 않음', isCleanupTarget(questionBase, '2026-11-14T00:00:00.000Z'), false)
eq(
  '정리: 답변 시각이 없으면 수정 시각으로',
  isCleanupTarget({ ...answeredQuestion, answered_at: null, updated_at: '2026-11-01T00:00:00Z' }, '2026-11-14T00:00:00.000Z'),
  true,
)
eq('자동 정리 설정(기본 켜짐)', [parseAutoCleanup(null), parseAutoCleanup('on')], [true, true])
eq('자동 정리 설정(끄기)', [parseAutoCleanup('off'), parseAutoCleanup('OFF')], [false, false])
eq('질문: 학생 이름(조인 배열)', questionStudent({ ...questionBase, students: [{ name: '이지빈', grade: '초1' }] }).name, '이지빈')
eq('질문: 학생 이름(조인 없음)', questionStudent(questionBase).name, '학생')
const joinedQuestion: StudyQuestion = { ...questionBase, students: [{ name: '강은서', grade: '중1' }] }
const savedWithoutJoin: StudyQuestion = { ...joinedQuestion, students: null, answer: '통분하면 돼요', answered_at: '2026-11-21T00:00:00Z' }
eq('질문: 답변 저장 뒤 학생 이름 유지', questionStudent(mergeQuestion(joinedQuestion, savedWithoutJoin)).name, '강은서')
eq('질문: 답변 저장 뒤 답변 반영', mergeQuestion(joinedQuestion, savedWithoutJoin).answer, '통분하면 돼요')
eq('질문: 답변 저장 뒤 읽음 표시 초기화', mergeQuestion({ ...joinedQuestion, student_read_at: '2026-11-20T00:00:00Z' }, savedWithoutJoin).student_read_at, null)

/* 새 질문 웹 푸시 알림 */
const vapidBytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
eq('알림: VAPID 공개 키 길이(65바이트)', vapidBytes.length, 65)
eq('알림: VAPID 공개 키 머리(0x04)', vapidBytes[0], 4)
eq('알림: base64url - _ 처리', Array.from(urlBase64ToUint8Array('-_8')).join(','), '251,255')
eq(
  '알림: 기기 판별',
  [
    detectPushPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari', 5),
    detectPushPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5),
    detectPushPlatform('Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 Chrome/120', 5),
    detectPushPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', 0),
    detectPushPlatform('', 0),
  ],
  ['ios', 'ios', 'android', 'desktop', 'other'],
)
eq('알림: 홈 화면 앱 판별', [isStandaloneDisplay(true, undefined), isStandaloneDisplay(false, true), isStandaloneDisplay(false, undefined)], [true, true, false])
const avail = (o: Partial<Parameters<typeof pushAvailability>[0]>) =>
  pushAvailability({ platform: 'android', standalone: false, hasServiceWorker: true, hasPushManager: true, hasNotification: true, ...o })
eq(
  '알림: 켤 수 있는 브라우저',
  [avail({}), avail({ platform: 'desktop' }), avail({ platform: 'ios', standalone: true })],
  ['ready', 'ready', 'ready'],
)
eq('알림: 아이폰인데 홈 화면 추가 전', avail({ platform: 'ios' }), 'needs-install')
eq('알림: 푸시 미지원 브라우저', [avail({ hasPushManager: false }), avail({ hasServiceWorker: false }), avail({ hasNotification: false })], ['unsupported', 'unsupported', 'unsupported'])
eq('알림: 상태 이름', [pushStateLabel('on'), pushStateLabel('off'), pushStateLabel('denied')], ['알림 켜짐', '알림 꺼짐', '알림이 막혀 있음'])
eq('알림: 아이폰 안내', pushStateHint('needs-install', 'ios'), PUSH_IOS_INSTALL_MESSAGE)
eq('알림: 미지원 안내', pushStateHint('unsupported', 'desktop'), PUSH_UNSUPPORTED_MESSAGE)
eq(
  '알림: 구독 저장 모양',
  toSubscriptionRow({ endpoint: 'https://push.example/abc', keys: { p256dh: 'pk', auth: 'au' } }, 'UA'),
  { endpoint: 'https://push.example/abc', p256dh: 'pk', auth: 'au', user_agent: 'UA' },
)
eq(
  '알림: 키가 빠진 구독은 저장 안 함',
  [toSubscriptionRow(null), toSubscriptionRow({ endpoint: 'x' }), toSubscriptionRow({ endpoint: 'x', keys: { p256dh: 'p' } })],
  [null, null, null],
)
eq('알림: 만료 구독 코드', [isExpiredSubscription(404), isExpiredSubscription(410), isExpiredSubscription(400), isExpiredSubscription(undefined)], [true, true, false, false])
eq('알림: 질문 알림 본문', questionPushBody('  이지빈 '), '이지빈 학생이 질문을 올렸어요!')
eq('알림: 이름 없을 때 본문', questionPushBody(null), '학생이 질문을 올렸어요!')
eq(
  '알림: 서버 오류를 읽을 말로',
  [
    pushApiErrorMessage(503, { error: 'push_not_configured' }),
    pushApiErrorMessage(401, { error: 'unauthorized' }),
    pushApiErrorMessage(400, { error: 'invalid_question' }),
    pushApiErrorMessage(500, {}),
  ].map((text) => [text.startsWith('알림 서버 키'), text.length > 10]),
  [
    [true, true],
    [false, true],
    [false, true],
    [false, true],
  ],
)
eq(
  '알림: 테스트 결과 요약',
  [
    pushResultSummary({ sent: 0, removed: 0, devices: 0 }),
    pushResultSummary({ sent: 2, removed: 1, devices: 3 }),
    pushResultSummary({ sent: 1, removed: 0, devices: 1 }),
  ],
  [
    '알림 받을 기기가 없어요. 먼저 이 기기에서 알림을 켜 주세요.',
    '테스트 알림을 2대에 보냈어요. (만료된 기기 1대는 정리했어요)',
    '테스트 알림을 1대에 보냈어요.',
  ],
)
eq('알림: 제목·본문 상수', [PUSH_TITLE, PUSH_TEST_BODY.length > 0], ['선오공 새 질문', true])

console.log(failed === 0 ? 'ALL LIB TESTS PASSED' : `${failed} FAILED`)