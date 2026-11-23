/**
 * 숙제 공부 제출 — DB(homework_submissions)와 Storage(homework-photos) 접근.
 *
 * · 학생: 숙제 공부를 끝낼 때 사진을 줄여 올리고(submit_homework),
 *         자동 종료된 공부는 다음 접속 때 문제 수·사진을 채운다(submit_pending_homework).
 * · 선오공이(관리자): 승인 대기 목록을 읽고, 시간·문항수를 따로 승인/반려한다.
 * · 표나 버킷이 아직 없으면(마이그레이션 전) 화면이 죽지 않고 안내 문구만 보여 준다.
 */
import { friendlyError, NOT_CONFIGURED_MESSAGE, type ApiResult } from './api'
import {
  HOMEWORK_PHOTO_MAX,
  HOMEWORK_PHOTO_MAX_SIZE,
  HOMEWORK_PHOTO_QUALITY,
  homeworkPhotoPath,
  normalizeComment,
  normalizeReason,
} from './homeworkBoard'
import { prepareQuestionImage } from './imageCompress'
import { mediaExtension } from './questionBoard'
import { isSupabaseConfigured, supabase } from './supabase'
import type { FinishResult, HomeworkSubmission } from './types'

export const HOMEWORK_BUCKET = 'homework-photos'
/** 서명 URL 유효 시간 (1시간) — 사진은 비공개 버킷이라 매번 서명해서 본다 */
export const HOMEWORK_SIGNED_URL_SECONDS = 60 * 60
/** 표·버킷이 아직 없을 때 보여 줄 말 */
export const HOMEWORK_NOT_READY = '숙제 사진 기능을 아직 준비 중이에요. 조금 뒤에 다시 시도해 주세요.'

const fail = (error: string): ApiResult<never> => ({ ok: false, error })

