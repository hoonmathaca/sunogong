/**
 * 숙제 사진 '초안'에 쓰는 값과 순수 함수들.
 *
 * 사진은 고르는 그 순간에 한 장씩 줄여서 바로 Storage 에 올리고, 그 경로와 입력 중인
 * 문제 수를 DB 초안(homework_submissions 의 draft_* 열)에 저장한다.
 * 그래서 카메라 앱을 열다 탭이 튕겨 새로고침돼도, 다시 들어오면 찍어 둔 사진이
 * 「숙제 공부 제출」 창에 그대로 살아 있다.
 *
 * 화면 없이 확인할 수 있게 계산은 여기에 모아 둔다.
 */
import { HOMEWORK_PHOTO_MAX } from './homeworkBoard'

/** 한 장의 상태 — 올리는 중 / 올라감 / 실패 */
export type HomeworkPhotoState = 'uploading' | 'ready' | 'error'

/** 「숙제 공부 제출」 창에 담긴 사진 한 장 */
export interface HomeworkPhotoItem {
  /** 화면 목록의 key (같은 사진을 다시 골라도 구분된다) */
  key: string
  /** 원본 파일 이름 (안내용) */
  name: string
  /** 아직 올리지 못한 줄인 사진 (줄인 JPEG) — 미리 보기와 다시 올리기에 쓴다 */
  blob: Blob | null
  /** Storage 에 올라간 경로 (homework-photos 버킷) */
  path: string | null
  /** 화면에 보여 줄 주소 (줄인 사진의 objectURL 또는 서명 주소) */
  preview: string | null
  state: HomeworkPhotoState
  /** 실패했을 때 보여 줄 말 */
  error?: string | null
}

let keySeed = 0

/** 새 사진 항목 — key 는 화면 목록에서만 쓴다 */
export function newPhotoItem(input: {
  name?: string
  blob?: Blob | null
  path?: string | null
  preview?: string | null
  state?: HomeworkPhotoState
}): HomeworkPhotoItem {
  keySeed += 1
  return {
    key: `p-${Date.now().toString(36)}-${keySeed}`,
    name: input.name ?? '숙제 사진',
    blob: input.blob ?? null,
    path: input.path ?? null,
    preview: input.preview ?? null,
    state: input.state ?? 'uploading',
    error: null,
  }
}

/**
 * DB 초안(사진 경로 목록)으로 화면 목록을 되살린다.
 * 서명 주소를 못 만든 사진도 목록에는 남긴다(제출할 때 경로로는 쓸 수 있다).
 */
export function restorePhotoItems(
  paths: (string | null | undefined)[] | null | undefined,
  urlByPath: Record<string, string> = {},
): HomeworkPhotoItem[] {
  const seen = new Set<string>()
  const items: HomeworkPhotoItem[] = []
  for (const raw of paths ?? []) {
    const path = (raw ?? '').trim()
    if (!path || seen.has(path)) continue
    seen.add(path)
    items.push(newPhotoItem({ path, preview: urlByPath[path] ?? null, state: 'ready', name: '숙제 사진' }))
    if (items.length >= HOMEWORK_PHOTO_MAX) break
  }
  return items
}

/** Storage 에 올라간 사진 경로만 (제출용) */
export function photoPathsOf(items: HomeworkPhotoItem[] | null | undefined): string[] {
  const seen = new Set<string>()
  const paths: string[] = []
  for (const item of items ?? []) {
    const path = (item.path ?? '').trim()
    if (!path || seen.has(path)) continue
    seen.add(path)
    paths.push(path)
  }
  return paths.slice(0, HOMEWORK_PHOTO_MAX)
}

/** 아직 못 올린 사진 (제출 직전에 다시 올린다) */
export function photosToUpload(items: HomeworkPhotoItem[] | null | undefined): HomeworkPhotoItem[] {
  return (items ?? []).filter((item) => Boolean(item.blob) && !item.path)
}

/** 화면에 담긴 사진 수 (올리는 중·실패 포함) */
export function photoCountOf(items: HomeworkPhotoItem[] | null | undefined): number {
  return (items ?? []).length
}

/** 더 담을 수 있는 장수 */
export function photoRoomOf(items: HomeworkPhotoItem[] | null | undefined, max: number = HOMEWORK_PHOTO_MAX): number {
  return Math.max(0, max - photoCountOf(items))
}

/** 한 장이라도 아직 올리는 중인가 */
export function isUploadingPhotos(items: HomeworkPhotoItem[] | null | undefined): boolean {
  return (items ?? []).some((item) => item.state === 'uploading')
}

/** 사진 경로에 붙일 번호 — 지금 담긴 사진 뒤부터 */
export function nextPhotoIndex(items: HomeworkPhotoItem[] | null | undefined): number {
  return photoCountOf(items)
}

/** 문제 수 입력칸(문자열) → DB 초안에 넣을 숫자 (비었으면 null) */
export function draftProblemsOf(text: string | null | undefined): number | null {
  const digits = (text ?? '').replace(/[^0-9]/g, '')
  if (!digits) return null
  const value = Number(digits)
  if (!Number.isFinite(value)) return null
  return Math.max(0, Math.min(9999, Math.floor(value)))
}

/** DB 초안의 문제 수 → 입력칸(문자열) */
export function draftProblemsText(value: number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return ''
  return String(Math.max(0, Math.min(9999, Math.floor(number))))
}

/**
 * 다시 접속했을 때 「숙제 공부 제출」 창을 그대로 다시 열어야 하는지.
 * 초안이 열려 있었고(draft_open), 사진이나 문제 수가 하나라도 담겨 있으면 다시 연다.
 */
export function shouldReopenDraft(draft: {
  draft_active?: boolean | null
  draft_open?: boolean | null
  draft_problems?: number | null
  photo_paths?: string[] | null
} | null | undefined): boolean {
  if (!draft) return false
  if (!draft.draft_active) return false
  if (!draft.draft_open) return false
  const photos = (draft.photo_paths ?? []).filter((path) => Boolean(path)).length
  return photos > 0 || draft.draft_problems !== null && draft.draft_problems !== undefined
}
