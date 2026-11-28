/**
 * '선오공에게 질문하기' Q&A — DB(study_questions)와 Storage(question-images) 접근.
 *
 * · 학생: 자기 질문 목록 읽기, 질문 올리기(사진은 Canvas 로 줄여서), 답변 읽음 표시
 * · 선오공이(관리자): 전체 질문 읽기, 답변 글 + 사진/동영상 달기·수정, 질문 삭제
 * · 표나 버킷이 아직 없으면(마이그레이션 전) 화면이 죽지 않고 안내 문구만 보여 준다.
 */
import { friendlyError, NOT_CONFIGURED_MESSAGE, type ApiResult } from './api'
import { prepareQuestionImage } from './imageCompress'
import {
  ANSWER_MEDIA_MAX_BYTES,
  answerMediaPath,
  cleanupCutoffIso,
  mediaExtension,
  normalizeAnswer,
  normalizeMemo,
  QUESTION_RETENTION_DAYS,
  questionImagePath,
  validateAnswerMedia,
} from './questionBoard'
import { isSupabaseConfigured, supabase } from './supabase'
import { notifyNewQuestion } from './push'
import type { StudyQuestion } from './types'

export const QUESTION_BUCKET = 'question-images'
/** 서명 URL 유효 시간 (1시간) — 사진·동영상은 비공개 버킷이라 매번 서명해서 본다 */
export const QUESTION_SIGNED_URL_SECONDS = 60 * 60

/** 표·버킷이 아직 없을 때 학생에게 보여 줄 말 */
export const QUESTION_NOT_READY = '질문 기능을 아직 준비 중이에요. 조금 뒤에 다시 시도해 주세요.'

const fail = (error: string): ApiResult<never> => ({ ok: false, error })

