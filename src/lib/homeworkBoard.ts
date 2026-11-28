/**
 * 숙제 공부 제출(사진 인증 · 승인 대기)에 쓰는 순수 함수들.
 * 화면 없이 값을 넣어 확인할 수 있게 계산·문구를 여기에 모아 둔다.
 *
 * · 학생: 숙제 공부를 끝낼 때 공부한 페이지 사진(최대 5장)과 푼 문제 수를 함께 낸다.
 *   낸 시간·문제 수는 바로 기록에 들어가지 않고 '승인 대기'로 남는다.
 * · 원장님: 시간과 문항수를 따로 승인/반려한다. 승인한 항목만 기록에 더하고,
 *   반려한 항목은 0으로 확정한다. (드래곤볼 지급과는 별개 — 이 기능은 드래곤볼을 주지 않는다)
 */
import { formatDateKo, formatMinutes, kstDateString, kstTimeString } from './time'
import type { HomeworkStatus, HomeworkSubmission, HomeworkVerdict, StudySession } from './types'

/** 한 번에 올릴 수 있는 숙제 사진 수 */
export const HOMEWORK_PHOTO_MAX = 5
/** 올리기 전 줄이는 긴 변 (px) — 무료 Storage 용량을 아낀다 */
export const HOMEWORK_PHOTO_MAX_SIZE = 1200
/** 다시 저장할 JPEG 품질 (장당 100~150KB 정도) */
export const HOMEWORK_PHOTO_QUALITY = 0.72
/** 숙제 사진·제출 안내 문구 (확정 문구 — 그대로 쓴다) */
export const HOMEWORK_SUBMIT_GUIDE = '오늘 공부한 페이지를 찍어올리고 푼 문제수를 적어주세요'
/** 사진 0장으로 제출을 누를 때 한 번 더 묻는 문구 (확정 문구 — 그대로 쓴다) */
export const HOMEWORK_NO_PHOTO_CONFIRM = '사진 없이 공부를 마치면 반려될 수 있습니다. 그래도 제출하시겠습니까?'
/** 반려 사유 빠른 선택 */
export const HOMEWORK_REJECT_CHIPS = ['풀이 흔적 부족', '답만 작성됨', '사진 식별 불가'] as const
/** 반려 사유 메모 최대 글자 수 (DB check 와 같다) */
export const HOMEWORK_REASON_MAX = 300
/** 승인할 때 남기는 「선생님 칭찬 한마디」 빠른 선택 (누르면 입력칸에 들어간다) */
export const HOMEWORK_PRAISE_CHIPS = [
  '풀이가 꼼꼼해요',
  '글씨가 깔끔해요',
  '어려운 문제 잘 고민했어요',
  '꾸준히 잘하고 있어요',
  '스스로 잘 풀었어요',
] as const
/** 칭찬 한마디 최대 글자 수 (DB check 와 같다) */
export const HOMEWORK_COMMENT_MAX = 200

export type HomeworkFilter = 'pending' | 'approved' | 'rejected' | 'all'

export const HOMEWORK_FILTER_LABEL: Record<HomeworkFilter, string> = {
  pending: '승인 대기',
  approved: '승인',
  rejected: '반려',
  all: '전체',
}

/** 승인 대기 / 승인 / 반려 */
export function submissionStatusLabel(submission: Pick<HomeworkSubmission, 'status'>): string {
  if (submission.status === 'approved') return '승인'
  if (submission.status === 'rejected') return '반려'
  return '승인 대기'
}

/** 반려 사유가 한 줄 보이도록 (없으면 빈 문자열) */
export function rejectReasonText(submission: Pick<HomeworkSubmission, 'reject_reason'>): string {
  return (submission.reject_reason ?? '').trim()
}

/** 선생님 칭찬 한마디 (없으면 빈 문자열) */
export function teacherCommentText(submission: Pick<HomeworkSubmission, 'teacher_comment'>): string {
  return (submission.teacher_comment ?? '').trim()
}

