/** 순수 함수(날짜·집계·랭킹) 점검용 테스트 (개발용) */
import { addDays, formatHMS, formatMinutes, formatMinutesCompact, kstDateString, monthRange, rangeDates, weekRange, weekdayOf, kstDayEndMs, kstMidnightMs } from '../src/lib/time'
import { buildStats, hasScopedLog, indexLogs, longestStreakAllTime, longestStreakInRange, rankByKind, rankEntries, rankValue, scopeLabel, scopeShortLabel, scopedDays, scopedLogMinutes, scopedLogProblems, scopedMinutes, scopedProblems, splitLog, splitPercents, studentsWithoutKind, sumSplits } from '../src/lib/stats'
import { editTotals, editValuesFromLog, normalizeEditValues } from '../src/lib/logEdit'
import { computeElapsedSeconds, isHeartbeatStale, pausedSecondsOf } from '../src/lib/session'
import {
  autoEndNotice,
  PAUSE_AUTO_END_SECONDS,
  PAUSE_CHECK_SECONDS,
  pauseStage,
  pendingProblemQueue,
  pendingProblemSummary,
  problemsFromInput,
  secondsUntilAutoEnd,
} from '../src/lib/pauseWatch'
import { normalizeKind, pausesOnLeave } from '../src/lib/kinds'
import {
  draftProblemsOf,
  draftProblemsText,
  isUploadingPhotos,
  newPhotoItem,
  nextPhotoIndex,
  photoCountOf,
  photoPathsOf,
  photoRoomOf,
  photosToUpload,
  restorePhotoItems,
  shouldReopenDraft,
} from '../src/lib/homeworkPhotos'
import {
  PHOTO_ALBUM_LABEL,
  PHOTO_CAMERA_LABEL,
  isPhotoFile,
  mergePhotoFiles,
  photoRoom,
} from '../src/lib/photoPick'
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
  adminSessionState,
  cloudItems,
  cloudMotion,
  DEFAULT_NICKNAME,
  displayNickname,
  BLACK_DRAGON,
  CANDY_TICKET_COST,
  canCraftColorDragon,
  canCraftRainbowDragon,
  canExchangeCandy,
  canExchangeCandyPick,
  canExchangeSecretTicket,
  candyExchangeText,
  candyPickCount,
  candyPickLeft,
  candyPickStatusText,
  candyPickText,
  canPickCandyStar,
  normalizeCandyPick,
  pickCandyStar,
  unpickCandyStar,
  COLOR_DRAGON_COST,
  DRAGONS,
  dragonballCountText,
  dragonballDex,
  dragonballIcon,
  dragonballIconCount,
  dragonballKinds,
  dragonballPower,
  dragonballSets,
  dragonballSummaryText,
  dragonballTotal,
  dragonColorKinds,
  dragonCraftText,
  dragonDex,
  dragonIcon,
  dragonName,
  dragonSummaryText,
  dragonTotal,
  EMPTY_DRAGONBALLS,
  EMPTY_DRAGONS,
  normalizeDragonballMap,
  normalizeBlackDragon,
  normalizeDragonMap,
  RAINBOW_DRAGON,
  RAINBOW_DRAGON_COST,
  starListText,
  formatLiveClock,
  grantResultText,
  GRANT_MODE_LABEL,
  grantTargets,
  hasRunningRow,
  liveRanking,
  liveStrip,
  myLivePosition,
  normalizeGrantAmount,
  normalizeNickname,
  normalizeTicketCount,
  SECRET_TICKET,
  SHENRON_ICON,
  SHENRON_SUMMON_TITLE,
  summonMessage,
  TICKET_BY_KEY,
  TICKETS,
  ticketChips,
  ticketCounts,
  ticketSummaryText,
  ticketTotal,
  NICKNAME_MAX,
  pausedLabels,
  tickSeconds,
  uniqueLabels,
  validateNickname,
  type LiveRow,
} from '../src/lib/kintounBoard'
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
import {
  ADMIN_TAB_ORDER,
  SWIPE_BLOCKING_SELECTOR,
  SWIPE_MIN_DISTANCE,
  SWIPE_SCROLL_SLACK,
  SWIPE_SLOPE_RATIO,
  gestureFrom,
  isHorizontalScroller,
  isSingleTouch,
  resolveTabSwipe,
  swipeBlockReason,
  swipeDirection,
  tabAfterSwipe,
  type SwipeNode,
} from '../src/lib/adminSwipe'
import type { Student, StudyLog, StudySession } from '../src/lib/types'
import type { StudyQuestion } from '../src/lib/types'
import type { HomeworkSubmission } from '../src/lib/types'
import {
  HOMEWORK_COMMENT_MAX,
  HOMEWORK_FILTER_LABEL,
  HOMEWORK_PHOTO_MAX,
  HOMEWORK_PHOTO_MAX_SIZE,
  HOMEWORK_PHOTO_QUALITY,
  HOMEWORK_PRAISE_CHIPS,
  HOMEWORK_REASON_MAX,
  HOMEWORK_REJECT_CHIPS,
  HOMEWORK_SUBMIT_GUIDE,
  approvedLine,
  canAddPhotos,
  countPending,
  filterSubmissions,
  formatSubmissionTime,
  hasRejectedPart,
  homeworkPhotoPath,
  homeworkSubmitProblem,
  mergePendingItems,
  needsProblemCount,
  nextPendingSubmission,
  normalizeComment,
  normalizeReason,
  pendingHomeworkQueue,
  photoCount,
  rejectReasonText,
  reviewBlockReason,
  reviewDefaults,
  reviewResultText,
  showsTeacherComment,
  sortSubmissionsForAdmin,
  studyWindowText,
  submissionLine,
  submissionStatusLabel,
  submissionStudent,
  submissionSummary,
  teacherCommentText,
  toggleChip,
  verdictLabel,
} from '../src/lib/homeworkBoard'
import { pickQuote, QUOTES } from '../src/lib/quotes'

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

/* 통계 구분 — 모든 통계를 전체 / 학원 공부 / 숙제 공부로 따로 */
eq('구분 이름', [scopeLabel('all'), scopeLabel('academy'), scopeLabel('homework')], ['전체', '🏫 학원 공부', '🏠 숙제 공부'])
eq('짧은 구분 이름', [scopeShortLabel('all'), scopeShortLabel('academy'), scopeShortLabel('homework')], [
  '합계',
  '🏫 학원',
  '🏠 숙제',
])
eq('학생별 학원만', [scopedMinutes(splitStats[0], 'academy'), scopedProblems(splitStats[0], 'academy')], [130, 35])
eq('학생별 숙제만', [scopedMinutes(splitStats[0], 'homework'), scopedProblems(splitStats[0], 'homework')], [30, 15])
eq('학생별 합계', [scopedMinutes(splitStats[0], 'all'), scopedProblems(splitStats[0], 'all')], [160, 50])
eq('하루 기록 학원만', [scopedLogMinutes(mixedLog, 'academy'), scopedLogProblems(mixedLog, 'academy')], [70, 25])
eq('하루 기록 숙제만', [scopedLogMinutes(mixedLog, 'homework'), scopedLogProblems(mixedLog, 'homework')], [30, 15])
eq('하루 기록 합계', [scopedLogMinutes(mixedLog, 'all'), scopedLogProblems(mixedLog, 'all')], [100, 40])
eq('하루 기록 없음', [scopedLogMinutes(null, 'academy'), scopedLogProblems(undefined, 'homework')], [0, 0])
eq('예전 기록(종류 없음)은 학원으로', scopedLogMinutes(logs[0], 'academy'), 60)
eq('그 구분 기록 있는 날', [hasScopedLog(mixedLog, 'academy'), hasScopedLog(mixedLog, 'homework'), hasScopedLog({ ...mixedLog, homework_minutes: 0, homework_problems: 0 }, 'homework'), hasScopedLog(null, 'all')], [true, true, false, false])
eq('문제만 있는 날도 기록으로', hasScopedLog({ ...mixedLog, minutes: 4, academy_minutes: 0, academy_problems: 0, homework_minutes: 0, homework_problems: 12 }, 'homework'), true)
eq('구분별 기록한 날 수', [scopedDays(splitStats[0], 'all'), scopedDays(splitStats[0], 'academy'), scopedDays(splitStats[0], 'homework')], [2, 2, 1])
const kindStudents: Student[] = [
  { id: 'k1', name: '가학생', code: '0201', grade: '초5', created_at: '' },
  { id: 'k2', name: '나학생', code: '0202', grade: '중1', created_at: '' },
  { id: 'k3', name: '다학생', code: '0203', grade: '중2', created_at: '' },
]
const kindLogs: StudyLog[] = [
  { id: 'x1', student_id: 'k1', date: '2026-11-17', minutes: 50, problems: 5, academy_minutes: 50, academy_problems: 5, homework_minutes: 0, homework_problems: 0, updated_at: '' },
  { id: 'x2', student_id: 'k2', date: '2026-11-18', minutes: 40, problems: 4, academy_minutes: 0, academy_problems: 0, homework_minutes: 40, homework_problems: 4, updated_at: '' },
]
const kindIndex = indexLogs(kindLogs)
eq('미제출: 기록 없음', studentsWithoutKind(kindStudents, kindIndex, '2026-11-17', '2026-11-18', 'all').map((s) => s.name), ['다학생'])
eq('미제출: 학원 기록 없는 학생', studentsWithoutKind(kindStudents, kindIndex, '2026-11-17', '2026-11-18', 'academy').map((s) => s.name), [
  '나학생',
  '다학생',
])
eq('미제출: 숙제 기록 없는 학생', studentsWithoutKind(kindStudents, kindIndex, '2026-11-17', '2026-11-18', 'homework').map((s) => s.name), [
  '가학생',
  '다학생',
])
eq('미제출: 기간 안에 기록이 있으면 제외', studentsWithoutKind(kindStudents, kindIndex, '2026-11-17', '2026-11-17', 'academy').map((s) => s.name), [
  '나학생',
  '다학생',
])
eq('미제출: 그날 다른 종류만 있으면 그 종류는 미제출', studentsWithoutKind(kindStudents, kindIndex, '2026-11-18', '2026-11-18', 'academy').map((s) => s.name), [
  '가학생',
  '나학생',
  '다학생',
])

