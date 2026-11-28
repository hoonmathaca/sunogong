import { useEffect, useRef, type ReactNode } from 'react'
import { bodyScrollLock } from '../lib/bodyScrollLock'

interface ModalProps {
  open: boolean
  title: string
  description?: ReactNode
  onClose: () => void
  children?: ReactNode
  footer?: ReactNode
  /** 화면 폭 제한 */
  wide?: boolean
}

export function Modal({ open, title, description, onClose, children, footer, wide = false }: ModalProps): JSX.Element | null {
  /* onClose 는 화면이 그려질 때마다 새 함수라, 그대로 의존성에 넣으면
     매초(타이머) 다시 잠그고 풀어 body 스크롤 잠금이 어긋난다 — 최신 값만 ref 로 본다 */
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    /* 창이 겹겹이 떠도 마지막 창이 닫힐 때 한 번만 되돌린다 (2026-11-28 화면 멈춤 수정) */
    bodyScrollLock.lock()
    return () => {
      window.removeEventListener('keydown', onKey)
      bodyScrollLock.unlock()
    }
  }, [open])

  if (!open) return null

  /* data-swipe-ignore: 모달이 떠 있는 동안 관리자 화면 좌우 스와이프(탭 이동)를 막는다 */
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" data-swipe-ignore="modal">
      <button type="button" aria-label="닫기" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl animate-fadein sm:rounded-3xl ${
          wide ? 'sm:max-w-3xl' : 'sm:max-w-md'
        }`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-navy">{title}</h2>
            {description ? <div className="mt-1 text-sm text-navy/60">{description}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-navy/50 transition hover:bg-blue-soft"
            aria-label="닫기"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  )
}