async function run<T>(
  thunk: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<ApiResult<T>> {
  if (!isSupabaseConfigured) return fail(NOT_CONFIGURED_MESSAGE)
  try {
    const { data, error } = await thunk()
    if (error) {
      console.warn('[sunogong] question query failed:', error.message)
      return fail(describeQuestionError(error.message))
    }
    return { ok: true, data: (data as T) ?? (null as unknown as T) }
  } catch (error) {
    console.warn('[sunogong] question request failed:', error)
    return fail(describeQuestionError(error instanceof Error ? error.message : String(error)))
  }
}

/** 표·버킷·용량·형식 오류를 읽을 수 있는 말로 */
export function describeQuestionError(message: string): string {
  const lower = (message ?? '').toLowerCase()
  if (
    lower.includes('study_questions') ||
    lower.includes('bucket not found') ||
    lower.includes('not found the bucket') ||
    (lower.includes('relation') && lower.includes('does not exist'))
  ) {
    return QUESTION_NOT_READY
  }
  if (
    lower.includes('payload too large') ||
    lower.includes('entity too large') ||
    lower.includes('exceeded the maximum allowed size') ||
    lower.includes('file size')
  ) {
    return '파일이 너무 커요. 사진은 그대로, 영상은 50MB 이하로 올려 주세요.'
  }
  if (lower.includes('mime') || lower.includes('content type') || lower.includes('not supported')) {
    return '이 파일 형식은 올릴 수 없어요. 사진(JPG·PNG)이나 영상(MP4·WebM·MOV)을 올려 주세요.'
  }
  return friendlyError(message)
}

/* ------------------------------------------------------------------ */
/* 읽기                                                               */
/* ------------------------------------------------------------------ */

/** 내가 올린 질문 (최근 것부터) */
export const listStudentQuestions = (studentId: string, limit = 60) =>
  run<StudyQuestion[]>(() =>
    supabase
      .from('study_questions')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(limit),
  )

/** 관리자 질문함 — 답변 대기가 위, 최근 질문부터. 학생 이름·학년 함께 */
export const listAllQuestions = (limit = 300) =>
  run<StudyQuestion[]>(() =>
    supabase
      .from('study_questions')
      .select('*, students(name, grade)')
      .order('created_at', { ascending: false })
      .limit(limit),
  )

/** 학생이 아직 열지 않은 답변 수 (홈 배지) */
export const countUnreadAnswers = (studentId: string) =>
  run<number>(() =>
    supabase
      .from('study_questions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .not('answered_at', 'is', null)
      .is('student_read_at', null)
      .then((res) => ({ data: res.count ?? 0, error: res.error })),
  )

/**
 * 학생이 아직 열지 않은 답변 (최근에 달린 답변부터).
 * 로그인 직후 홈 위쪽 알림 배너에 "어떤 질문에 답이 왔는지" 보여 주는 데 쓴다 (2026-11-28).
 */
export const listUnreadAnswers = (studentId: string, limit = 5) =>
  run<StudyQuestion[]>(() =>
    supabase
      .from('study_questions')
      .select('*')
      .eq('student_id', studentId)
      .not('answered_at', 'is', null)
      .is('student_read_at', null)
      .order('answered_at', { ascending: false })
      .limit(limit),
  )

/** 답변 대기 질문 수 (관리자 '질문함' 탭 배지) */
export const countUnansweredQuestions = () =>
  run<number>(() =>
    supabase
      .from('study_questions')
      .select('id', { count: 'exact', head: true })
      .is('answered_at', null)
      .then((res) => ({ data: res.count ?? 0, error: res.error })),
  )

/** 비공개 버킷의 사진·동영상을 볼 수 있는 1시간짜리 주소 만들기 (경로 → 주소) */
export async function signQuestionMedia(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  if (!isSupabaseConfigured) return {}
  const unique = Array.from(new Set(paths.filter((path): path is string => Boolean(path))))
  if (unique.length === 0) return {}
  const urls: Record<string, string> = {}
  for (let index = 0; index < unique.length; index += 50) {
    const chunk = unique.slice(index, index + 50)
    try {
      const { data, error } = await supabase.storage
        .from(QUESTION_BUCKET)
        .createSignedUrls(chunk, QUESTION_SIGNED_URL_SECONDS)
      if (error) {
        console.warn('[sunogong] 사진 주소 만들기 실패:', error.message)
        continue
      }
      for (const item of data ?? []) {
        if (item?.path && item?.signedUrl) urls[item.path] = item.signedUrl
      }
    } catch (error) {
      console.warn('[sunogong] 사진 주소 만들기 실패:', error)
    }
  }
  return urls
}

/* ------------------------------------------------------------------ */
/* 학생: 질문 올리기                                                   */
/* ------------------------------------------------------------------ */

export interface CreateQuestionInput {
  studentId: string
  memo?: string
  file: File
}

export async function createQuestion(input: CreateQuestionInput): Promise<ApiResult<StudyQuestion>> {
  if (!isSupabaseConfigured) return fail(NOT_CONFIGURED_MESSAGE)
  if (!input.file) return fail('문제 사진을 골라 주세요.')
  if (input.file.type && !input.file.type.startsWith('image/')) {
    return fail('질문에는 문제 사진을 올려 주세요.')
  }
  if (input.file.size > ANSWER_MEDIA_MAX_BYTES) {
    return fail('사진은 50MB까지만 올릴 수 있어요. 다른 사진을 골라 주세요.')
  }

  let prepared
  try {
    prepared = await prepareQuestionImage(input.file)
  } catch {
    return fail('사진을 준비하지 못했어요. 다른 사진으로 다시 시도해 주세요.')
  }

  const path = questionImagePath(input.studentId, Date.now(), undefined, mediaExtension({ type: prepared.type }))
  try {
    const { error: uploadError } = await supabase.storage.from(QUESTION_BUCKET).upload(path, prepared.blob, {
      contentType: prepared.type,
      cacheControl: '3600',
      upsert: false,
    })
    if (uploadError) return fail(describeQuestionError(uploadError.message))

    const { data, error } = await supabase
      .from('study_questions')
      .insert({
        student_id: input.studentId,
        memo: normalizeMemo(input.memo) || null,
        image_path: path,
      })
      .select('*')
      .single()
    if (error) {
      void supabase.storage.from(QUESTION_BUCKET).remove([path])
      return fail(describeQuestionError(error.message))
    }
    // 관리자에게 새 질문 알림 (결과를 기다리지 않는다 — 실패해도 질문 등록은 그대로)
    notifyNewQuestion((data as StudyQuestion).id)
    return { ok: true, data: data as StudyQuestion }
  } catch (error) {
    console.warn('[sunogong] 질문 올리기 실패:', error)
    return fail(describeQuestionError(error instanceof Error ? error.message : String(error)))
  }
}

/** 학생이 답변을 열었을 때 '새 답변' 배지를 지운다 */
export async function markAnswersRead(questionIds: string[]): Promise<ApiResult<null>> {
  if (questionIds.length === 0) return { ok: true, data: null }
  return run<null>(() =>
    supabase
      .from('study_questions')
      .update({ student_read_at: new Date().toISOString() })
      .in('id', questionIds),
  )
}

/* ------------------------------------------------------------------ */
/* 선오공이(관리자): 답변 달기 · 수정 · 삭제                            */
/* ------------------------------------------------------------------ */

export interface AnswerQuestionInput {
  answer: string
  /** 새로 붙일 해설지 사진 또는 훈노트 영상 (없으면 그대로 둔다) */
  mediaFile?: File | null
  /** 기존에 붙어 있던 사진·동영상 경로 (새로 바꾸거나 지울 때 정리용) */
  currentMediaPath?: string | null
  /** 사진·동영상 떼기 */
  removeMedia?: boolean
}

export async function answerQuestion(
  questionId: string,
  input: AnswerQuestionInput,
): Promise<ApiResult<StudyQuestion>> {
  if (!isSupabaseConfigured) return fail(NOT_CONFIGURED_MESSAGE)
  const answer = normalizeAnswer(input.answer)
  if (!answer && !input.mediaFile && !(input.currentMediaPath && !input.removeMedia)) {
    return fail('답변 글을 쓰거나 사진·영상을 올려 주세요.')
  }

  let uploadedPath: string | null = null
  if (input.mediaFile) {
    const invalid = validateAnswerMedia(input.mediaFile)
    if (invalid) return fail(invalid)
    const extension = mediaExtension(input.mediaFile)
    const path = answerMediaPath(questionId, extension)
    try {
      const { error: uploadError } = await supabase.storage.from(QUESTION_BUCKET).upload(path, input.mediaFile, {
        contentType: input.mediaFile.type || undefined,
        cacheControl: '3600',
        upsert: false,
      })
      if (uploadError) return fail(describeQuestionError(uploadError.message))
      uploadedPath = path
    } catch (error) {
      return fail(describeQuestionError(error instanceof Error ? error.message : String(error)))
    }
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    answer: answer || null,
    answered_at: now,
    answered_by: '선오공이',
    student_read_at: null,
    updated_at: now,
  }
  if (uploadedPath) patch.answer_media_path = uploadedPath
  else if (input.removeMedia) patch.answer_media_path = null

  const { data, error } = await supabase
    .from('study_questions')
    .update(patch)
    .eq('id', questionId)
    .select('*')
    .single()

  if (error) {
    if (uploadedPath) void supabase.storage.from(QUESTION_BUCKET).remove([uploadedPath])
    return fail(describeQuestionError(error.message))
  }

  // 새 사진·영상으로 바꿨거나 뗐으면 예전 파일을 지운다 (실패해도 화면은 그대로)
  const previous = input.currentMediaPath ?? null
  if (previous && (uploadedPath || input.removeMedia)) {
    void supabase.storage.from(QUESTION_BUCKET).remove([previous])
  }

  return { ok: true, data: data as StudyQuestion }
}

/** 질문 삭제 — 질문 사진과 답변 사진/동영상도 함께 지운다 */
export async function deleteQuestion(question: StudyQuestion): Promise<ApiResult<null>> {
  const res = await run<null>(() => supabase.from('study_questions').delete().eq('id', question.id))
  if (!res.ok) return res
  const paths = [question.image_path, question.answer_media_path].filter(
    (path): path is string => Boolean(path),
  )
  if (paths.length > 0) void supabase.storage.from(QUESTION_BUCKET).remove(paths)
  return res
}

/** 질문 사진·답변 사진/동영상의 서명 주소를 한 번에 (목록 화면용) */export const signQuestionImages = (questions: StudyQuestion[]) =>
  signQuestionMedia(questions.flatMap((question) => [question.image_path, question.answer_media_path]))

/* ------------------------------------------------------------------ */
/* 오래된 질문 정리 — 답변 완료 후 7일(기본)이 지난 질문 + 사진·영상  */
/* ------------------------------------------------------------------ */

export interface CleanupSummary {
  /** 지운 질문 수 */
  questions: number
  /** Storage 에서 지운 사진·동영상 파일 수 */
  files: number
  /** 지우지 못한 파일 수 (있으면 다시 한 번 실행) */
  failedFiles: number
}

const chunk = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size))
  return out
}

