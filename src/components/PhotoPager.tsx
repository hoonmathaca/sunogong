import { useEffect, useRef, type TouchEvent } from 'react'
import { bodyScrollLock } from '../lib/bodyScrollLock'

interface PhotoPagerProps {
  /** 사진 주소 (서명 URL). 비어 있는 항목은 '불러오는 중'으로 보인다 */
  urls: string[]
  index: number
  onIndexChange: (next: number) => void
  onClose: () => void
  altPrefix?: string
}

/**
 * 숙제 사진을 크게 보며 좌우로 넘기는 창.
 * 버튼·키보드(← →)·손가락 밀기로 넘긴다.
 */
export function PhotoPager({ urls, index, onIndexChange, onClose, altPrefix = '숙제 사진' }: PhotoPagerProps): JSX.Element | null {
  const total = urls.length
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)

  const go = (step: number) => {
    if (total <= 1) return
    onIndexChange((index + step + total) % total)
  }

  /* onClose·go 는 그릴 때마다 새 함수 — 아래 효과는 화면이 떠 있는 동안 한 번만 건다 */
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const goRef = useRef(go)
  goRef.current = go

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
      if (event.key === 'ArrowLeft') goRef.current(-1)
      if (event.key === 'ArrowRight') goRef.current(1)
    }
    window.addEventListener('keydown', onKey)
    bodyScrollLock.lock()
    return () => {
      window.removeEventListener('keydown', onKey)
      bodyScrollLock.unlock()
    }
  }, [])

  if (total === 0) return null
  const src = urls[Math.min(Math.max(0, index), total - 1)]

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0]
    startX.current = touch.clientX
    startY.current = touch.clientY
  }

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (startX.current === null || startY.current === null) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - startX.current
    const dy = touch.clientY - startY.current
    startX.current = null
    startY.current = null
    if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy) * 1.2) return
    go(dx < 0 ? 1 : -1)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={`${altPrefix} 크게 보기`}
      data-swipe-ignore="photo-pager"
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="rounded-full bg-white/15 px-3 py-1 text-[12px] font-bold text-white tabular">
          {`${Math.min(index + 1, total)} / ${total}`}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/15 px-4 py-2 text-[13px] font-bold text-white backdrop-blur"
        >
          닫기
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-3"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {src ? (
          <img src={src} alt={`${altPrefix} ${index + 1}`} className="max-h-full max-w-full rounded-2xl object-contain" />
        ) : (
          <p className="text-[13px] font-semibold text-white/70">사진을 불러오는 중…</p>
        )}

        {total > 1 ? (
          <>
            <button
              type="button"
              aria-label="이전 사진"
              onClick={() => go(-1)}
              className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-[20px] font-bold text-white backdrop-blur"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="다음 사진"
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-[20px] font-bold text-white backdrop-blur"
            >
              ›
            </button>
          </>
        ) : null}
      </div>

      {total > 1 ? (
        <div className="flex items-center justify-center gap-1.5 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
          {urls.map((_, dot) => (
            <button
              key={dot}
              type="button"
              aria-label={`${dot + 1}번 사진`}
              onClick={() => onIndexChange(dot)}
              className={`h-2 rounded-full transition-all ${dot === index ? 'w-5 bg-white' : 'w-2 bg-white/40'}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
