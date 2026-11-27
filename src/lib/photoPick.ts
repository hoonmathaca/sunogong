/**
 * 사진 고르기(카메라로 바로 찍기 · 앨범에서 고르기)에 쓰는 순수 함수와 문구.
 *
 * · 카메라: 앱 안 카메라(`InAppCamera` — getUserMedia, 화면을 벗어나지 않는다).
 *   `capture="environment"` 로 폰 기본 카메라 앱을 띄우면, 카메라 앱이 메모리를 크게 쓰는 동안
 *   뒤의 크롬이 OS 에게 회수되어 돌아올 때 「메모리가 부족하여 이전 작업을 완료할 수 없습니다.」
 *   가 뜨며 찍은 사진이 사라졌다(2026-11-28 제보). 그래서 카메라를 못 쓰는 기기에서만
 *   `<input type="file" accept="image/*">`(사진 선택기)로 넘어간다.
 * · 앨범: `<input type="file" accept="image/*" multiple>`
 * · 두 버튼을 합쳐 최대 5장(HOMEWORK_PHOTO_MAX)까지 담는다.
 */
import { HOMEWORK_PHOTO_MAX } from './homeworkBoard'

/** 화면에 보이는 버튼 이름 (확정 문구 — 그대로 쓴다) */
export const PHOTO_CAMERA_LABEL = '📷 바로 찍기'
export const PHOTO_ALBUM_LABEL = '🖼️ 앨범에서 고르기'

export interface PhotoPickOutcome<T> {
  files: T[]
  error: string | null
}

/** 더 담을 수 있는 장수 (0이면 가득 참) */
export function photoRoom(current: number, max: number = HOMEWORK_PHOTO_MAX): number {
  const count = Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0
  return Math.max(0, max - count)
}

/** 사진인지 (type 이 비어 있는 경우도 사진으로 본다 — 일부 안드로이드 갤러리가 type 을 안 준다) */
export function isPhotoFile(file: { type: string }): boolean {
  return !file.type || file.type.startsWith('image/')
}

/**
 * 고른 사진을 지금까지 담은 사진 뒤에 붙인다.
 * 가득 찼거나 사진이 아니면 담지 않고, 넘치면 남은 자리만큼만 담고 안내 문구를 돌려준다.
 */
export function mergePhotoFiles<T extends { type: string }>(
  current: T[],
  incoming: T[],
  max: number = HOMEWORK_PHOTO_MAX,
): PhotoPickOutcome<T> {
  const kept = Array.isArray(current) ? current : []
  const room = photoRoom(kept.length, max)
  const photos = (Array.isArray(incoming) ? incoming : []).filter(isPhotoFile)
  if (photos.length === 0) return { files: kept, error: null }
  if (room <= 0) return { files: kept, error: `사진은 ${max}장까지 올릴 수 있어요.` }
  if (photos.length > room) {
    return { files: [...kept, ...photos.slice(0, room)], error: `사진은 ${max}장까지라서 ${room}장만 담았어요.` }
  }
  return { files: [...kept, ...photos], error: null }
}