/**
 * 학생 화면에 칭찬 박스를 보일지 — 승인된 제출에 한마디가 있을 때만.
 * (모두 반려한 제출에는 서버도 칭찬을 남기지 않고, 화면도 보이지 않는다)
 */
export function showsTeacherComment(
  submission: Pick<HomeworkSubmission, 'status' | 'teacher_comment'>,
): boolean {
  return submission.status === 'approved' && teacherCommentText(submission).length > 0
}

/** 시간 또는 문항수가 반려됐는지 (부분 반려도 사유를 보여준다) */
export function hasRejectedPart(submission: Pick<HomeworkSubmission, 'time_verdict' | 'problems_verdict'>): boolean {
  return submission.time_verdict === 'rejected' || submission.problems_verdict === 'rejected'
}

/** 승인 전인데 문제 수를 아직 받지 못한 제출 — 다음 접속 때 물어본다 */
export function needsProblemCount(
  submission: Pick<HomeworkSubmission, 'status' | 'submitted_problems'> | null | undefined,
): boolean {
  if (!submission) return false
  return submission.status === 'pending' && submission.submitted_problems === null
}

/** 올린 사진 수 */
export function photoCount(paths: string[] | null | undefined): number {
  return (paths ?? []).filter((path) => Boolean(path)).length
}

/**
 * 제출 전 검사 — 사진은 필수가 아니다(2026-11-23 부터).
 * 사진이 0장이어도 제출할 수 있고, 대신 누를 때 한 번 더 묻는다(needsNoPhotoConfirm).
 * 5장을 넘기면 막는다. 문제 수는 이제 막는 데 쓰지 않는다.
 * 막아야 하면 안내 문구, 아니면 null.
 */
export function homeworkSubmitProblem(_problems: number, photos: number): string | null {
  const photoTotal = Number.isFinite(photos) ? Math.max(0, Math.floor(photos)) : 0
  if (photoTotal > HOMEWORK_PHOTO_MAX) return `사진은 ${HOMEWORK_PHOTO_MAX}장까지 올릴 수 있어요.`
  return null
}

/**
 * 제출 버튼을 눌렀을 때 사진 없이 내도 되는지 한 번 더 물어야 하는가.
 * 사진이 0장이고 아직 확인을 받지 않았으면 true — 화면은 확인 창을 띄우고,
 * 확인을 누르면 confirmed=true 로 다시 불러 바로 제출한다.
 */
export function needsNoPhotoConfirm(photos: number, confirmed = false): boolean {
  if (confirmed) return false
  const photoTotal = Number.isFinite(photos) ? Math.max(0, Math.floor(photos)) : 0
  return photoTotal === 0
}

/** 사진을 더 고를 수 있는지 */
export function canAddPhotos(current: number): boolean {
  return Math.max(0, Math.floor(Number.isFinite(current) ? current : 0)) < HOMEWORK_PHOTO_MAX
}

/** 사진 경로 — homework-photos 버킷 안에서 학생·세션별로 모인다 */
export function homeworkPhotoPath(
  studentId: string,
  sessionId: string,
  index: number,
  extension = 'jpg',
  now: number = Date.now(),
  token = Math.random().toString(36).slice(2, 8),
): string {
  const safeStudent = (studentId || 'student').replace(/[^0-9a-zA-Z-]/g, '')
  const safeSession = (sessionId || 'session').replace(/[^0-9a-zA-Z-]/g, '')
  const safeExt = (extension || 'jpg').replace(/[^0-9a-zA-Z]/g, '').toLowerCase() || 'jpg'
  const order = Math.max(0, Math.floor(index))
  return `${safeStudent}/${safeSession}/${now}-${order}-${token}.${safeExt}`
}

