import { useEffect, useMemo, useRef, useState } from 'react'
import { PhotoInputButton } from '../components/PhotoInputButton'
import { HOMEWORK_PHOTO_MAX, HOMEWORK_PHOTO_MAX_SIZE, canAddPhotos } from '../lib/homeworkBoard'
import { PHOTO_ALBUM_LABEL, PHOTO_CAMERA_LABEL, mergePhotoFiles } from '../lib/photoPick'

interface HomeworkPhotoPickerProps {
  /** 고른 사진 파일 (아직 올리지 않은 원본) */
  files: File[]
  onChange: (next: File[]) => void
  disabled?: boolean
  /** 창 안에서 작게 쓸 때 */
  compact?: boolean
  /** 강조해서 보여 줄 안내 (사진이 필요한데 없을 때) */
  warn?: boolean
}

/**
 * 숙제 공부 사진 고르기 (학생).
 * · 📷 바로 찍기 — 폰 기본 카메라가 바로 열린다(capture=environment, 한 장).
 * · 🖼️ 앨범에서 고르기 — 이미 찍어 둔 사진을 여러 장 고른다(multiple).
 * 두 버튼을 합쳐 최대 5장까지 담고, 미리 보기를 보여 준다.
 * 올리기 전에 브라우저에서 긴 변 1200px · JPEG 0.72 로 줄인다(올릴 때).
 */
export function HomeworkPhotoPicker({
  files,
  onChange,
  disabled = false,
  compact = false,
  warn = false,
}: HomeworkPhotoPickerProps): JSX.Element {
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const albumRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  /* 안드로이드에서 뒤로가기·앱 전환으로 돌아왔을 때, 남아 있던 선택기 상태를 끊기 위해
     input 을 새로 만든다(사진 목록은 부모가 들고 있어 그대로 남는다). */
  const [generation, setGeneration] = useState(0)

  /* 미리 보기 주소 — 파일이 바뀌면 앞의 주소는 돌려준다 */
  const urls = useMemo(
    () => files.map((file) => (typeof URL !== 'undefined' ? URL.createObjectURL(file) : '')),
    [files],
  )
  useEffect(() => {
    return () => {
      for (const url of urls) {
        if (url) URL.revokeObjectURL(url)
      }
    }
  }, [urls])

  /* 화면으로 돌아올 때마다 input 값을 비운다 — 같은 사진을 다시 골라도 change 가 오게.
     뒤로가기로 되살아난 화면(bfcache)이면 input 자체를 새로 만들어 선택기를 확실히 다시 열 수 있게 한다. */
  useEffect(() => {
    const clearValues = () => {
      if (cameraRef.current) cameraRef.current.value = ''
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
    const merged = mergePhotoFiles(files, picked, HOMEWORK_PHOTO_MAX)
    setError(merged.error)
    if (merged.files !== files) onChange(merged.files)
  }

  const removeAt = (index: number) => {
    setError(null)
    onChange(files.filter((_, position) => position !== index))
  }

  const full = !canAddPhotos(files.length)
  const blocked = disabled || full

  return (
    <div className={compact ? '' : 'mt-1'}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-bold text-navy/70">
          공부한 페이지 사진
          <span className={`ml-1 tabular ${files.length > 0 ? 'text-[#6D3BD6]' : 'text-navy/40'}`}>
            {`${files.length}/${HOMEWORK_PHOTO_MAX}`}
          </span>
        </p>
      </div>

      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <PhotoInputButton
          key={`camera-${generation}`}
          name="camera"
          label={PHOTO_CAMERA_LABEL}
          capture
          tone="primary"
          disabled={blocked}
          inputRef={cameraRef}
          onFiles={addFiles}
          className="h-[44px]"
        />
        <PhotoInputButton
          key={`album-${generation}`}
          name="album"
          label={PHOTO_ALBUM_LABEL}
          multiple
          disabled={blocked}
          inputRef={albumRef}
          onFiles={addFiles}
          className="h-[44px]"
        />
      </div>

      {files.length > 0 ? (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {files.map((file, index) => (
            <div key={`${file.name}-${file.size}-${index}`} className="relative aspect-square overflow-hidden rounded-xl bg-blue-soft">
              {urls[index] ? (
                <img src={urls[index]} alt={`숙제 사진 ${index + 1}`} className="h-full w-full object-cover" />
              ) : null}
              <button
                type="button"
                onClick={() => removeAt(index)}
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

      <p className={`mt-1.5 text-[10.5px] leading-snug ${warn && files.length === 0 ? 'font-bold text-[#B07A00]' : 'text-navy/40'}`}>
        {warn && files.length === 0
          ? '푼 문제가 있으면 사진을 1장 이상 올려주세요.'
          : full
            ? `${HOMEWORK_PHOTO_MAX}장을 다 담았어요. 바꾸려면 사진 위 ✕를 눌러 빼주세요.`
            : `찍거나 고르면 화면에 맞게 줄여서 올라가요(긴 변 ${HOMEWORK_PHOTO_MAX_SIZE}px).`}
      </p>
      {error ? <p className="mt-1 text-[11px] font-semibold text-red-500">{error}</p> : null}
    </div>
  )
}