async function run<T>(
  thunk: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<ApiResult<T>> {
  if (!isSupabaseConfigured) return fail(NOT_CONFIGURED_MESSAGE)
  try {
    const { data, error } = await thunk()
    if (error) {
      console.warn('[sunogong] homework query failed:', error.message)
      return fail(describeHomeworkError(error.message))
    }
    return { ok: true, data: (data as T) ?? (null as unknown as T) }
  } catch (error) {
    console.warn('[sunogong] homework request failed:', error)
    return fail(describeHomeworkError(error instanceof Error ? error.message : String(error)))
  }
}

const rpc = <T>(fn: string, args: Record<string, unknown> = {}) =>
  run<T>(() => supabase.rpc(fn, args) as unknown as PromiseLike<{ data: unknown; error: { message: string } | null }>)

/** 표·버킷·함수가 없거나 값이 잘못된 경우를 읽을 수 있는 말로 바꾼다 */
export function describeHomeworkError(message: string): string {
  const raw = message ?? ''
  const lower = raw.toLowerCase()
  if (!raw) return '숙제 제출을 처리하지 못했어요.'
  if (
    lower.includes('homework_submissions') ||
    lower.includes('homework-photos') ||
    lower.includes('bucket not found') ||
    (lower.includes('relation') && lower.includes('does not exist')) ||
    lower.includes('could not find the function')
  ) {
    return HOMEWORK_NOT_READY
  }
  if (raw.includes('photo_required')) return '푼 문제가 있으면 공부한 페이지 사진을 1장 이상 올려주세요.'
  if (raw.includes('too_many_photos')) return `사진은 ${HOMEWORK_PHOTO_MAX}장까지 올릴 수 있어요.`
  if (raw.includes('not_homework_session')) return '숙제 공부 기록이 아니에요. 화면을 새로 열어 주세요.'
  if (raw.includes('session_finished')) return '이미 마친 공부예요. 화면을 새로 열어 주세요.'
  if (raw.includes('already_submitted')) return '이미 제출한 숙제예요.'
  if (raw.includes('draft_target_required')) return '저장할 공부 기록을 찾을 수 없어요.'
  if (raw.includes('already_reviewed')) return '이미 확인한 제출이에요. 새로 고쳐 주세요.'
  if (raw.includes('problems_unknown')) return '문제 수가 아직 없어서 문항수는 승인할 수 없어요.'
  if (raw.includes('submission_not_found')) return '숙제 제출을 찾을 수 없어요.'
  if (
    lower.includes('payload too large') ||
    lower.includes('entity too large') ||
    lower.includes('exceeded the maximum allowed size')
  ) {
    return '사진이 너무 커요. 다시 찍어 올려 주세요.'
  }
  if (lower.includes('mime') || lower.includes('content type') || lower.includes('not supported')) {
    return '이 파일 형식은 올릴 수 없어요. 사진(JPG·PNG)을 올려 주세요.'
  }
  return friendlyError(raw)
}

/* ------------------------------------------------------------------ */
/* 학생 — 사진 올리기                                                   */
/* ------------------------------------------------------------------ */

/** 숙제 사진 준비 — 긴 변 1200px · JPEG 0.72 로 줄여 장당 100~150KB 정도로 만든다 */
export function prepareHomeworkPhoto(file: File) {
  return prepareQuestionImage(file, { maxSize: HOMEWORK_PHOTO_MAX_SIZE, quality: HOMEWORK_PHOTO_QUALITY })
}

/**
 * 숙제 사진 한 장을 Storage 에 올린다 (고르는 즉시 한 장씩 — 여러 장을 동시에 열지 않는다).
 * 줄인 사진(blob)을 그대로 올리므로 원본 해상도를 다시 열 일이 없다.
 */
export async function uploadHomeworkPhoto(input: {
  studentId: string
  scopeId: string
  index: number
  blob: Blob
  name?: string
}): Promise<ApiResult<string>> {
  if (!isSupabaseConfigured) return fail(NOT_CONFIGURED_MESSAGE)
  const { studentId, scopeId, blob, name = '' } = input
  const type = blob.type || 'image/jpeg'
  if (type && !type.startsWith('image/')) return fail('숙제 사진은 사진 파일만 올릴 수 있어요.')
  const path = homeworkPhotoPath(studentId, scopeId || 'draft', input.index, mediaExtension({ type, name }))
  try {
    const { error } = await supabase.storage.from(HOMEWORK_BUCKET).upload(path, blob, {
      contentType: type,
      cacheControl: '3600',
      upsert: false,
    })
    if (error) return fail(describeHomeworkError(error.message))
    return { ok: true, data: path }
  } catch (error) {
    return fail(describeHomeworkError(error instanceof Error ? error.message : String(error)))
  }
}

/**
 * 숙제 사진 여러 장을 한 장씩 차례로 올리고 경로 목록을 돌려준다.
 * 한 장이라도 실패하면 그때까지 올린 사진을 지우고 오류를 돌려준다(찌꺼기가 남지 않게).
 * (화면에서는 보통 uploadHomeworkPhoto 로 한 장씩 올린다 — 이 함수는 예전 흐름·검증용)
 */
export async function uploadHomeworkPhotos(
  studentId: string,
  sessionId: string,
  files: File[],
): Promise<ApiResult<string[]>> {
  if (!isSupabaseConfigured) return fail(NOT_CONFIGURED_MESSAGE)
  if (files.length === 0) return { ok: true, data: [] }
  if (files.length > HOMEWORK_PHOTO_MAX) return fail(`사진은 ${HOMEWORK_PHOTO_MAX}장까지 올릴 수 있어요.`)

  const paths: string[] = []
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    if (file.type && !file.type.startsWith('image/')) {
      await removeHomeworkPhotos(paths)
      return fail('숙제 사진은 사진 파일만 올릴 수 있어요.')
    }
    let prepared
    try {
      prepared = await prepareHomeworkPhoto(file)
    } catch {
      await removeHomeworkPhotos(paths)
      return fail('사진을 준비하지 못했어요. 다시 찍어 올려 주세요.')
    }
    const path = homeworkPhotoPath(studentId, sessionId, index, mediaExtension({ type: prepared.type, name: file.name }))
    try {
      const { error } = await supabase.storage.from(HOMEWORK_BUCKET).upload(path, prepared.blob, {
        contentType: prepared.type,
        cacheControl: '3600',
        upsert: false,
      })
      if (error) {
        await removeHomeworkPhotos(paths)
        return fail(describeHomeworkError(error.message))
      }
      paths.push(path)
    } catch (error) {
      await removeHomeworkPhotos(paths)
      return fail(describeHomeworkError(error instanceof Error ? error.message : String(error)))
    }
  }
  return { ok: true, data: paths }
}