/** '11월 23일 (일) 14:05' — 한국 시간 */
export function formatSubmissionTime(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : Number.NaN
  if (!Number.isFinite(ms)) return ''
  return `${formatDateKo(kstDateString(ms))} ${kstTimeString(ms)}`
}

/** '공부 시작 14:05 · 끝 14:52' */
export function studyWindowText(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
): string {
  const start = startedAt ? kstTimeString(Date.parse(startedAt)) : ''
  const end = endedAt ? kstTimeString(Date.parse(endedAt)) : ''
  if (!start && !end) return ''
  if (!end) return `시작 ${start}`
  return `시작 ${start} · 끝 ${end}`
}

/** '1시간 20분 · 30문제' */
export function submissionSummary(
  submission: Pick<HomeworkSubmission, 'submitted_minutes' | 'submitted_problems'>,
): string {
  const minutes = Math.max(0, Math.round(submission.submitted_minutes ?? 0))
  const parts = [formatMinutes(minutes)]
  if (submission.submitted_problems === null || submission.submitted_problems === undefined) {
    parts.push('문제 수 미입력')
  } else {
    parts.push(`${Math.max(0, Math.round(submission.submitted_problems))}문제`)
  }
  return parts.join(' · ')
}

/** 학생 홈 목록에 쓰는 한 줄 — '11월 23일 (일) · 1시간 20분 · 30문제' */
export function submissionLine(
  submission: Pick<HomeworkSubmission, 'date' | 'submitted_minutes' | 'submitted_problems'>,
): string {
  return `${formatDateKo(submission.date)} · ${submissionSummary(submission)}`
}

/** 승인/반려된 값 — '승인 1시간 20분 · 30문제' */
export function approvedLine(submission: HomeworkSubmission): string {
  if (submission.status === 'pending') return ''
  const parts: string[] = []
  if (submission.time_verdict === 'approved') parts.push(`시간 ${formatMinutes(submission.approved_minutes)} 승인`)
  else if (submission.time_verdict === 'rejected') parts.push('시간 0분')
  if (submission.problems_verdict === 'approved') parts.push(`문항 ${submission.approved_problems}문제 승인`)
  else if (submission.problems_verdict === 'rejected') parts.push('문항 0문제')
  return parts.join(' · ')
}

/** 관리자 목록 필터 */
export function filterSubmissions(
  list: HomeworkSubmission[],
  filter: HomeworkFilter,
): HomeworkSubmission[] {
  if (filter === 'all') return list
  return list.filter((submission) => submission.status === filter)
}

/** 승인 대기 건수 */
export function countPending(list: HomeworkSubmission[]): number {
  return list.reduce((sum, submission) => sum + (submission.status === 'pending' ? 1 : 0), 0)
}

/**
 * 관리자 목록 순서 — 승인 대기는 오래된 것부터(먼저 온 학생부터 처리),
 * 처리한 내역은 최근 것부터. (filter 를 넘기면 그 종류만)
 */
export function sortSubmissionsForAdmin(list: HomeworkSubmission[], filter: HomeworkFilter): HomeworkSubmission[] {
  const rows = filterSubmissions(list, filter)
  if (filter === 'pending') {
    return rows.sort((a, b) => timeOf(a) - timeOf(b))
  }
  return rows.sort((a, b) => timeOf(b) - timeOf(a))
}

function timeOf(submission: HomeworkSubmission): number {
  return Date.parse(submission.submitted_at ?? submission.created_at ?? '') || 0
}

/** 학생이 아직 처리되지 않은 제출 (오래된 것부터) — 다음 접속 때 물어볼 목록 */
export function pendingHomeworkQueue(list: HomeworkSubmission[] | null | undefined): HomeworkSubmission[] {
  const seen = new Set<string>()
  const out: HomeworkSubmission[] = []
  for (const submission of list ?? []) {
    if (!submission?.id || seen.has(submission.id)) continue
    if (submission.status !== 'pending') continue
    seen.add(submission.id)
    out.push(submission)
  }
  return out.sort((a, b) => timeOf(a) - timeOf(b))
}

