import { useEffect, useRef } from 'react'
import { bodyScrollLock } from '../lib/bodyScrollLock'

interface ImageViewerProps {
  src: string | null
  alt?: string
  onClose: () => void
}

/** 사진을 화면 가득 크게 보는 창 (질문 사진·해설지 사진 확대) */
export function ImageViewer({ src, alt = '사진', onClose }: ImageViewerProps): JSX.Element | null {
  /* onClose 는 그릴 때마다 새 함수 — 의존성에 넣으면 잠금이 어긋난다 (ref 로 최신 값만 본다) */
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!src || typeof document === 'undefined') return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    bodyScrollLock.lock()
    return () => {
      window.removeEventListener('keydown', onKey)
      bodyScrollLock.unlock()
    }
  }, [src])

  if (!src) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-3"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full rounded-2xl object-contain"
        onClick={(event) => event.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] rounded-full bg-white/15 px-4 py-2 text-[13px] font-bold text-white backdrop-blur"
      >
        닫기
      </button>
    </div>
  )
}
