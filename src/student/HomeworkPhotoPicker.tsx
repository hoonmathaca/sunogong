import { useEffect, useRef, useState } from 'react'
import { PhotoCaptureButton } from '../components/PhotoCaptureButton'
import { PhotoInputButton } from '../components/PhotoInputButton'
import { HOMEWORK_PHOTO_MAX, HOMEWORK_PHOTO_MAX_SIZE, canAddPhotos } from '../lib/homeworkBoard'
import type { HomeworkPhotoItem } from '../lib/homeworkPhotos'
import { PHOTO_ALBUM_LABEL, PHOTO_CAMERA_LABEL } from '../lib/photoPick'

interface HomeworkPhotoPickerProps {
  /** 담긴 사진 (줄인 사진 미리 보기·올리는 중·실패 표시) */
  photos: HomeworkPhotoItem[]
  onAdd: (files: File[]) => void
  onRemove: (key: string) => void
  disabled?: boolean
  /** 창 안에서 작게 쓸 때 */
  compact?: boolean
}

const STATE_BADGE: Record<HomeworkPhotoItem['state'], string> = {
  uploading: '올리는 중…',
  ready: '',
  error: '다시 올려 주세요',
}

/**
 * 숙제 공부 사진 고르기 (학생).
 * · 📷 바로 찍기 — 앱 안 카메라가 열린다(크롬을 벗어나지 않는다). 셔터 → 미리 보기 → 올리기.
 *   카메라를 못 쓰는 기기에서만 사진 선택기(`accept="image/*"`)로 넘어간다.
 *   (폰 기본 카메라 앱을 띄우면 크롬이 메모리 부족으로 회수되어 찍은 사진이 사라졌다 — 2026-11-28)
 * · 🖼️ 앨범에서 고르기 — 이미 찍어 둔 사진을 여러 장 고른다(multiple).
 * 두 버튼을 합쳐 최대 5장까지 담고, 미리 보기를 보여 준다.
 * 고른 사진은 화면에 맞게 줄여(긴 변 1200px · JPEG 0.72) 그 자리에서 바로 올라간다.
 * 미리 보기는 원본이 아니라 줄인 사진으로 그린다 — 원본을 다시 열면 메모리가 크게 늘어난다.
 */
export function HomeworkPhotoPicker({
  photos,
  onAdd,
  onRemove,
  disabled = false,
  compact = false,
}: HomeworkPhotoPickerProps): JSX.Element {
  const albumRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /* 안드로이드에서 뒤로가기·앱 전환으로 돌아왔을 때, 남아 있던 선택기 상태를 끊기 위해
     input 을 새로 만든다(사진 목록은 부모가 들고 있어 그대로 남는다). */
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    const clearValues = () => {
      if (albumRef.current) albumRef.current.value = ''
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') clearValues()
    }
    const onPageShow = (event: PageTransitionEvent) => {
      clearValues()
      if (event.persisted) setGeneration((value) => value + 1)
    }
    window.addEventListener('focus', clearValues)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', clearValues)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const addFiles = (picked: File[]) => {
    if (picked.length === 0) return
    if (!canAddPhotos(photos.length)) {
      setError(`사진은 ${HOMEWORK_PHOTO_MAX}장까지 올릴 수 있어요.`)
      return
    }
    setError(null)
    onAdd(picked)
  }

  const removeAt = (key: string) => {
    setError(null)
    onRemove(key)
  }

  const full = !canAddPhotos(photos.length)
  const blocked = disabled || full
  const uploadFailed = photos.some((photo) => photo.state === 'error')

  return (
    <div className={compact ? '' : 'mt-1'}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-bold text-navy/70">
          공부한 페이지 사진
          <span className={`ml-1 tabular ${photos.length > 0 ? 'text-[#D9382F]' : 'text-navy/40'}`}>
            {`${photos.length}/${HOMEWORK_PHOTO_MAX}`}
          </span>
        </p>
      </div>

      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <PhotoCaptureButton
          name="camera"
          label={PHOTO_CAMERA_LABEL}
          tone="primary"
          accent="homework"
          multiple
          maxSize={HOMEWORK_PHOTO_MAX_SIZE}
          disabled={blocked}
          onFiles={addFiles}
          onNotice={setNotice}
          className="h-[44px]"
        />
        <PhotoInputButton
          key={`album-${generation}`}
          name="album"
          label={PHOTO_ALBUM_LABEL}
          multiple
          accent="homework"
          disabled={blocked}
          inputRef={albumRef}
          onFiles={addFiles}
          onPickClick={() => setNotice(null)}
          className="h-[44px]"
        />
      </div>

      {photos.length > 0 ? (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {photos.map((photo, index) => (
            <div
              key={photo.key}
              data-photo-item={photo.state}
              className="relative aspect-square overflow-hidden rounded-xl bg-blue-soft"
            >
              {photo.preview ? (
                <img
                  src={photo.preview}
                  alt={`숙제 사진 ${index + 1}`}
                  className={`h-full w-full object-cover ${photo.state === 'error' ? 'opacity-40' : ''}`}
                />
              ) : null}
              {photo.state !== 'ready' ? (
                <span
                  className={`absolute inset-x-0 bottom-0 px-1 py-0.5 text-center text-[9.5px] font-bold text-white ${
                    photo.state === 'error' ? 'bg-red-500/85' : 'bg-navy/60'
                  }`}
                >
                  {STATE_BADGE[photo.state]}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => removeAt(photo.key)}
                disabled={disabled}
                aria-label={`${index + 1}번 사진 빼기`}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-navy/70 text-[11px] font-bold text-white"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-1.5 text-[10.5px] leading-snug text-navy/40">
        {full
          ? `${HOMEWORK_PHOTO_MAX}장을 다 담았어요. 바꾸려면 사진 위 ✕를 눌러 빼주세요.`
          : uploadFailed
            ? '올리지 못한 사진이 있어요. 사진 위 ✕로 빼고 다시 찍어 주세요.'
            : `찍거나 고르면 화면에 맞게 줄여서 바로 올라가요(긴 변 ${HOMEWORK_PHOTO_MAX_SIZE}px). 사진 없이도 제출할 수 있어요.`}
      </p>
      {notice ? <p className="mt-1 text-[11px] font-semibold leading-snug text-navy/55">{notice}</p> : null}
      {error ? <p className="mt-1 text-[11px] font-semibold text-red-500">{error}</p> : null}
    </div>
  )
}
