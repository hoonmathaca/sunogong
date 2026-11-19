import { useEffect, useState } from 'react'

const DISMISS_KEY = 'sunogong-install-guide-dismissed'

type Platform = 'ios' | 'android' | 'other'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'other'
}

function isStandalone(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
    return iosStandalone === true
  } catch {
    return false
  }
}

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 홈 화면 설치 안내 배너.
 * 닫으면 localStorage 에 기억해 두 번 다시 뜨지 않는다.
 */
export function InstallBanner(): JSX.Element | null {
  const [hidden, setHidden] = useState(true)
  const [platform, setPlatform] = useState<Platform>('other')

  useEffect(() => {
    try {
      setPlatform(detectPlatform())
      setHidden(isStandalone() || isDismissed())
    } catch {
      setHidden(true)
    }
  }, [])

  if (hidden) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* 저장 못 해도 이번 화면에서는 닫는다 */
    }
    setHidden(true)
  }

  return (
    <aside
      aria-label="홈 화면에 앱 설치 안내"
      className="relative w-full rounded-2xl border border-blue-line bg-blue-soft px-4 py-3 pr-10 text-left"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="설치 안내 닫기"
        className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full text-navy/40 transition hover:bg-white/70 hover:text-navy"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      </button>

      <p className="text-[13px] font-bold leading-snug text-navy">홈 화면에 추가하면 앱처럼 쓸 수 있어요</p>

      {platform === 'ios' ? (
        <p className="mt-1 text-[12px] leading-relaxed text-navy/65">
          <strong className="font-semibold text-navy/80">아이폰(Safari)</strong> · 공유 버튼 → 홈 화면에 추가
        </p>
      ) : null}

      {platform === 'android' ? (
        <p className="mt-1 text-[12px] leading-relaxed text-navy/65">
          <strong className="font-semibold text-navy/80">안드로이드(Chrome)</strong> · 메뉴(⋮) → 홈 화면에 추가
        </p>
      ) : null}

      {platform === 'other' ? (
        <p className="mt-1 text-[12px] leading-relaxed text-navy/65">
          크롬은 메뉴(⋮) → 홈 화면에 추가, 아이폰 사파리는 공유 → 홈 화면에 추가를 눌러주세요.
        </p>
      ) : null}
    </aside>
  )
}
