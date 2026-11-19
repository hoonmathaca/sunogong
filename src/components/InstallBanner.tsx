import { useEffect, useState } from 'react'
import { detectPlatform, isStandalone, type Platform } from '../lib/platform'

/** 닫으면 이만큼은 다시 뜨지 않는다 (지나면 또 보여서 다시 보기 쉽게) */
const HIDE_KEY = 'sunogong-install-guide-hidden-until'
const HIDE_DAYS = 7

function hiddenUntil(): number {
  try {
    const raw = localStorage.getItem(HIDE_KEY)
    const until = raw ? Number(raw) : 0
    return Number.isFinite(until) ? until : 0
  } catch {
    return 0
  }
}

/**
 * 홈 화면 설치 안내 배너.
 * 아이폰(Safari) 안내와 안드로이드(Chrome) 안내를 **둘 다** 보여주고,
 * 지금 쓰는 기기의 줄만 조금 진하게 표시한다.
 * 닫으면 7일 동안 숨겼다가 다시 보여준다.
 */
export function InstallBanner(): JSX.Element | null {
  const [hidden, setHidden] = useState(true)
  const [platform, setPlatform] = useState<Platform>('other')

  useEffect(() => {
    try {
      setPlatform(detectPlatform())
      setHidden(isStandalone() || Date.now() < hiddenUntil())
    } catch {
      setHidden(true)
    }
  }, [])

  if (hidden) return null

  const dismiss = () => {
    try {
      localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_DAYS * 86400_000))
    } catch {
      /* 저장 못 해도 이번 화면에서는 닫는다 */
    }
    setHidden(true)
  }

  const line = (target: Platform, label: string, guide: string) => (
    <li className={`flex gap-1.5 ${platform === target ? 'text-navy/80' : 'text-navy/55'}`}>
      <span className="shrink-0">{platform === target ? '•' : '·'}</span>
      <span>
        <strong className={`font-semibold ${platform === target ? 'text-navy' : 'text-navy/70'}`}>{label}</strong> {guide}
      </span>
    </li>
  )

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

      <ul className="mt-1 space-y-0.5 text-[12px] leading-relaxed">
        {line('ios', '아이폰(Safari)', '· 공유 버튼 → 홈 화면에 추가')}
        {line('android', '안드로이드(Chrome)', '· 메뉴(⋮) → 홈 화면에 추가')}
      </ul>
    </aside>
  )
}