/** 올린 사진 지우기 (제출이 실패했을 때 정리용) */
export async function removeHomeworkPhotos(paths: string[]): Promise<void> {
  if (!isSupabaseConfigured || paths.length === 0) return
  try {
    await supabase.storage.from(HOMEWORK_BUCKET).remove(paths)
  } catch (error) {
    console.warn('[sunogong] 숙제 사진 정리 실패:', error)
  }
}

/* ------------------------------------------------------------------ */
/* 학생 — 초안 (사진·문제 수를 미리 저장)                                */
/* ------------------------------------------------------------------ */

export interface HomeworkDraftResult {
  submission: HomeworkSubmission | null
  photo_paths: string[]
  problems: number | null
  open: boolean
}

/**
 * 숙제 사진·문제 수 초안 저장.
 * · sessionId   : 타이머 화면에서 마칠 때 (아직 안 끝난 숙제 세션)
 * · submissionId: 다음 접속 때 「지난 숙제 공부 제출」 창 (자동 종료된 제출)
 * 사진을 한 장 올릴 때마다, 문제 수를 누를 때마다, 창을 열고 닫을 때 부른다.
 */
export const saveHomeworkDraft = (input: {
  sessionId?: string | null
  submissionId?: string | null
  problems: number | null
  photoPaths: string[]
  open?: boolean
}) =>
  rpc<HomeworkDraftResult>('save_homework_draft', {
    p_session_id: input.sessionId ?? null,
    p_submission_id: input.submissionId ?? null,
    p_problems: input.problems,
    p_photo_paths: input.photoPaths,
    p_open: input.open ?? true,
  })

/** 초안 줄 지우기 (그만두기·남길 것이 없을 때) */
export const clearHomeworkDraft = (input: { sessionId?: string | null; submissionId?: string | null }) =>
  rpc<{ deleted: number }>('clear_homework_draft', {
    p_session_id: input.sessionId ?? null,
    p_submission_id: input.submissionId ?? null,
  })

/** 진행 중인 숙제 세션의 초안 한 줄 (없으면 null) */
export const findHomeworkDraft = (sessionId: string) =>
  run<HomeworkSubmission | null>(() =>
    supabase
      .from('homework_submissions')
      .select('*')
      .eq('session_id', sessionId)
      .eq('draft_active', true)
      .maybeSingle(),
  )

/* ------------------------------------------------------------------ */
/* 학생 — 제출                                                         */
/* ------------------------------------------------------------------ */

/** 숙제 공부를 사진과 함께 제출 → 승인 대기 (기록에는 아직 반영되지 않는다) */
export const submitHomework = (sessionId: string, problems: number, photoPaths: string[]) =>
  rpc<FinishResult>('submit_homework', {
    p_session_id: sessionId,
    p_problems: Math.max(0, Math.min(9999, Math.floor(problems) || 0)),
    p_photo_paths: photoPaths,
  })

