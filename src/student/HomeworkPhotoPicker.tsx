import { useEffect, useMemo, useRef, useState } from 'react'
import { HOMEWORK_PHOTO_MAX, HOMEWORK_PHOTO_MAX_SIZE, canAddPhotos } from '../lib/homeworkBoard'

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
 * 카메라로 찍거나 앨범에서 고르면 미리 보기를 보여 주고, 최대 5장까지 담는다.
 * 올리기 전에 브라우저에서 긴 변 1200px · JPEG 0.72 로 줄인다(올릴 때).
 */
export function HomeworkPhotoPicker({
  files,
  onChange,
  disabled = false,
  compact = false,
  warn = false,
}: HomeworkPhotoPickerProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return
    const picked = Array.from(list)
    const images = picked.filter((file) => !file.type || file.type.startsWith('image/'))
    const room = HOMEWORK_PHOTO_MAX - files.length
    if (room <= 0) {
      setError(`사진은 ${HOMEWORK_PHOTO_MAX}장까지 올릴 수 있어요.`)
      return
    }
    if (images.length > room) {
      setError(`사진은 ${HOMEWORK_PHOTO_MAX}장까지라서 ${room}장만 담았어요.`)
    } else {
      setError(null)
    }
    onChange([...files, ...images.slice(0, room)])
  }

  const removeAt = (index: number) => {
    setError(null)
    onChange(files.filter((_, position) => position !== index))
  }

  return (
    <div className={compact ? '' : 'mt-1'}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-bold text-navy/70">
          공부한 페이지 사진
          <span className={`ml-1 tabular ${files.length > 0 ? 'text-[#6D3BD6]' : 'text-navy/40'}`}>
            {`${files.length}/${HOMEWORK_PHOTO_MAX}`}
          </span>
        </p>
        <button
          type="button"
          disabled={disabled || !canAddPhotos(files.length)}
          onClick={() => inputRef.current?.click()}
          className={`rounded-xl px-3 py-1.5 text-[12px] font-bold transition active:scale-[0.98] disabled:opacity-40 ${
            warn && files.length === 0
              ? 'bg-[#E9A400] text-white'
              : 'border border-[#6D3BD6]/30 bg-[#F5F0FF] text-[#4A28A0]'
          }`}
        >
          📷 사진 {files.length === 0 ? '찍기·고르기' : '더 담기'}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          addFiles(event.target.files)
          event.target.value = ''
        }}
      />

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
          : `찍어 올리면 화면에 맞게 줄여서 올라가요(긴 변 ${HOMEWORK_PHOTO_MAX_SIZE}px).`}
      </p>
      {error ? <p className="mt-1 text-[11px] font-semibold text-red-500">{error}</p> : null}
    </div>
  )
}