/** 제출 목록에서 학생 이름 (join 결과가 배열일 수 있다) */
export function submissionStudent(
  submission: Pick<HomeworkSubmission, 'students'>,
): { name: string; grade: string } {
  const joined = submission.students
  const row = Array.isArray(joined) ? joined[0] ?? null : joined ?? null
  return { name: row?.name ?? '학생', grade: row?.grade ?? '미지정' }
}

/** 확인 화면의 기본 선택 — 문제 수를 모르는 제출은 문항수를 승인할 수 없다.
 *  이미 확인한 제출(승인·반려)은 지난 결정을 그대로 보여 주고, 원장님이 고쳐서 저장한다. */
export function reviewDefaults(submission: {
  submitted_problems: number | null
  status?: HomeworkStatus | null
  time_verdict?: HomeworkVerdict | null
  problems_verdict?: HomeworkVerdict | null
}): {
  timeApproved: boolean
  problemsApproved: boolean
} {
  if (submission.status === 'approved' || submission.status === 'rejected') {
    return {
      timeApproved: submission.time_verdict === 'approved',
      problemsApproved: submission.problems_verdict === 'approved',
    }
  }
  return { timeApproved: true, problemsApproved: submission.submitted_problems !== null }
}

/** 이미 확인한 제출인지 (승인 또는 반려) — 2026-11-28 부터는 다시 열어 고칠 수 있다 */
export function isReviewed(submission: Pick<HomeworkSubmission, 'status'>): boolean {
  return submission.status !== 'pending'
}

/** 이미 확인한 제출을 다시 열었을 때 보여 줄 안내 (처음 확인이면 null) */
export function rereviewNotice(submission: Pick<HomeworkSubmission, 'status'>): string | null {
  if (!isReviewed(submission)) return null
  return `이미 ${submissionStatusLabel(submission)}한 제출이에요 — 고쳐서 다시 저장할 수 있어요.`
}

/** 다시 고쳐 저장할 때의 안내 — 이전 승인분과 새 결정을 함께 보여 준다 */
export function reviewEditResultText(input: {
  previousStatus: HomeworkStatus
  previousMinutes: number
  previousProblems: number
  status: HomeworkStatus
  minutes: number
  problems: number
}): string {
  const beforeMinutes = Math.max(0, Math.round(input.previousMinutes ?? 0))
  const beforeProblems = Math.max(0, Math.round(input.previousProblems ?? 0))
  const afterMinutes = Math.max(0, Math.round(input.minutes ?? 0))
  const afterProblems = Math.max(0, Math.round(input.problems ?? 0))
  const before = `${formatMinutes(beforeMinutes)} · ${beforeProblems}개`
  const after = `${formatMinutes(afterMinutes)} · ${afterProblems}개`

  if (input.status === 'rejected') {
    if (beforeMinutes > 0 || beforeProblems > 0) {
      return `반려로 고쳤어요. 이전 승인 ${before}를 그날 기록에서 뺐어요.`
    }
    return '반려로 고쳤어요. 그날 기록은 그대로예요.'
  }
  if (beforeMinutes === afterMinutes && beforeProblems === afterProblems && input.previousStatus === input.status) {
    return '고쳐서 저장했어요. 그날 기록은 그대로예요.'
  }
  return `승인으로 고쳤어요. 그날 기록: ${before} → ${after}`
}

/** 확인(저장) 버튼이 막히는 경우의 안내 (없으면 null).
 *  이미 확인한 제출도 고칠 수 있으므로 상태로는 막지 않는다. */
export function reviewBlockReason(
  _submission: Pick<HomeworkSubmission, 'status'>,
  timeApproved: boolean,
  problemsApproved: boolean,
): string | null {
  if (!timeApproved && !problemsApproved) return '모두 반려예요. 저장하면 이 제출은 0분·0문제로 확정돼요.'
  return null
}