/* 랭킹 — 전체 공부시간 / 학원 공부 / 숙제 공부 / 드래곤볼 따로 */
const rankStudents: Student[] = [
  { id: 'r1', name: '가학생', code: '0101', grade: '초6', created_at: '', dragonball_count: 5 },
  { id: 'r2', name: '나학생', code: '0102', grade: '중1', created_at: '', nickname: '달토끼', dragonball_count: 12 },
  { id: 'r3', name: '다학생', code: '0103', grade: '중1', created_at: '', dragonball_count: 0 },
]
const rankLogs: StudyLog[] = [
  { id: 'q1', student_id: 'r1', date: '2026-11-17', minutes: 100, problems: 10, academy_minutes: 80, academy_problems: 8, homework_minutes: 20, homework_problems: 2, updated_at: '' },
  { id: 'q2', student_id: 'r2', date: '2026-11-17', minutes: 100, problems: 10, academy_minutes: 20, academy_problems: 2, homework_minutes: 80, homework_problems: 8, updated_at: '' },
  { id: 'q3', student_id: 'r3', date: '2026-11-18', minutes: 30, problems: 3, academy_minutes: 30, academy_problems: 3, homework_minutes: 0, homework_problems: 0, updated_at: '' },
]
const rankStats = buildStats(rankStudents, indexLogs(rankLogs), '2026-11-17', '2026-11-19')
eq('랭킹: 전체 공부시간 순서', rankByKind(rankStats, 'all').map((row) => [row.student.name, row.value]), [
  ['가학생', 100],
  ['나학생', 100],
  ['다학생', 30],
])
eq('랭킹: 학원 공부만 따로', rankByKind(rankStats, 'academy').map((row) => [row.student.name, row.value]), [
  ['가학생', 80],
  ['다학생', 30],
  ['나학생', 20],
])
eq('랭킹: 숙제 공부만 따로(0은 빼기)', rankByKind(rankStats, 'homework').map((row) => [row.student.name, row.value]), [
  ['나학생', 80],
  ['가학생', 20],
])
eq('랭킹: 드래곤볼 보유 순서', rankByKind(rankStats, 'dragonball').map((row) => [row.student.name, row.value]), [
  ['나학생', 12],
  ['가학생', 5],
])
eq('랭킹: 드래곤볼 값은 기간과 무관', rankValue(rankStats[0], 'dragonball'), 5)
eq('랭킹: 드래곤볼 없으면 0', rankValue({ ...rankStats[2], student: { ...rankStats[2].student, dragonball_count: undefined } }, 'dragonball'), 0)
eq('랭킹: 드래곤볼 동점은 같은 순위', rankByKind(rankStats.map((stat, i) => ({ ...stat, student: { ...stat.student, dragonball_count: i === 0 ? 9 : i === 1 ? 9 : 0 } })), 'dragonball').map((row) => row.rank), [1, 1])

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

/* 쉬는 시간(일시정지) — 30분 알림 · 60분 자동 종료 */
eq('쉬는 시간 상수', [PAUSE_CHECK_SECONDS, PAUSE_AUTO_END_SECONDS], [1800, 3600])
eq('쉬는 시간(진행 중이면 0)', pausedSecondsOf(baseSession, at('2026-11-19T03:00:00Z')), 0)
eq('쉬는 시간(끝난 세션이면 0)', pausedSecondsOf({ ...baseSession, status: 'finished' }, at('2026-11-19T03:00:00Z')), 0)
eq('쉬는 시간(없으면 0)', [pausedSecondsOf(null, at('2026-11-19T03:00:00Z')), pausedSecondsOf(undefined, Date.now())], [0, 0])
eq(
  '쉬는 시간(일시정지 25분 30초)',
  pausedSecondsOf({ ...baseSession, status: 'paused', paused_at: '2026-11-19T01:05:00Z' }, at('2026-11-19T01:30:30Z')),
  1530,
)
eq(
  '쉬는 시간(일시정지 시각이 없으면 0)',
  pausedSecondsOf({ ...baseSession, status: 'paused', paused_at: null }, at('2026-11-19T03:00:00Z')),
  0,
)
eq('단계: 아직', [pauseStage(0), pauseStage(1799)], ['none', 'none'])
eq('단계: 30분 알림', [pauseStage(1800), pauseStage(3599)], ['check', 'check'])
eq('단계: 60분 자동 종료', [pauseStage(3600), pauseStage(9000)], ['auto', 'auto'])
eq('단계: 값이 이상하면 아직', [pauseStage(-5), pauseStage(Number.NaN)], ['none', 'none'])
eq('자동 종료까지', [secondsUntilAutoEnd(0), secondsUntilAutoEnd(1800), secondsUntilAutoEnd(3599)], [3600, 1800, 1])
eq('자동 종료까지(지났으면 0)', [secondsUntilAutoEnd(3600), secondsUntilAutoEnd(7200)], [0, 0])
eq('문제 수 입력값', [problemsFromInput(''), problemsFromInput('0'), problemsFromInput('017')], [0, 0, 17])
eq('문제 수 입력값(문자·최대값)', [problemsFromInput('12a3'), problemsFromInput('12345'), problemsFromInput('-7')], [123, 9999, 7])

/* 자동 종료된 지난 공부 — 문제 수를 물어볼 목록 */
const pendingBase: StudySession = {
  ...baseSession,
  status: 'finished',
  kind: 'homework',
  date: '2026-11-21',
  ended_at: '2026-11-21T10:00:00Z',
  minutes: 80,
  problems: null,
  problems_pending: true,
}
const later = { ...pendingBase, id: 'p2', ended_at: '2026-11-21T12:00:00Z' }
const earlier = { ...pendingBase, id: 'p1', ended_at: '2026-11-21T09:00:00Z' }
eq(
  '문제 수 대기 목록: 끝난·미입력·공부한 세션만 오래된 것부터',
  pendingProblemQueue([
    later,
    { ...pendingBase, id: 'running', status: 'running' },
    { ...pendingBase, id: 'done', problems_pending: false, problems: 12 },
    { ...pendingBase, id: 'zero', minutes: 0 },
    earlier,
    later,
  ]).map((session) => session.id),
  ['p1', 'p2'],
)
eq('문제 수 대기 목록(없으면 빈 목록)', [pendingProblemQueue(null), pendingProblemQueue([])], [[], []])
eq('지난 공부 표시', pendingProblemSummary(pendingBase), '11월 21일 (토) · 🏠 숙제 공부 · 1시간 20분 공부')
eq('지난 공부 표시(학원·짧은 공부)', pendingProblemSummary({ ...pendingBase, kind: 'academy', minutes: 25 }), '11월 21일 (토) · 🏫 학원 공부 · 25분 공부')
eq(
  '자동 종료 안내',
  autoEndNotice(70),
  '쉬는 지 60분이 지나서 자동으로 마무리했어요. 1시간 10분 공부한 것으로 저장했고, 푼 문제 수를 입력해 주세요.',
)
eq('자동 종료 안내(0분)', autoEndNotice(0), '쉬는 지 60분이 지나서 자동으로 마무리했어요. 푼 문제 수를 입력해 주세요.')

