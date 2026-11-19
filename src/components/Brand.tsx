import { useState } from 'react'

interface MascotProps {
  variant?: 'full' | 'face'
  className?: string
  /** 자리표시자까지도 숨길 때 */
  hideOnError?: boolean
}

const SRC = {
  full: '/images/mascot-full.png',
  face: '/images/mascot-face.png',
} as const

/**
 * 마스코트 이미지. 파일이 없거나 깨져도 화면이 비지 않도록
 * 같은 자리에 조용한 자리표시자를 그린다. (나중에 같은 경로로 파일만 바꾸면 됨)
 */
export function Mascot({ variant = 'full', className = '', hideOnError = false }: MascotProps): JSX.Element | null {
  const [failed, setFailed] = useState(false)

  if (failed) {
    if (hideOnError) return null
    return (
      <div
        aria-hidden="true"
        className={`flex items-center justify-center rounded-[28%] bg-navy/10 font-round text-navy/60 ${className}`}
      >
        선
      </div>
    )
  }

  return (
    <img
      src={SRC[variant]}
      alt=""
      aria-hidden="true"
      draggable={false}
      onError={() => setFailed(true)}
      className={`select-none object-contain ${className}`}
    />
  )
}

/** 훈수학 원형 배지 (모든 화면 맨 아래에만 작게) */
export function LogoMark({ className = 'h-6 w-6' }: { className?: string }): JSX.Element | null {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center rounded-full bg-navy/10 text-[9px] font-bold text-navy/60 ${className}`}
      >
        훈
      </span>
    )
  }
  return (
    <img
      src="/images/hunsu-badge.png"
      alt="훈수학학원"
      draggable={false}
      onError={() => setFailed(true)}
      className={`select-none object-contain ${className}`}
    />
  )
}

/** 훈수학 로고 (글자·전화번호가 들어간 원본 로고 — 큰 자리에만) */
export function LogoFull({ className = 'h-24 w-24' }: { className?: string }): JSX.Element | null {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <img
      src="/images/hunsu-logo.png"
      alt="훈수학학원"
      draggable={false}
      onError={() => setFailed(true)}
      className={`select-none object-contain ${className}`}
    />
  )
}

/** 모든 화면 맨 아래에만 표시 */
export function BrandFooter({ className = '' }: { className?: string }): JSX.Element {
  return (
    <footer className={`mt-auto flex flex-col items-center gap-1 pb-4 pt-3 ${className}`}>
      <LogoMark className="h-7 w-7 opacity-90" />
      <span className="text-[11px] font-semibold tracking-wide text-navy/45">훈수학학원</span>
    </footer>
  )
}