/** 정리 대상 질문 수 (관리자 화면 안내용) */
export const countQuestionsToCleanup = (days: number = QUESTION_RETENTION_DAYS) =>
  run<number>(() =>
    supabase
      .from('study_questions')
      .select('id', { count: 'exact', head: true })
      .not('answered_at', 'is', null)
      .lt('answered_at', cleanupCutoffIso(days))
      .then((res) => ({ data: res.count ?? 0, error: res.error })),
  )

/**
 * 오래된 질문 한 번에 정리 — 질문 줄과 함께 질문 사진·답변 사진/동영상 파일까지 지운다.
 * (DB 만 지우면 Storage 용량이 남아 있어서 파일도 직접 지운다)
 */
export async function cleanupOldQuestions(days: number = QUESTION_RETENTION_DAYS): Promise<ApiResult<CleanupSummary>> {
  if (!isSupabaseConfigured) return fail(NOT_CONFIGURED_MESSAGE)
  const cutoff = cleanupCutoffIso(days)

  const { data, error } = await supabase
    .from('study_questions')
    .select('id, image_path, answer_media_path')
    .not('answered_at', 'is', null)
    .lt('answered_at', cutoff)
    .limit(1000)
  if (error) return fail(describeQuestionError(error.message))

  const rows = (data ?? []) as { id: string; image_path: string | null; answer_media_path: string | null }[]
  if (rows.length === 0) return { ok: true, data: { questions: 0, files: 0, failedFiles: 0 } }

  const ids = rows.map((row) => row.id)
  const paths = rows
    .flatMap((row) => [row.image_path, row.answer_media_path])
    .filter((path): path is string => Boolean(path))

  // 1) 질문 줄을 먼저 지운다 (실패하면 파일은 그대로 둔다)
  for (const idsChunk of chunk(ids, 200)) {
    const { error: deleteError } = await supabase.from('study_questions').delete().in('id', idsChunk)
    if (deleteError) return fail(describeQuestionError(deleteError.message))
  }

  // 2) 사진·동영상 파일을 지운다 — 실제로 용량이 비워지는 부분
  let files = 0
  let failedFiles = 0
  for (const pathChunk of chunk(paths, 100)) {
    let remaining = pathChunk
    for (let attempt = 0; attempt < 2 && remaining.length > 0; attempt += 1) {
      try {
        const { data: removed, error: removeError } = await supabase.storage
          .from(QUESTION_BUCKET)
          .remove(remaining)
        if (removeError) {
          console.warn('[sunogong] 오래된 질문 파일 정리 실패:', removeError.message)
          continue
        }
        files += removed?.length ?? 0
        remaining = []
      } catch (removeError) {
        console.warn('[sunogong] 오래된 질문 파일 정리 실패:', removeError)
      }
    }
    failedFiles += remaining.length
  }

  return { ok: true, data: { questions: ids.length, files, failedFiles } }
}