/* 근두운 — 닉네임 · 실시간 현황 · 드래곤볼 */
eq('근두운: 닉네임 앞뒤 공백', normalizeNickname('  수학왕  '), '수학왕')
eq('근두운: 닉네임 최대 길이', normalizeNickname('가'.repeat(NICKNAME_MAX + 5)), '가'.repeat(NICKNAME_MAX))
eq('근두운: 빈 닉네임은 null', [normalizeNickname('   '), normalizeNickname(null)], [null, null])
eq('근두운: 닉네임 없으면 수련생', displayNickname(''), DEFAULT_NICKNAME)
eq('근두운: 닉네임이 있으면 그대로', displayNickname(' 달토끼 '), '달토끼')
eq('근두운: 10자 넘으면 저장 안 함', validateNickname('가'.repeat(NICKNAME_MAX + 1)).ok, false)
eq('근두운: 빈 값은 수련생으로 되돌리기', validateNickname('  '), { ok: true, value: null })
eq('근두운: 닉네임 줄바꿈은 공백으로', validateNickname('수학\n왕'), { ok: true, value: '수학 왕' })

eq('근두운: 시간 표시(0)', formatLiveClock(0), '00:00')
eq('근두운: 시간 표시(65초)', formatLiveClock(65), '01:05')
eq('근두운: 시간 표시(한 시간 넘음)', formatLiveClock(3725), '1:02:05')
eq('근두운: 흐른 시간 더하기(공부 중)', tickSeconds({ status: 'running', seconds: 60 }, 1000, 11_000), 70)
eq('근두운: 쉬는 중은 그대로', tickSeconds({ status: 'paused', seconds: 60 }, 1000, 11_000), 60)
eq('근두운: 시간은 5시간에서 멈춤', tickSeconds({ status: 'running', seconds: 17_990 }, 0, 60_000), 18000)

const liveRows: LiveRow[] = [
  { nickname: '수련생', status: 'running', started_at: '2026-11-21T01:00:00Z', seconds: 600 },
  { nickname: '수련생', status: 'running', started_at: '2026-11-21T00:30:00Z', seconds: 1800 },
  { nickname: '달토끼', status: 'running', started_at: '2026-11-21T01:10:00Z', seconds: 600, is_me: true },
  { nickname: '느림보', status: 'paused', started_at: '2026-11-21T01:20:00Z', seconds: 120 },
]
eq('근두운: 같은 이름은 A·B 로 구분', uniqueLabels(liveRows), ['수련생 B', '수련생 A', '달토끼', '느림보'])
eq('근두운: 구름은 공부 중인 사람만', cloudItems(liveRows).clouds.map((c) => c.label), ['수련생 A', '수련생 B', '달토끼'])
eq('근두운: 구름 개수 넘치면 외 N명', cloudItems(liveRows, 2), {
  clouds: [
    { label: '수련생 A', seconds: 1800, isMe: false },
    { label: '수련생 B', seconds: 600, isMe: false },
  ],
  hidden: 1,
})
eq('근두운: 타이머 줄 인원은 서버 값', liveStrip(liveRows, 5, 2).count, 5)
eq('근두운: 타이머 줄 이름·외 N명', liveStrip(liveRows, 3, 2), {
  count: 3,
  items: [
    { label: '수련생 A', seconds: 1800, isMe: false },
    { label: '수련생 B', seconds: 600, isMe: false },
  ],
  hidden: 1,
})
eq('근두운: 서버 인원이 없으면 줄에서 셈', liveStrip(liveRows, null, 2).count, 3)
eq('근두운: 타이머 줄 내 이름 표시', liveStrip(liveRows, 3, 3).items.map((item) => item.isMe), [false, false, true])
eq('근두운: 실시간 순위(멈추지 않은 사람만, 동점은 같은 순위)', liveRanking(liveRows).map((row) => [row.position, row.label]), [
  [1, '수련생 A'],
  [2, '수련생 B'],
  [2, '달토끼'],
])
eq('근두운: 내 순위', myLivePosition(liveRows), { position: 2, total: 3 })
eq('근두운: 공부 중이 아니면 내 순위 없음', myLivePosition([liveRows[3]]), null)
/* 타이머 줄 — 내 세션이 서버 현황에 실렸는지(막 시작한 순간 판단) */
eq('근두운: 내 세션이 공부 중으로 실림', hasRunningRow(liveRows), true)
eq('근두운: 내가 쉬는 중이면 실린 것으로 보지 않음', hasRunningRow([liveRows[3]]), false)
eq('근두운: 내가 아직 안 실린 현황', hasRunningRow(liveRows.slice(0, 2)), false)
eq('근두운: 줄이 비어 있으면 당연히 없음', hasRunningRow([]), false)
eq('근두운: 잠깐 쉬는 이름', pausedLabels(liveRows), ['느림보'])
eq('근두운: 구름마다 다른 박자', cloudMotion(0).duration, '3.80s')
eq('근두운: 박자는 초 단위', [cloudMotion(1).duration.endsWith('s'), cloudMotion(2).drift.endsWith('s'), cloudMotion(3).delay.startsWith('-')], [true, true, true])

eq('드래곤볼: 아이콘은 12개까지', dragonballIconCount(20), { filled: 12, extra: 8 })
eq('드래곤볼: 적으면 그대로', dragonballIconCount(5), { filled: 5, extra: 0 })
eq('드래곤볼: 세트 계산(15개)', dragonballSets(15), { sets: 2, rest: 1 })
eq('드래곤볼: 개수 표시', dragonballCountText(0), '0개')
eq('드래곤볼: 쏠 개수는 1~99', [normalizeGrantAmount(0), normalizeGrantAmount(150), normalizeGrantAmount('3.7'), normalizeGrantAmount('abc')], [1, 99, 3, 1])
eq('드래곤볼: 쏠 대상은 공부 중인 학생', grantTargets(liveRows, false).map((row) => row.status), ['running', 'running', 'running'])
eq('드래곤볼: 쉬는 중 포함', grantTargets(liveRows, true).length, 4)
eq('드래곤볼: 결과 안내(전체)', grantResultText(3, 2, 'all'), '공부 중인 3명에게 드래곤볼 2개씩 랜덤으로 쏘았어요!')
eq('드래곤볼: 결과 안내(개별)', grantResultText(1, 1, 'single'), '드래곤볼 1개를 쏘았어요.')
eq('드래곤볼: 결과 안내(개별·성구)', grantResultText(1, 2, 'single', [7, 4]), '드래곤볼 2개 — 7성구 · 4성구')
eq('드래곤볼: 받을 학생 없음', grantResultText(0, 1, 'all'), '드래곤볼을 받을 학생이 없어요.')

/* 1~7성구 도감 */
const dexSample = { '1': 0, '2': 0, '3': 0, '4': 2, '5': 0, '6': 1, '7': 0 }
eq('성구: 없는 값은 0으로', normalizeDragonballMap(null), { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 })
eq('성구: 이상한 값은 0으로', normalizeDragonballMap({ '4': -3, '6': '2', '9': 5, '7': 'abc' })[6], 2)
eq('성구: 9성구 키는 버린다', Object.keys(normalizeDragonballMap({ '9': 5 })), ['1', '2', '3', '4', '5', '6', '7'])
eq('성구: 총 개수', dragonballTotal(dexSample), 3)
eq('성구: 모은 종류 수', dragonballKinds(dexSample), 2)
eq('성구: 빈 도감', [dragonballTotal(EMPTY_DRAGONBALLS), dragonballKinds(EMPTY_DRAGONBALLS)], [0, 0])
eq('성구: 요약 문구', dragonballSummaryText(dexSample), '3개 · 2/7종 수집')
eq('성구: 도감은 일곱 칸', dragonballDex(dexSample).map((slot) => [slot.stars, slot.count, slot.owned]), [
  [1, 0, false],
  [2, 0, false],
  [3, 0, false],
  [4, 2, true],
  [5, 0, false],
  [6, 1, true],
  [7, 0, false],
])
eq('성구: 아이콘 주소', [dragonballIcon(1), dragonballIcon(4), dragonballIcon(7)], [
  '/dragonballs/1.png',
  '/dragonballs/4.png',
  '/dragonballs/7.png',
])
eq('성구: 아이콘 주소는 1~7로 제한', [dragonballIcon(0), dragonballIcon(9), dragonballIcon(3.7)], [
  '/dragonballs/1.png',
  '/dragonballs/7.png',
  '/dragonballs/3.png',
])
eq('성구: 목록 글(중복은 ×N)', starListText([1, 1, 1, 4, 6]), '1성구 ×3 · 4성구 · 6성구')
eq('성구: 목록 글(두 개)', starListText([7, 4]), '7성구 · 4성구')
eq('성구: 목록 글(없음)', starListText([]), '')
eq('성구: 목록 글은 네 종까지', starListText([1, 2, 3, 4, 5]), '1성구 · 2성구 · 3성구 · 4성구 외 1종')
eq('드래곤볼: 이력 표시', [GRANT_MODE_LABEL.all, GRANT_MODE_LABEL.single], ['전체 일괄', '개별'])

