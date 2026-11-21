/**
 * 근두운 — 작은 구름 안에 '닉네임 + 진행 시간'을 넣어 둥둥 떠다니게 보여 준다.
 * 모바일 폭에서도 글자가 잘리지 않도록 구름은 한 줄짜리 알약 모양이고,
 * 넘치는 이름은 말줄임으로 줄인다.
 */
import { cloudMotion, formatLiveClock } from '../lib/kintounBoard'

interface KintounCloudProps {
  label: string
  seconds: number
  /** 내 구름이면 노란 테두리 */
  isMe?: boolean
  /** 떠다니는 박자를 서로 다르게 하기 위한 순번 */
  index?: number
  className?: string
}

export function KintounCloud({ label, seconds, isMe = false, index = 0, className = '' }: KintounCloudProps): JSX.Element {
  const motion = cloudMotion(index)
  return (
    <span
      className={`kintoun-float ${className}`}
      style={{ animationDuration: motion.duration, animationDelay: motion.delay }}
    >
      <span
        className={`kintoun-cloud max-w-[9.5rem] ${isMe ? 'kintoun-cloud--me' : ''}`}
        style={{ animationDuration: motion.drift, animationDelay: motion.delay }}
      >
        <span className={`truncate text-[11px] font-bold ${isMe ? 'text-[#8A5400]' : 'text-navy/80'}`}>{label}</span>
        <span className={`shrink-0 text-[10px] font-semibold tabular ${isMe ? 'text-[#B07200]' : 'text-navy/45'}`}>
          {formatLiveClock(seconds)}
        </span>
      </span>
    </span>
  )
}

/** 드래곤볼 한 알 (개수 표시·쏘기 애니메이션에 함께 쓴다) */
export function Dragonball({
  size = 'md',
  filled = true,
  label = '',
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg'
  filled?: boolean
  label?: string
  className?: string
}): JSX.Element {
  const box = size === 'lg' ? 'h-8 w-8 text-[10px]' : size === 'sm' ? 'h-4 w-4 text-[8px]' : 'h-6 w-6 text-[9px]'
  return (
    <span
      className={`dragonball ${box} ${filled ? '' : 'dragonball--empty'} ${className}`}
      aria-hidden={label ? undefined : true}
    >
      {label}
    </span>
  )
}