/** 저장 뒤 결과 안내 */
export function reviewResultText(status: HomeworkStatus, minutes: number, problems: number): string {
  if (status === 'rejected') return '모두 반려했어요. 기록에는 0으로 남고 다시 제출하지 않아요.'
  return `시간 ${Math.max(0, minutes)}분 · 문항 ${Math.max(0, problems)}개 승인했어요.`
}

/** 시간·문항수 각 항목의 처리 상태 문구 */
export function verdictLabel(verdict: HomeworkVerdict): string {
  if (verdict === 'approved') return '승인'
  if (verdict === 'rejected') return '반려'
  return '대기'
}

/** 반려 사유 메모 정리 (한 줄, 최대 300자) */
export function normalizeReason(value: string | null | undefined): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > HOMEWORK_REASON_MAX ? text.slice(0, HOMEWORK_REASON_MAX) : text
}

/** 칭찬 한마디 정리 (한 줄, 최대 200자) */
export function normalizeComment(value: string | null | undefined): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > HOMEWORK_COMMENT_MAX ? text.slice(0, HOMEWORK_COMMENT_MAX) : text
}

/**
 * 칩 하나를 입력칸 글에 넣거나 뺀다 (반려 사유 칩·칭찬 칩 공통).
 * 이미 들어 있으면 그 문구만 빼고, 없으면 뒤에 붙인다. 최대 글자 수를 넘으면 넣지 않는다.
 */
export function toggleChip(text: string, chip: string, max = HOMEWORK_COMMENT_MAX): string {
  const current = text ?? ''
  if (current.includes(chip)) {
    return normalizeText(`${current.replace(chip, ' ')}`)
  }
  const next = normalizeText(`${current} ${chip}`)
  if (next.length > max) return normalizeText(current)
  return next
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * 확인을 마친 뒤 자동으로 열 다음 대기 제출.
 * 같은 제출은 건너뛰고, 목록에서 가장 오래된 승인 대기를 고른다.
 */
export function nextPendingSubmission(
  list: HomeworkSubmission[],
  currentId: string | null,
): HomeworkSubmission | null {
  const queue = list
    .filter((submission) => submission.status === 'pending' && submission.id !== currentId)
    .sort((a, b) => timeOf(a) - timeOf(b))
  return queue[0] ?? null
}

/* ------------------------------------------------------------------ */
/* 지난 공부 마저 제출 — 학원(문제 수) · 숙제(사진+문제 수) 합치기        */
/* ------------------------------------------------------------------ */

/** 아직 마저 내지 못한 지난 공부 한 건 */
export type PendingItem =
  | { type: 'academy'; id: string; session: StudySession }
  | { type: 'homework'; id: string; submission: HomeworkSubmission }

/** 지난 공부의 마무리 시각 (오래된 것부터 물어보기 위한 정렬 값) */
export function pendingItemTime(item: PendingItem): number {
  if (item.type === 'academy') {
    return Date.parse(item.session.ended_at ?? item.session.created_at ?? '') || 0
  }
  return Date.parse(item.submission.ended_at ?? item.submission.submitted_at ?? '') || 0
}

/** 학원(문제 수만) 과 숙제(사진+문제 수) 목록을 시간 순으로 합친다 */
export function mergePendingItems(
  sessions: StudySession[] | null | undefined,
  submissions: HomeworkSubmission[] | null | undefined,
): PendingItem[] {
  const academy: PendingItem[] = (sessions ?? [])
    .filter((session) => Boolean(session?.id))
    .map((session) => ({ type: 'academy', id: session.id, session }))
  const homework: PendingItem[] = pendingHomeworkQueue(submissions).map((submission) => ({
    type: 'homework',
    id: submission.id,
    submission,
  }))
  return [...academy, ...homework].sort((a, b) => pendingItemTime(a) - pendingItemTime(b))
}
