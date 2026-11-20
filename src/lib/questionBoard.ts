/**
 * '선오공에게 질문하기' 화면에서 쓰는 순수 함수들.
 * (날짜 표시·정렬·배지 세기·올릴 파일 고르기 — 화면 없이 테스트할 수 있게 모아 둔다)
 */
import type { StudyQuestion } from './types'
import { formatDateKo, kstDateString, kstTimeString } from './time'

/** 질문 메모 한 줄 최대 글자 수 (DB check 와 같다) */
export const QUESTION_MEMO_MAX = 200
/** 선오공이 답변 최대 글자 수 (DB check 와 같다) */
export const QUESTION_ANSWER_MAX = 2000
/** 답변을 단 뒤 며칠이 지나면 질문 사진·영상을 정리할지 (기본 7일) */
export const QUESTION_RETENTION_DAYS = 7

/** 답변에 올릴 수 있는 사진·동영상 최대 용량 — Supabase 무료 티어 상한과 같다 */
export const ANSWER_MEDIA_MAX_BYTES = 50 * 1024 * 1024

/** 답변 사진·동영상 파일 선택 창 */
export const ANSWER_MEDIA_ACCEPT = 'image/*,video/*'

export type QuestionFilter = 'waiting' | 'answered' | 'all'

export const QUESTION_FILTER_LABEL: Record<QuestionFilter, string> = {
  waiting: '답변 대기',
  answered: '답변 완료',
  all: '전체',
}

export type MediaKind = 'image' | 'video'

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']
const VIDEO_EXT = ['mp4', 'webm', 'mov', 'm4v', 'ogv', '3gp']

/** 답변이 달렸는지 (빈 글은 답변으로 보지 않는다) */
export function isAnswered(question: StudyQuestion): boolean {
  return Boolean(question.answer && question.answer.trim())
}

/** 학생이 아직 열지 않은 새 답변인지 */
export function isUnreadAnswer(question: StudyQuestion): boolean {
  return isAnswered(question) && !question.student_read_at
}

/** '답변 대기' / '답변 완료' */
export function answerStateLabel(question: StudyQuestion): string {
  return isAnswered(question) ? '답변 완료' : '답변 대기'
}

export function filterQuestions(list: StudyQuestion[], filter: QuestionFilter): StudyQuestion[] {
  if (filter === 'waiting') return list.filter((question) => !isAnswered(question))
  if (filter === 'answered') return list.filter(isAnswered)
  return list
}

/** 관리자 질문함: 답변 대기가 위로, 그 안에서는 최근 질문이 먼저 */
export function sortQuestionsForAdmin(list: StudyQuestion[]): StudyQuestion[] {
  return [...list].sort((a, b) => {
    const answeredA = isAnswered(a) ? 1 : 0
    const answeredB = isAnswered(b) ? 1 : 0
    if (answeredA !== answeredB) return answeredA - answeredB
    return (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)
  })
}

export function countUnanswered(list: StudyQuestion[]): number {
  return list.reduce((sum, question) => sum + (isAnswered(question) ? 0 : 1), 0)
}

export function countUnreadAnswers(list: StudyQuestion[]): number {
  return list.reduce((sum, question) => sum + (isUnreadAnswer(question) ? 1 : 0), 0)
}

/** 한 줄 메모 정리 — 줄바꿈·연속 공백을 한 칸으로, 앞뒤 공백 제거, 최대 길이 자르기 */
export function normalizeMemo(value: string | null | undefined, max = QUESTION_MEMO_MAX): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max) : text
}

/** 답변 글 정리 — 줄바꿈은 살리고 앞뒤 공백만 제거, 최대 길이 자르기 */
export function normalizeAnswer(value: string | null | undefined, max = QUESTION_ANSWER_MAX): string {
  const text = (value ?? '').replace(/\r\n/g, '\n').trim()
  return text.length > max ? text.slice(0, max) : text
}

/** '11월 20일 (금) 14:05' — 한국 시간 */
export function formatQuestionTime(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : Number.NaN
  if (!Number.isFinite(ms)) return ''
  return `${formatDateKo(kstDateString(ms))} ${kstTimeString(ms)}`
}

/** 사진·동영상 경로의 확장자로 종류를 알아낸다 (모르면 null) */
export function mediaKindFromPath(path: string | null | undefined): MediaKind | null {
  if (!path) return null
  const clean = path.split('?')[0]
  const ext = clean.split('.').pop()?.toLowerCase() ?? ''
  if (VIDEO_EXT.includes(ext)) return 'video'
  if (IMAGE_EXT.includes(ext)) return 'image'
  return null
}

/** 고른 파일이 사진인지 동영상인지 (둘 다 아니면 null) */
export function mediaKindOfFile(file: { type?: string; name?: string } | null | undefined): MediaKind | null {
  if (!file) return null
  const type = (file.type ?? '').toLowerCase()
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('image/')) return 'image'
  // 아이폰·안드로이드에서 type 이 비어 오는 경우가 있어 확장자로도 본다
  return mediaKindFromPath(file.name)
}

/** 답변에 올릴 사진·동영상 검사 — 문제가 있으면 학생·선생님이 읽을 안내 문구를 돌려준다 */
export function validateAnswerMedia(file: File | null | undefined): string | null {
  if (!file) return '해설지 사진이나 영상을 골라주세요.'
  const kind = mediaKindOfFile(file)
  if (!kind) return '사진(JPG·PNG)이나 동영상(MP4·WebM·MOV)만 올릴 수 있어요.'
  if (file.size > ANSWER_MEDIA_MAX_BYTES) {
    return kind === 'video'
      ? '영상은 50MB까지만 올릴 수 있어요. 1분 안팎으로 짧게 찍어 주세요.'
      : '사진은 50MB까지만 올릴 수 있어요. 다른 사진을 골라 주세요.'
  }
  return null
}

