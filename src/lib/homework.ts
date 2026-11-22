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
 * 숙제 사진을 Storage 에 올리고 경로 목록을 돌려준다.
 * 한 장이라도 실패하면 그때까지 올린 사진을 지우고 오류를 돌려준다(찌꺼기가 남지 않게).
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

/** 내 숙제 제출 (최근 것부터) */
export const listMyHomeworkSubmissions = (studentId: string, limit = 60) =>
  run<HomeworkSubmission[]>(() =>
    supabase
      .from('homework_submissions')
      .select('*')
      .eq('student_id', studentId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit),
  )

/** 관리자 숙제관리 — 학생 이름·학년을 함께, 승인 대기부터 */
export const listHomeworkSubmissions = (limit = 300) =>
  run<HomeworkSubmission[]>(() =>
    supabase
      .from('homework_submissions')
      .select('*, students(name, grade)')
      .order('status', { ascending: true })
      .order('submitted_at', { ascending: false })
      .limit(limit),
  )

/** 승인 대기 건수 (관리자 탭 배지) */
export const countPendingHomework = () =>
  run<number>(() =>
    supabase
      .from('homework_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
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

/** 시간·문항수를 따로 승인/반려 — 승인한 항목만 그 날 기록에 더해진다 (드래곤볼과는 무관) */
export const reviewHomeworkSubmission = (
  submissionId: string,
  timeApproved: boolean,
  problemsApproved: boolean,
  reason?: string | null,
) =>
  rpc<ReviewResult>('review_homework_submission', {
    p_submission_id: submissionId,
    p_time_approved: timeApproved,
    p_problems_approved: problemsApproved,
    p_reject_reason: normalizeReason(reason) || null,
  })