/** 자동 종료된 숙제 공부의 문제 수·사진 채우기 */
export const submitPendingHomework = (submissionId: string, problems: number, photoPaths: string[]) =>
  rpc<HomeworkSubmission>('submit_pending_homework', {
    p_submission_id: submissionId,
    p_problems: Math.max(0, Math.min(9999, Math.floor(problems) || 0)),
    p_photo_paths: photoPaths,
  })

/* ------------------------------------------------------------------ */
/* 읽기                                                                */
/* ------------------------------------------------------------------ */

/** 내 숙제 제출 (최근 것부터) — 아직 제출 전인 초안 줄은 빼고 */
export const listMyHomeworkSubmissions = (studentId: string, limit = 60) =>
  run<HomeworkSubmission[]>(() =>
    supabase
      .from('homework_submissions')
      .select('*')
      .eq('student_id', studentId)
      .eq('draft_active', false)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit),
  )

/** 관리자 숙제관리 — 학생 이름·학년을 함께, 승인 대기부터 (초안 줄은 빼고) */
export const listHomeworkSubmissions = (limit = 300) =>
  run<HomeworkSubmission[]>(() =>
    supabase
      .from('homework_submissions')
      .select('*, students(name, grade)')
      .eq('draft_active', false)
      .order('status', { ascending: true })
      .order('submitted_at', { ascending: false })
      .limit(limit),
  )

/** 승인 대기 건수 (관리자 탭 배지) — 아직 제출 전인 초안은 빼고 */
export const countPendingHomework = () =>
  run<number>(() =>
    supabase
      .from('homework_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('draft_active', false)
      .then((res) => ({ data: res.count ?? 0, error: res.error })),
  )

/** 자동 종료된 숙제 공부 중 문제 수를 아직 받지 못한 제출 */
export const listPendingHomeworkSubmissions = (studentId: string) =>
  rpc<HomeworkSubmission[]>('pending_homework_submissions', { p_student_id: studentId })

/** 비공개 버킷의 숙제 사진을 볼 수 있는 1시간짜리 주소 만들기 (경로 → 주소) */
export async function signHomeworkPhotos(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  if (!isSupabaseConfigured) return {}
  const unique = Array.from(new Set(paths.filter((path): path is string => Boolean(path))))
  if (unique.length === 0) return {}
  const urls: Record<string, string> = {}
  for (let index = 0; index < unique.length; index += 50) {
    const chunk = unique.slice(index, index + 50)
    try {
      const { data, error } = await supabase.storage
        .from(HOMEWORK_BUCKET)
        .createSignedUrls(chunk, HOMEWORK_SIGNED_URL_SECONDS)
      if (error) {
        console.warn('[sunogong] 숙제 사진 주소 만들기 실패:', error.message)
        continue
      }
      for (const item of data ?? []) {
        if (item?.path && item?.signedUrl) urls[item.path] = item.signedUrl
      }
    } catch (error) {
      console.warn('[sunogong] 숙제 사진 주소 만들기 실패:', error)
    }
  }
  return urls
}

/* ------------------------------------------------------------------ */
/* 선오공이(관리자) — 승인/반려                                        */
/* ------------------------------------------------------------------ */

export interface ReviewResult {
  submission: HomeworkSubmission
  minutes: number
  problems: number
  status: HomeworkSubmission['status']
}

/**
 * 시간·문항수를 따로 승인/반려 — 승인한 항목만 그 날 기록에 더해진다 (드래곤볼과는 무관).
 * comment 는 학생에게 보일 「선생님 칭찬 한마디」(선택) — 비우면 저장하지 않는다.
 */
export const reviewHomeworkSubmission = (
  submissionId: string,
  timeApproved: boolean,
  problemsApproved: boolean,
  reason?: string | null,
  comment?: string | null,
) =>
  rpc<ReviewResult>('review_homework_submission', {
    p_submission_id: submissionId,
    p_time_approved: timeApproved,
    p_problems_approved: problemsApproved,
    p_reject_reason: normalizeReason(reason) || null,
    p_teacher_comment: normalizeComment(comment) || null,
  })