/** 올릴 파일의 확장자 (Storage 경로에 쓴다) */
export function mediaExtension(file: { type?: string; name?: string } | null | undefined): string {
  const type = (file?.type ?? '').toLowerCase()
  const byType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-m4v': 'm4v',
    'video/3gpp': '3gp',
  }
  if (byType[type]) return byType[type]
  const fromName = (file?.name ?? '').split('.').pop()?.toLowerCase() ?? ''
  if (/^[a-z0-9]{2,5}$/.test(fromName)) return fromName
  return mediaKindOfFile(file) === 'video' ? 'mp4' : 'jpg'
}

/** 같은 이름이 겹치지 않게 붙이는 짧은 무작위 글자 */
export function randomToken(length = 10): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  try {
    const bytes = new Uint8Array(length)
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes)
      for (const byte of bytes) out += alphabet[byte % alphabet.length]
      return out
    }
  } catch {
    /* 아래 Math.random 으로 */
  }
  for (let index = 0; index < length; index += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

/** 질문 사진 Storage 경로 — {학생 id}/{시각}-{무작위}.jpg (줄이지 못한 사진은 원래 확장자) */
export function questionImagePath(
  studentId: string,
  now: number = Date.now(),
  token: string = randomToken(),
  extension = 'jpg',
): string {
  const safeId = (studentId || 'student').replace(/[^0-9a-zA-Z-]/g, '')
  const safeExt = (extension || 'jpg').replace(/[^0-9a-zA-Z]/g, '').toLowerCase() || 'jpg'
  return `${safeId}/${now}-${token}.${safeExt}`
}

/** 답변 사진·동영상 Storage 경로 — answers/{질문 id}-{시각}-{무작위}.{확장자} */
export function answerMediaPath(
  questionId: string,
  extension: string,
  now: number = Date.now(),
  token: string = randomToken(),
): string {
  const safeId = (questionId || 'question').replace(/[^0-9a-zA-Z-]/g, '')
  const safeExt = (extension || 'bin').replace(/[^0-9a-zA-Z]/g, '').toLowerCase() || 'bin'
  return `answers/${safeId}-${now}-${token}.${safeExt}`
}

/**
 * 오래된 질문 정리 기준 시각 — 지금으로부터 days 일 전 (ISO).
 * 답변을 단 시각(answered_at)이 이 시각보다 이전이면 정리 대상이다.
 */
export function cleanupCutoffIso(days: number = QUESTION_RETENTION_DAYS, now: number = Date.now()): string {
  const safeDays = Math.max(1, Math.floor(Number.isFinite(days) ? days : QUESTION_RETENTION_DAYS))
  return new Date(now - safeDays * 24 * 60 * 60 * 1000).toISOString()
}

/** 답변 완료 후 보관 기간이 지나 정리해도 되는 질문인지 */
export function isCleanupTarget(question: StudyQuestion, cutoffIso: string): boolean {
  if (!isAnswered(question)) return false
  const answeredMs = Date.parse(question.answered_at ?? question.updated_at ?? '')
  const cutoffMs = Date.parse(cutoffIso)
  if (!Number.isFinite(answeredMs) || !Number.isFinite(cutoffMs)) return false
  return answeredMs < cutoffMs
}

/** 관리자 화면 안내 문구 */
export function retentionLabel(days: number = QUESTION_RETENTION_DAYS): string {
  return `답변 완료 후 ${Math.max(1, Math.floor(days))}일이 지난 질문은 사진·영상과 함께 저절로 정리할 수 있어요`
}

/**
 * '오래된 질문 자동 정리' 설정 읽기 — 저장된 값이 'off' 일 때만 꺼짐, 나머지는 기본 켜짐.
 * (localStorage 에 저장한다)
 */
export function parseAutoCleanup(value: string | null | undefined): boolean {
  return (value ?? '').trim().toLowerCase() !== 'off'
}

/** 답변 저장 뒤 목록 한 줄 갱신 — 학생 이름·학년 조인은 원래 값을 유지한다 */
export function mergeQuestion(prev: StudyQuestion, saved: StudyQuestion): StudyQuestion {
  return { ...prev, ...saved, students: prev.students ?? saved.students ?? null }
}

/** 관리자 목록에서 학생 이름·학년 (조인이 배열로 올 때도 있다) */
export function questionStudent(question: StudyQuestion): { name: string; grade: string } {
  const joined = question.students
  const row = Array.isArray(joined) ? joined[0] : joined
  return {
    name: (row?.name ?? '').trim() || '학생',
    grade: (row?.grade ?? '').trim(),
  }
}

/** 화면에 보여 줄 사진 크기 — 가로·세로 중 긴 쪽을 maxSize 에 맞춘다 */
export function fitInside(
  width: number,
  height: number,
  maxSize: number,
): { width: number; height: number } {
  const w = Math.max(1, Math.floor(Number.isFinite(width) ? width : 0))
  const h = Math.max(1, Math.floor(Number.isFinite(height) ? height : 0))
  const limit = Math.max(1, Math.floor(Number.isFinite(maxSize) ? maxSize : 1))
  if (w <= limit && h <= limit) return { width: w, height: h }
  const scale = limit / Math.max(w, h)
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}