/* 일반용 7종 — 1~7성구를 하나씩 합쳐서 뽑는다 */
const fullSet = { '1': 1, '2': 2, '3': 1, '4': 1, '5': 1, '6': 1, '7': 1 }
eq('일반용: 1~7성구를 다 모으면 뽑을 수 있다', canCraftColorDragon(fullSet), true)
eq('일반용: 한 종류라도 없으면 못 뽑는다', canCraftColorDragon({ ...fullSet, '3': 0 }), false)
eq('일반용: 빈 도감은 못 뽑는다', canCraftColorDragon(EMPTY_DRAGONBALLS), false)
eq('일반용: 이상한 값은 못 뽑는다', canCraftColorDragon(null), false)
eq('일반용: 뽑는 값은 성구 7개', COLOR_DRAGON_COST, 7)
eq('일반용: 일곱 색', DRAGONS.map((dragon) => dragon.key), ['red', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple'])
eq('일반용: 이름', DRAGONS.map((dragon) => dragon.name), ['빨간용', '주황용', '노란용', '초록용', '파란용', '남용', '보라용'])

const dragonsSample = { red: 2, orange: 0, yellow: 1, green: 0, blue: 0, navy: 0, purple: 3 }
eq('일반용: 맵 정리(없는 값 0, 소수 버림)', normalizeDragonMap({ red: '2', blue: -1, green: 1.9 }), {
  red: 2,
  orange: 0,
  yellow: 0,
  green: 1,
  blue: 0,
  navy: 0,
  purple: 0,
})
eq('일반용: 빈 맵', normalizeDragonMap(null), EMPTY_DRAGONS)
eq('일반용: 총 마리 수', dragonTotal(dragonsSample), 6)
eq('일반용: 모은 색 수', dragonColorKinds(dragonsSample), 3)
eq('일반용: 요약 문구', dragonSummaryText(dragonsSample), '6마리 · 3/7색')
eq(
  '일반용: 도감 일곱 칸',
  dragonDex(dragonsSample).map((slot) => [slot.key, slot.count, slot.owned]),
  [
    ['red', 2, true],
    ['orange', 0, false],
    ['yellow', 1, true],
    ['green', 0, false],
    ['blue', 0, false],
    ['navy', 0, false],
    ['purple', 3, true],
  ],
)
eq('일반용: 이름 찾기', [dragonName('navy'), dragonName('x')], ['남용', '드래곤'])
eq('일반용: 아이콘 주소', dragonIcon('purple'), '/dragonballs/dragon-purple.png')
eq('일반용: 태어난 안내', dragonCraftText('red'), '빨간용이 태어났어요!')

/* 무지개용 — 일반용 7종을 하나씩 합친다 */
const oneEach = { red: 1, orange: 1, yellow: 1, green: 1, blue: 1, navy: 1, purple: 1 }
eq('무지개용: 7종을 다 모으면 만들 수 있다', canCraftRainbowDragon(oneEach), true)
eq('무지개용: 한 색이 없으면 못 만든다', canCraftRainbowDragon({ ...oneEach, purple: 0 }), false)
eq('무지개용: 빈 맵은 못 만든다', canCraftRainbowDragon(EMPTY_DRAGONS), false)
eq('무지개용: 합성 값은 7마리', RAINBOW_DRAGON_COST, 7)
eq('무지개용: 이름', RAINBOW_DRAGON.name, '무지개용')
eq('무지개용: 아이콘은 신룡', [RAINBOW_DRAGON.icon, SHENRON_ICON], ['/dragonballs/shenron.png', '/dragonballs/shenron.png'])
eq('무지개용: 합친 뒤 안내', summonMessage(2, 5), '일반용 7종을 합쳐 무지개용 2마리째를 만들었어요. 남은 일반용은 5마리!')
eq('무지개용: 등장 제목', SHENRON_SUMMON_TITLE, '짜잔! 무지개용 등장!')

/* 교환권 — 사탕 · 1,000P · 10,000P */
eq('사탕: 성구 2개면 바꿀 수 있다', [canExchangeCandy({ '1': 2 }), canExchangeCandy({ '1': 1 }), canExchangeCandy(EMPTY_DRAGONBALLS)], [true, false, false])
eq('사탕: 1장에 성구 2개', CANDY_TICKET_COST, 2)
eq(
  '교환권: 개수 정리',
  [normalizeTicketCount(2), normalizeTicketCount(-1), normalizeTicketCount('3'), normalizeTicketCount(null)],
  [2, 0, 3, 0],
)
eq(
  '교환권: 세 종류 읽기',
  ticketCounts({ candy_tickets: 1, point_1000_tickets: 2, point_10000_tickets: 0 }),
  { candy: 1, point1000: 2, point10000: 0, secret: 0 },
)
eq('교환권: 합계', ticketTotal({ candy: 1, point1000: 2, point10000: 3, secret: 0 }), 6)
eq(
  '교환권: 요약(0장은 뺀다)',
  ticketSummaryText({ candy: 1, point1000: 0, point10000: 2, secret: 0 }),
  '사탕교환권 1장 · 10,000포인트 교환권 2장',
)
eq(
  '교환권: 아무것도 없음',
  ticketSummaryText({ candy: 0, point1000: 0, point10000: 0, secret: 0 }),
  '아직 교환권이 없어요',
)
eq(
  '교환권: 이름',
  [TICKET_BY_KEY.candy.name, TICKET_BY_KEY.point1000.name, TICKET_BY_KEY.point10000.name],
  ['사탕교환권', '1,000포인트 교환권', '10,000포인트 교환권'],
)
eq('교환권: 세 종류 순서', TICKETS.map((ticket) => ticket.key), ['candy', 'point1000', 'point10000'])
eq('사탕: 바꾼 성구 안내', candyExchangeText([5, 5]), '5성구 · 5성구 → 사탕교환권 1장으로 바꿨어요!')
eq('사탕: 성구가 안 오면 짧게', candyExchangeText(null), '사탕교환권 1장으로 바꿨어요!')

/* 사탕교환권: 쓸 성구 2개를 학생이 직접 고른다 */
const pickStars = { '1': 1, '2': 0, '3': 2, '4': 0, '5': 3, '6': 0, '7': 0 }
eq(
  '사탕고르기: 고른 목록 정리 — 1~7성구만, 두 개까지',
  [normalizeCandyPick([3, 3]), normalizeCandyPick([0, 8, 5]), normalizeCandyPick(null), normalizeCandyPick(['3', 7.9])],
  [[3, 3], [5], [], [3, 7]],
)
eq('사탕고르기: 같은 성구 2개도 고를 수 있다', pickCandyStar(pickStars, [3], 3), [3, 3])
eq('사탕고르기: 가진 개수를 넘겨 고를 수 없다', pickCandyStar(pickStars, [1], 1), [1])
eq('사탕고르기: 없는 성구는 못 고른다', [canPickCandyStar(pickStars, [], 2), canPickCandyStar(pickStars, [], 4)], [false, false])
eq('사탕고르기: 없는 성구를 골라도 그대로', pickCandyStar(pickStars, [], 4), [])
eq('사탕고르기: 두 개를 고르면 더 못 고른다', [canPickCandyStar(pickStars, [3, 5], 5), canPickCandyStar(pickStars, [3, 3], 5)], [false, false])
eq('사탕고르기: 서로 다른 성구 두 개', pickCandyStar(pickStars, [1], 5), [1, 5])
eq(
  '사탕고르기: 고른 칸 하나만 빼기',
  [unpickCandyStar([3, 3], 0), unpickCandyStar([3, 3], 1), unpickCandyStar([1, 5], 9)],
  [[3], [3], [1, 5]],
)
eq(
  '사탕고르기: 두 개를 다 골랐을 때만 바꿀 수 있다',
  [canExchangeCandyPick(pickStars, [3, 3]), canExchangeCandyPick(pickStars, [1, 5]), canExchangeCandyPick(pickStars, [3]), canExchangeCandyPick(pickStars, [])],
  [true, true, false, false],
)
eq('사탕고르기: 가진 개수보다 많으면 바꿀 수 없다', canExchangeCandyPick(pickStars, [1, 1]), false)
eq(
  '사탕고르기: 남은 개수',
  [candyPickLeft(pickStars, [3], 3), candyPickLeft(pickStars, [3, 3], 3), candyPickLeft(pickStars, [5], 3), candyPickLeft(pickStars, [], 2)],
  [1, 0, 2, 0],
)
eq(
  '사탕고르기: 상태 문구',
  [candyPickStatusText([]), candyPickStatusText([3]), candyPickStatusText([1, 5])],
  ['2개 더 고르세요', '1개 더 고르세요', '2개를 다 골랐어요'],
)
eq(
  '사탕고르기: 고른 성구 이름',
  [candyPickText([3, 3]), candyPickText([5, 1]), candyPickText([])],
  ['3성구 · 3성구', '5성구 · 1성구', '아직 고르지 않았어요'],
)
eq('사탕고르기: 칸별 고른 개수', [candyPickCount([3, 3], 3), candyPickCount([1, 5], 3)], [2, 0])

/* 히든 검은용 · 시크릿쿠폰 — 가진 학생에게만 화면에 보인다 */
eq('히든: 이름·아이콘', [BLACK_DRAGON.name, BLACK_DRAGON.icon], ['검은용', '/dragonballs/dragon-black.png'])
eq('히든: 마리 수 정리', [normalizeBlackDragon(2), normalizeBlackDragon(-1), normalizeBlackDragon(null)], [2, 0, 0])
eq('히든: 검은용이 있으면 바꿀 수 있다', [canExchangeSecretTicket(1), canExchangeSecretTicket(0)], [true, false])
eq('히든: 시크릿쿠폰 이름', [SECRET_TICKET.name, SECRET_TICKET.icon], ['시크릿쿠폰', '/dragonballs/ticket-secret.png'])
eq(
  '히든: 교환권 세 장에는 시크릿쿠폰이 없다',
  ticketChips({ candy: 1, point1000: 0, point10000: 0, secret: 0 }).map((ticket) => ticket.key),
  ['candy', 'point1000', 'point10000'],
)
eq(
  '히든: 가진 학생에게만 시크릿쿠폰 칩',
  ticketChips({ candy: 0, point1000: 0, point10000: 0, secret: 2 }).map((ticket) => ticket.key),
  ['candy', 'point1000', 'point10000', 'secret'],
)
eq('히든: 교환권 합계에 시크릿 포함', ticketTotal({ candy: 1, point1000: 0, point10000: 0, secret: 2 }), 3)
eq(
  '히든: 요약 문구에 시크릿 포함',
  ticketSummaryText({ candy: 0, point1000: 0, point10000: 0, secret: 1 }),
  '시크릿쿠폰 1장',
)

/* 드래곤볼 힘 — 바꿔도 랭킹이 급격히 떨어지지 않게 쓴 만큼 센다 */
eq('드래곤볼 힘: 일반용 1마리 = 성구 7개', dragonballPower({ dragonballs: { '1': 1, '2': 2 }, dragons: { red: 1 } }), 10)
eq('드래곤볼 힘: 무지개용 1마리 = 성구 49개', dragonballPower({ dragons: { red: 1 }, rainbow_dragon_count: 1 }), 56)
eq('드래곤볼 힘: 남은 성구만', dragonballPower({ dragonballs: { '1': 1, '2': 2 } }), 3)
eq('드래곤볼 힘: 성구 맵이 없으면 개수로', dragonballPower({ dragonball_count: 4, dragons: { blue: 1 } }), 11)
eq(
  '랭킹: 일반용으로 바꾼 학생이 앞선다',
  rankByKind(
    [
      { ...rankStats[0], student: { ...rankStats[0].student, dragonball_count: 4, dragonballs: { '1': 4 } } },
      {
        ...rankStats[1],
        student: { ...rankStats[1].student, dragonball_count: 0, dragonballs: EMPTY_DRAGONBALLS, dragons: { red: 1 } },
      },
    ],
    'dragonball',
  ).map((row) => row.student.name),
  ['나학생', '가학생'],
)

eq('관리자: 학원 공부는 그대로 공부 중', adminSessionState({ ...baseSession, kind: 'academy' }, at('2026-11-19T01:10:00Z')).status, 'running')
eq(
  '관리자: 숙제 공부가 30초 넘게 신호가 없으면 쉬는 중',
  adminSessionState({ ...baseSession, kind: 'homework' }, at('2026-11-19T01:10:31Z')).status,
  'paused',
)
eq(
  '관리자: 쉬는 중으로 보면 시간도 마지막 신호에서 멈춤',
  adminSessionState({ ...baseSession, kind: 'homework' }, at('2026-11-19T03:00:00Z')).seconds,
  600,
)

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

/* 관리자 모바일 좌우 스와이프 탭 이동 */
eq('스와이프: 탭 순서', ADMIN_TAB_ORDER.join(','), 'dashboard,kintoun,homework,questions,students,ranking')
eq('스와이프: 기준값', [SWIPE_MIN_DISTANCE, SWIPE_SLOPE_RATIO, SWIPE_SCROLL_SLACK], [60, 1.5, 4])
eq('스와이프: 손가락 하나만', [isSingleTouch(1), isSingleTouch(0), isSingleTouch(2)], [true, false, false])
eq('스와이프: 이동 거리', gestureFrom({ x: 200, y: 100 }, { x: 120, y: 108 }), { dx: -80, dy: 8 })

eq('스와이프 방향: 왼쪽으로 밀면 다음 탭', swipeDirection({ dx: -80, dy: 10 }), 'next')
eq('스와이프 방향: 오른쪽으로 밀면 이전 탭', swipeDirection({ dx: 80, dy: -10 }), 'prev')
eq('스와이프 방향: 60px 은 넘어감', swipeDirection({ dx: -60, dy: 0 }), 'next')
eq('스와이프 방향: 59px 은 그대로', swipeDirection({ dx: -59, dy: 0 }), null)
eq('스와이프 방향: 세로로 40px 넘게 움직이면 그대로', swipeDirection({ dx: 90, dy: 60 }), null)
eq('스와이프 방향: 61px 이면 넘어감', swipeDirection({ dx: 61, dy: 40 }), 'prev')
eq('스와이프 방향: 세로 스크롤은 그대로', swipeDirection({ dx: -20, dy: -300 }), null)
eq('스와이프 방향: 비스듬해도 가로가 확실하면 넘어감', swipeDirection({ dx: 120, dy: 40 }), 'prev')
eq('스와이프 방향: 값이 없으면 그대로', [swipeDirection({ dx: Number.NaN, dy: 0 }), swipeDirection({ dx: 100, dy: Number.NaN })], [null, null])
eq('스와이프 방향: 기준값을 바꿀 수 있음', [swipeDirection({ dx: -30, dy: 0 }, 25), swipeDirection({ dx: -30, dy: 40 }, 25, 1)], ['next', null])

eq('스와이프 탭 위치: 첫 탭에서 이전은 없음', tabAfterSwipe(0, 'prev'), null)
eq('스와이프 탭 위치: 다음', [tabAfterSwipe(0, 'next'), tabAfterSwipe(4, 'next'), tabAfterSwipe(5, 'prev')], [1, 5, 4])
eq('스와이프 탭 위치: 끝 탭에서 다음은 없음', tabAfterSwipe(5, 'next'), null)
eq('스와이프 탭 위치: 탭 개수를 넘는 위치는 없음', [tabAfterSwipe(9, 'next'), tabAfterSwipe(-1, 'next'), tabAfterSwipe(2, 'next', 2)], [null, null, null])

eq('스와이프 결과: 왼쪽으로 밀면 다음 탭', resolveTabSwipe({ dx: -100, dy: 5, index: 1 }), 2)
eq('스와이프 결과: 오른쪽으로 밀면 이전 탭', resolveTabSwipe({ dx: 100, dy: 5, index: 1 }), 0)
eq('스와이프 결과: 끝 탭에서는 그대로', [resolveTabSwipe({ dx: -100, dy: 0, index: 5 }), resolveTabSwipe({ dx: 100, dy: 0, index: 0 })], [null, null])
eq('스와이프 결과: 막힌 곳에서 시작하면 그대로', resolveTabSwipe({ dx: -300, dy: 0, index: 2, blocked: true }), null)
eq('스와이프 결과: 이동이 모자라면 그대로', resolveTabSwipe({ dx: -20, dy: 0, index: 2 }), null)
eq('스와이프 결과: 탭 개수를 줄여 쓸 수 있음', resolveTabSwipe({ dx: -100, dy: 0, index: 1, count: 2 }), null)

eq('가로 넘김 상자: 넘칠 때만', [isHorizontalScroller({ scrollWidth: 505, clientWidth: 500 }), isHorizontalScroller({ scrollWidth: 504, clientWidth: 500 })], [true, false])
eq('가로 넘김 상자: 값이 없으면 아님', [isHorizontalScroller(null), isHorizontalScroller({}), isHorizontalScroller({ scrollWidth: 900 })], [false, false, false])

type FakeNode = SwipeNode
const fakeNode = (spec: Omit<FakeNode, 'parentElement'> = {}, parent: FakeNode | null = null): FakeNode => ({
  ...spec,
  parentElement: parent,
})
/** 태그 이름으로 선택자에 걸리는 가짜 노드 */
const tagNode = (tag: string, parent: FakeNode | null = null, extra: Omit<FakeNode, 'parentElement'> = {}): FakeNode =>
  fakeNode(
    {
      matches: (selector: string) =>
        selector
          .split(',')
          .map((part) => part.trim())
          .includes(tag),
      ...extra,
    },
    parent,
  )
/* 화면 전체(컨테이너 바깥)에 걸린 가로 넘김 상자 — 스와이프와 상관없다 */
const outerScroller = fakeNode({ scrollWidth: 1200, clientWidth: 360, matches: () => false })
const wrapper = fakeNode({ matches: () => false }, outerScroller)
const background = fakeNode({ matches: () => false }, wrapper)
const inputNode = tagNode('input', background)
const textareaNode = tagNode('textarea', background)
const dialogNode = tagNode('[role="dialog"]', background)
const editableNode = tagNode('[contenteditable="true"]', background)
const ignoreNode = tagNode('[data-swipe-ignore]', background)
const tableScroller = fakeNode({ scrollWidth: 900, clientWidth: 360, matches: () => false }, background)
const tableCell = fakeNode({ scrollWidth: 0, clientWidth: 0, matches: () => false }, tableScroller)
const verticalScroller = fakeNode({ scrollWidth: 360, clientWidth: 360, matches: () => false }, background)
const verticalChild = fakeNode({ matches: () => false }, verticalScroller)

eq('스와이프 예외: 입력창', swipeBlockReason(inputNode, wrapper), 'blocked')
eq('스와이프 예외: 여러 줄 입력·수정 가능한 곳', [swipeBlockReason(textareaNode, wrapper), swipeBlockReason(editableNode, wrapper)], ['blocked', 'blocked'])
eq('스와이프 예외: 모달', swipeBlockReason(dialogNode, wrapper), 'blocked')
eq('스와이프 예외: 표시해 둔 곳', swipeBlockReason(ignoreNode, wrapper), 'blocked')
eq('스와이프 예외: 안쪽 입력창도 조상까지 봄', swipeBlockReason(fakeNode({ matches: () => false }, inputNode), wrapper), 'blocked')
eq('스와이프 예외: 가로로 넘치는 표', swipeBlockReason(tableCell, wrapper), 'scroller')
eq('스와이프 예외: 세로로만 넘치는 상자는 통과', swipeBlockReason(verticalChild, wrapper), null)
eq('스와이프 예외: 그냥 빈 곳은 통과', swipeBlockReason(background, wrapper), null)
eq('스와이프 예외: 컨테이너 바깥 상자는 보지 않음', [swipeBlockReason(background, wrapper), swipeBlockReason(background, null)], [null, 'scroller'])
eq('스와이프 예외: 컨테이너 자신은 예외 아님', swipeBlockReason(wrapper, wrapper), null)
eq('스와이프 예외: 손가락 위치를 못 읽으면 통과', [swipeBlockReason(null, wrapper), swipeBlockReason(undefined)], [null, null])

/* 실제 흐름: 표를 옆으로 넘기면 탭은 그대로, 빈 곳을 밀면 탭이 넘어간다 */
const swipeOnTable = swipeBlockReason(tableCell, wrapper)
eq('스와이프 흐름: 표 안에서 밀면 탭 그대로', resolveTabSwipe({ dx: -140, dy: 6, index: 3, blocked: swipeOnTable !== null }), null)
eq('스와이프 흐름: 빈 곳에서 왼쪽으로 밀면 다음 탭', resolveTabSwipe({ dx: -140, dy: 6, index: 3, blocked: swipeBlockReason(background, wrapper) !== null }), 4)
eq('스와이프 흐름: 랭킹에서 더 밀어도 그대로', resolveTabSwipe({ dx: -140, dy: 6, index: 5, blocked: false }), null)
eq('스와이프 흐름: 학생 관리 표에서 오른쪽으로 밀면 질문함으로', resolveTabSwipe({ dx: 140, dy: -6, index: 4, blocked: false }), 3)
eq('스와이프 흐름: 실시간에서 왼쪽으로 밀면 숙제관리', resolveTabSwipe({ dx: -140, dy: 6, index: 1, blocked: false }), 2)
eq('스와이프 예외 목록에 입력·모달·표시 항목이 모두 있음', ['input', 'textarea', 'select', '[role="dialog"]', '[data-swipe-ignore]'].every((part) => SWIPE_BLOCKING_SELECTOR.split(',').includes(part)), true)

/* 숙제 공부 제출 — 사진 인증 · 시간/문항수 분리 승인 */
eq('숙제: 안내 문구는 확정 문구 그대로', HOMEWORK_SUBMIT_GUIDE, '오늘 공부한 페이지를 찍어올리고 푼 문제수를 적어주세요')
eq('숙제: 사진 최대 5장', HOMEWORK_PHOTO_MAX, 5)
eq('숙제: 올리기 전 줄이기(긴 변 1200px · JPEG 0.72)', [HOMEWORK_PHOTO_MAX_SIZE, HOMEWORK_PHOTO_QUALITY], [1200, 0.72])
eq('숙제: 빠른 반려 사유 3개', HOMEWORK_REJECT_CHIPS, ['풀이 흔적 부족', '답만 작성됨', '사진 식별 불가'])
eq(
  '숙제: 문제가 있으면 사진 1장 이상 필요',
  [homeworkSubmitProblem(1, 0), homeworkSubmitProblem(30, 0)],
  ['푼 문제가 있으면 공부한 페이지 사진을 1장 이상 올려주세요.', '푼 문제가 있으면 공부한 페이지 사진을 1장 이상 올려주세요.'],
)
eq('숙제: 사진이 있으면 그대로 제출', [homeworkSubmitProblem(1, 1), homeworkSubmitProblem(0, 2)], [null, null])
eq('숙제: 0문제는 사진 없이도 됨', homeworkSubmitProblem(0, 0), null)
eq('숙제: 5장을 넘으면 막힘', homeworkSubmitProblem(3, 6), '사진은 5장까지 올릴 수 있어요.')
eq('숙제: 5장까지 더 고를 수 있음', [canAddPhotos(0), canAddPhotos(4), canAddPhotos(5)], [true, true, false])
eq(
  '숙제: 사진 경로는 학생/세션 아래',
  homeworkPhotoPath('abc-123', 'sess-9', 2, 'jpg', 1700000000000, 'tok'),
  'abc-123/sess-9/1700000000000-2-tok.jpg',
)
eq('숙제: 상태 문구', [submissionStatusLabel({ status: 'pending' }), submissionStatusLabel({ status: 'approved' }), submissionStatusLabel({ status: 'rejected' })], ['승인 대기', '승인', '반려'])
eq('숙제: 필터 이름', HOMEWORK_FILTER_LABEL, { pending: '승인 대기', approved: '승인', rejected: '반려', all: '전체' })
eq(
  '숙제: 문제 수를 아직 모르면 물어봐야 함',
  [needsProblemCount({ status: 'pending', submitted_problems: null }), needsProblemCount({ status: 'pending', submitted_problems: 0 }), needsProblemCount({ status: 'approved', submitted_problems: null })],
  [true, false, false],
)
eq('숙제: 사진 수', [photoCount(['a', 'b']), photoCount([]), photoCount(null)], [2, 0, 0])

/* 사진 고르기 — 바로 찍기(카메라) · 앨범에서 고르기 */
const photo = (type = 'image/jpeg') => ({ type })
eq('사진: 버튼 이름은 확정 문구 그대로', [PHOTO_CAMERA_LABEL, PHOTO_ALBUM_LABEL], ['📷 바로 찍기', '🖼️ 앨범에서 고르기'])
eq('사진: 남은 자리', [photoRoom(0), photoRoom(3), photoRoom(5), photoRoom(9)], [5, 2, 0, 0])
eq('사진: 이상한 값도 안전', [photoRoom(-2), photoRoom(Number.NaN)], [5, 5])
eq('사진: 사진인지(빈 type 은 사진으로 봄)', [isPhotoFile(photo()), isPhotoFile(photo('')), isPhotoFile(photo('video/mp4'))], [true, true, false])
eq('사진: 두 장 담기', mergePhotoFiles([], [photo(), photo('image/png')]), { files: [photo(), photo('image/png')], error: null })
eq('사진: 앞에 담은 사진 뒤에 붙음', mergePhotoFiles([photo('image/png')], [photo()]).files.length, 2)
eq(
  '사진: 5장을 넘으면 남은 자리만 담고 알려 줌',
  mergePhotoFiles([photo(), photo(), photo(), photo()], [photo(), photo(), photo()]),
  { files: [photo(), photo(), photo(), photo(), photo()], error: '사진은 5장까지라서 1장만 담았어요.' },
)
eq('사진: 가득 차면 담지 않고 알려 줌', mergePhotoFiles([photo(), photo(), photo(), photo(), photo()], [photo()]), {
  files: [photo(), photo(), photo(), photo(), photo()],
  error: '사진은 5장까지 올릴 수 있어요.',
})
eq('사진: 사진이 아닌 파일은 빼고 담음', mergePhotoFiles([], [photo(), photo('application/pdf')]).files, [photo()])
eq('사진: 아무것도 안 고르면 그대로', mergePhotoFiles([photo()], []).files.length, 1)

const hw = (patch: Partial<HomeworkSubmission> = {}): HomeworkSubmission => ({
  id: 'h1',
  student_id: 'st1',
  session_id: 'se1',
  date: '2026-11-23',
  started_at: '2026-11-23T05:00:00.000Z',
  ended_at: '2026-11-23T05:40:00.000Z',
  submitted_minutes: 40,
  submitted_problems: 30,
  photo_paths: ['a.jpg'],
  status: 'pending',
  time_verdict: 'pending',
  problems_verdict: 'pending',
  approved_minutes: 0,
  approved_problems: 0,
  reject_reason: null,
  teacher_comment: null,
  submitted_at: '2026-11-23T05:41:00.000Z',
  reviewed_at: null,
  reviewed_by: null,
  created_at: '2026-11-23T05:41:00.000Z',
  updated_at: '2026-11-23T05:41:00.000Z',
  ...patch,
})

const hwList = [
  hw({ id: 'a', submitted_at: '2026-11-23T06:00:00.000Z' }),
  hw({ id: 'b', submitted_at: '2026-11-23T04:00:00.000Z' }),
  hw({ id: 'c', status: 'approved', submitted_at: '2026-11-23T05:00:00.000Z', time_verdict: 'approved', problems_verdict: 'rejected', approved_minutes: 40, approved_problems: 0 }),
  hw({ id: 'd', status: 'rejected', submitted_at: '2026-11-22T05:00:00.000Z', time_verdict: 'rejected', problems_verdict: 'rejected', reject_reason: '풀이 흔적 부족' }),
]
eq('숙제: 승인 대기 수', countPending(hwList), 2)
eq('숙제: 필터별 개수', [filterSubmissions(hwList, 'pending').length, filterSubmissions(hwList, 'approved').length, filterSubmissions(hwList, 'rejected').length, filterSubmissions(hwList, 'all').length], [2, 1, 1, 4])
eq('숙제: 관리자 대기 목록은 오래된 것부터', sortSubmissionsForAdmin(hwList, 'pending').map((s) => s.id), ['b', 'a'])
eq('숙제: 처리 내역은 최근 것부터', [sortSubmissionsForAdmin(hwList, 'approved').map((s) => s.id), sortSubmissionsForAdmin(hwList, 'rejected').map((s) => s.id)], [['c'], ['d']])
eq('숙제: 학생 대기 목록은 승인 전만·오래된 순', pendingHomeworkQueue([...hwList, hw({ id: 'a' })]).map((s) => s.id), ['b', 'a'])
eq('숙제: 문제 수가 없어도 대기 목록에 들어감', pendingHomeworkQueue([hw({ id: 'x', submitted_problems: null })]).length, 1)
eq('숙제: 요약 문구', submissionSummary({ submitted_minutes: 40, submitted_problems: 30 }), '40분 · 30문제')
eq('숙제: 문제 수 미입력 표시', submissionSummary({ submitted_minutes: 0, submitted_problems: null }), '0분 · 문제 수 미입력')
eq('숙제: 홈 한 줄', submissionLine({ date: '2026-11-23', submitted_minutes: 80, submitted_problems: 12 }), '11월 23일 (월) · 1시간 20분 · 12문제')

eq(
  '숙제: 승인 결과 줄',
  [
    approvedLine(hw({ status: 'approved', time_verdict: 'approved', problems_verdict: 'rejected', approved_minutes: 40 })),
    approvedLine(hw({ status: 'approved', time_verdict: 'approved', problems_verdict: 'approved', approved_minutes: 40, approved_problems: 30 })),
    approvedLine(hw({ status: 'rejected', time_verdict: 'rejected', problems_verdict: 'rejected' })),
    approvedLine(hw()),
  ],
  ['시간 40분 승인 · 문항 0문제', '시간 40분 승인 · 문항 30문제 승인', '시간 0분 · 문항 0문제', ''],
)
eq('숙제: 부분 반려 판별', [hasRejectedPart(hw()), hasRejectedPart(hw({ time_verdict: 'rejected' })), hasRejectedPart(hw({ status: 'approved', time_verdict: 'approved', problems_verdict: 'rejected' }))], [false, true, true])
eq('숙제: 반려 사유 다듬기', rejectReasonText({ reject_reason: '  답만 작성됨 ' }), '답만 작성됨')
eq('숙제: 기본 선택은 시간·문항 모두 승인', reviewDefaults({ submitted_problems: 30 }), { timeApproved: true, problemsApproved: true })
eq('숙제: 문제 수가 없으면 문항수는 승인 못 함', reviewDefaults({ submitted_problems: null }), { timeApproved: true, problemsApproved: false })
eq('숙제: 이미 확인한 제출은 다시 저장 못 함', reviewBlockReason({ status: 'approved' }, true, true), '이미 확인한 제출이에요.')
eq('숙제: 모두 반려는 저장 가능(0으로 확정)', reviewBlockReason({ status: 'pending' }, false, false), '모두 반려예요. 저장하면 이 제출은 0분·0문제로 확정돼요.')
eq('숙제: 저장 결과 문구', [reviewResultText('approved', 40, 30), reviewResultText('approved', 40, 0), reviewResultText('rejected', 0, 0)], ['시간 40분 · 문항 30개 승인했어요.', '시간 40분 · 문항 0개 승인했어요.', '모두 반려했어요. 기록에는 0으로 남고 다시 제출하지 않아요.'])
eq('숙제: 승인 결과에 드래곤볼 문구 없음(별개)', [reviewResultText('approved', 40, 30), reviewResultText('rejected', 0, 0)].some((text) => text.includes('드래곤볼')), false)
eq('숙제: 반려 사유는 한 줄·300자까지', [normalizeReason('  풀이   흔적\n부족 '), normalizeReason('가'.repeat(HOMEWORK_REASON_MAX + 20)).length], ['풀이 흔적 부족', HOMEWORK_REASON_MAX])
eq('숙제: 다음 대기로 넘어감', nextPendingSubmission(hwList, 'b')?.id, 'a')
eq('숙제: 대기 중인 다른 건이 없으면 끝', nextPendingSubmission([hw({ id: 'a' })], 'a'), null)
eq('숙제: 시간 표시', [formatSubmissionTime('2026-11-23T05:41:00.000Z'), studyWindowText('2026-11-23T05:00:00.000Z', '2026-11-23T05:40:00.000Z')], ['11월 23일 (월) 14:41', '시작 14:00 · 끝 14:40'])
eq('숙제: 처리 항목 문구', [verdictLabel('approved'), verdictLabel('rejected'), verdictLabel('pending')], ['승인', '반려', '대기'])
eq('숙제: 학생 이름 찾기', [submissionStudent({ students: { name: '이지빈', grade: '초1' } }), submissionStudent({ students: [{ name: '김민수', grade: '중1' }] }), submissionStudent({ students: null })], [{ name: '이지빈', grade: '초1' }, { name: '김민수', grade: '중1' }, { name: '학생', grade: '미지정' }])

/* 숙제 승인 「선생님 칭찬 한마디」 */
eq('칭찬: 칩은 4~6개', HOMEWORK_PRAISE_CHIPS.length >= 4 && HOMEWORK_PRAISE_CHIPS.length <= 6, true)
eq('칭찬: 칩 문구', HOMEWORK_PRAISE_CHIPS, ['풀이가 꼼꼼해요', '글씨가 깔끔해요', '어려운 문제 잘 고민했어요', '꾸준히 잘하고 있어요', '스스로 잘 풀었어요'])
eq('칭찬: 칩을 누르면 입력칸에 들어감', toggleChip('', '글씨가 깔끔해요'), '글씨가 깔끔해요')
eq('칭찬: 칩을 다시 누르면 빠짐', toggleChip('글씨가 깔끔해요', '글씨가 깔끔해요'), '')
eq('칭찬: 두 칩을 차례로', toggleChip(toggleChip('', '풀이가 꼼꼼해요'), '스스로 잘 풀었어요'), '풀이가 꼼꼼해요 스스로 잘 풀었어요')
eq('칭찬: 직접 쓴 글에 칩을 붙임', toggleChip('오늘도 수고했어요!', '꾸준히 잘하고 있어요'), '오늘도 수고했어요! 꾸준히 잘하고 있어요')
eq('칭찬: 칩을 빼도 직접 쓴 글은 그대로', toggleChip('오늘도 수고했어요! 꾸준히 잘하고 있어요', '꾸준히 잘하고 있어요'), '오늘도 수고했어요!')
eq('칭찬: 200자를 넘기면 칩을 넣지 않음', toggleChip('가'.repeat(HOMEWORK_COMMENT_MAX - 2), '글씨가 깔끔해요'), '가'.repeat(HOMEWORK_COMMENT_MAX - 2))
eq('칭찬 한마디: 공백을 한 줄로·200자까지', [normalizeComment('  풀이가\n  꼼꼼해요 '), normalizeComment('가'.repeat(HOMEWORK_COMMENT_MAX + 5)).length, normalizeComment(null)], ['풀이가 꼼꼼해요', HOMEWORK_COMMENT_MAX, ''])
eq('칭찬 한마디: 읽기', [teacherCommentText({ teacher_comment: ' 스스로 잘 풀었어요 ' }), teacherCommentText({ teacher_comment: null })], ['스스로 잘 풀었어요', ''])
eq(
  '칭찬 한마디: 승인한 건에만 민트 박스',
  [
    showsTeacherComment(hw({ status: 'approved', teacher_comment: '풀이가 꼼꼼해요' })),
    showsTeacherComment(hw({ status: 'approved', teacher_comment: '   ' })),
    showsTeacherComment(hw({ status: 'rejected', teacher_comment: '풀이가 꼼꼼해요' })),
    showsTeacherComment(hw({ status: 'pending', teacher_comment: '풀이가 꼼꼼해요' })),
  ],
  [true, false, false, false],
)

/* 지난 공부 마저 제출 — 학원(문제 수) · 숙제(사진+문제 수) 합치기 */
const sessionOf = (patch: Partial<StudySession> = {}): StudySession => ({
  id: 's1',
  student_id: 'st1',
  status: 'finished',
  started_at: '2026-11-23T04:00:00.000Z',
  paused_at: null,
  ended_at: '2026-11-23T04:30:00.000Z',
  last_heartbeat_at: '2026-11-23T04:30:00.000Z',
  paused_seconds: 0,
  auto_pause_count: 0,
  auto_paused_seconds: 0,
  date: '2026-11-23',
  minutes: 30,
  problems: null,
  problems_pending: true,
  created_at: '2026-11-23T04:00:00.000Z',
  ...patch,
})
eq(
  '지난 공부: 학원·숙제를 시간 순으로',
  mergePendingItems(
    [sessionOf({ id: 's1', ended_at: '2026-11-23T04:30:00.000Z' })],
    [hw({ id: 'h2', submitted_at: '2026-11-23T03:00:00.000Z', ended_at: '2026-11-23T03:00:00.000Z' })],
  ).map((item) => item.id),
  ['h2', 's1'],
)
eq('지난 공부: 숙제는 승인 대기만', mergePendingItems([], [hw({ id: 'x' }), hw({ id: 'y', status: 'approved' })]).length, 1)
eq('지난 공부: 둘 다 없으면 빈 목록', mergePendingItems(null, null), [])
eq('지난 공부: 숙제가 있으면 홈 카드 문구를 바꿈', mergePendingItems([], [hw({ id: 'x' })]).some((item) => item.type === 'homework'), true)

/* 「오늘의 한줄」 — 124개·출처·중복 없음·열 때마다 무작위 한 개 */
eq('한줄: 124개', QUOTES.length, 124)
eq('한줄: 빈 문구나 빈 출처 없음', QUOTES.every((q) => q.text.trim().length > 0 && q.source.trim().length > 0), true)
eq('한줄: 같은 문구가 두 번 들어 있지 않음', new Set(QUOTES.map((q) => q.text.trim())).size, QUOTES.length)
eq('한줄: 모든 명언에 출처가 붙어 있음', QUOTES.every((q) => q.source.trim().length >= 2), true)
eq('한줄: 카드에 들어갈 길이(문구 80자 이하)', QUOTES.every((q) => q.text.length <= 80), true)
eq('한줄: 첫머리는 에디슨, 99번째는 이순신, 100번째부터 만화·영화', [QUOTES[0].source, QUOTES[98].source, QUOTES[99].source], ['토머스 에디슨', '이순신 (『난중일기』, 1597)', '라피키 (『라이온 킹』)'])
eq('한줄: 만화·영화 명대사 25개가 뒤에 붙음', QUOTES.slice(99).length, 25)
eq('한줄: 만화·영화 25개 모두 출처에 작품(『』)이 있음', QUOTES.slice(99).every((q) => q.source.includes('『')), true)

/* 화면을 열 때마다 한 개를 무작위로 고르고, 번호는 항상 0~123 안에 들어온다 */
eq('한줄: 난수가 0이면 첫 번째', pickQuote(() => 0), 0)
eq('한줄: 난수가 1에 가까우면 마지막', [pickQuote(() => 0.999999), pickQuote(() => 1)], [QUOTES.length - 1, QUOTES.length - 1])
eq('한줄: 범위를 벗어난 난수도 안전', [pickQuote(() => -0.5), pickQuote(() => 7)], [0, QUOTES.length - 1])
eq('한줄: 난수 값이 이상하면 첫 번째', [pickQuote(() => Number.NaN), pickQuote(() => Number.POSITIVE_INFINITY)], [0, 0])
const quotePicks = Array.from({ length: 124 }, (_, i) => pickQuote(() => i / 124))
eq('한줄: 124개 모두 고를 수 있음', new Set(quotePicks).size, QUOTES.length)
eq('한줄: 번호는 0~123 정수', quotePicks.every((index) => Number.isInteger(index) && index >= 0 && index < QUOTES.length), true)
let quoteOutOfRange = 0
for (let i = 0; i <= 1000; i += 1) {
  const picked = pickQuote(() => i / 1000)
  if (!Number.isInteger(picked) || picked < 0 || picked >= QUOTES.length) quoteOutOfRange += 1
}
eq('한줄: 1,001번 고른 번호가 모두 범위 안', quoteOutOfRange, 0)


/* 숙제 사진 초안 — 사진·문제 수가 튕겨도 살아남는 계산 */
const itemA = newPhotoItem({ name: 'a.jpg', blob: new Blob(['a']), preview: 'blob:a', state: 'uploading' })
const itemB = newPhotoItem({ name: 'b.jpg', path: 's/1-b.jpg', preview: 'https://x/b', state: 'ready' })
const itemC = newPhotoItem({ name: 'c.jpg', blob: new Blob(['c']), preview: 'blob:c', state: 'error' })
eq('사진 초안: 항목 key 는 서로 다름', new Set([itemA.key, itemB.key, itemC.key]).size, 3)
eq('사진 초안: 올라간 경로만 제출용', photoPathsOf([itemA, itemB, itemC]), ['s/1-b.jpg'])
eq('사진 초안: 못 올린 사진 찾기', photosToUpload([itemA, itemB, itemC]).map((item) => item.name), ['a.jpg', 'c.jpg'])
eq('사진 초안: 담긴 장수', photoCountOf([itemA, itemB, itemC]), 3)
eq('사진 초안: 더 담을 수 있는 장수', photoRoomOf([itemA, itemB]), 3)
eq('사진 초안: 다섯 장이면 0', photoRoomOf([itemA, itemB, itemC, newPhotoItem({}), newPhotoItem({})]), 0)
eq('사진 초안: 올리는 중인가', [isUploadingPhotos([itemA, itemB]), isUploadingPhotos([itemB])], [true, false])
eq('사진 초안: 다음 번호는 담긴 수', nextPhotoIndex([itemA, itemB]), 2)
eq('사진 초안: 경로 목록에서 되살리기', restorePhotoItems(['s/1.jpg', 's/1.jpg', '', null, 's/2.jpg']).map((item) => item.path), ['s/1.jpg', 's/2.jpg'])
eq('사진 초안: 되살린 사진은 올라간 상태', restorePhotoItems(['s/1.jpg'], { 's/1.jpg': 'https://x/1' }).map((item) => [item.state, item.preview]), [['ready', 'https://x/1']])
eq('사진 초안: 서명 주소가 없어도 목록에 남김', restorePhotoItems(['s/9.jpg']).map((item) => item.preview), [null])
eq('사진 초안: 문제 수 → DB 값', [draftProblemsOf(''), draftProblemsOf('0'), draftProblemsOf('030'), draftProblemsOf('12a'), draftProblemsOf('99999')], [null, 0, 30, 12, 9999])
eq('사진 초안: DB 값 → 입력칸', [draftProblemsText(null), draftProblemsText(0), draftProblemsText(30)], ['', '', '30'])
eq('사진 초안: 창이 열려 있고 사진이 있으면 다시 연다', shouldReopenDraft({ draft_active: true, draft_open: true, photo_paths: ['s/1.jpg'], draft_problems: null }), true)
eq('사진 초안: 창이 열려 있고 문제 수만 있어도 다시 연다', shouldReopenDraft({ draft_active: true, draft_open: true, photo_paths: [], draft_problems: 12 }), true)
eq('사진 초안: 창을 닫았으면 다시 열지 않는다', shouldReopenDraft({ draft_active: true, draft_open: false, photo_paths: ['s/1.jpg'], draft_problems: 12 }), false)
eq('사진 초안: 빈 초안은 다시 열지 않는다', shouldReopenDraft({ draft_active: true, draft_open: true, photo_paths: [], draft_problems: null }), false)
eq('사진 초안: 진짜 제출 줄은 초안이 아님', shouldReopenDraft({ draft_active: false, draft_open: true, photo_paths: ['s/1.jpg'], draft_problems: 3 }), false)
eq('사진 초안: 초안이 없으면 false', [shouldReopenDraft(null), shouldReopenDraft(undefined)], [false, false])

console.log(failed === 0 ? 'ALL LIB TESTS PASSED' : `${failed} FAILED`)