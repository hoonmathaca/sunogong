import { useState } from 'react'
import { QUOTES, pickNextQuote } from '../lib/quotes'

/**
 * 출결코드 입력 아래에 띄우는 「오늘의 명언」 카드.
 * 화면에 들어올 때 한 개를 고르고, 누르면 직전 명언을 피해 다른 명언으로 바뀐다.
 */
export function QuoteCard({ className = '' }: { className?: string }): JSX.Element {
  const [index, setIndex] = useState(() => pickNextQuote(null))
  const quote = QUOTES[index]

  return (
    <button
      type="button"
      data-quote-card
      onClick={() => setIndex((prev) => pickNextQuote(prev))}
      aria-label={`오늘의 명언. ${quote.text} ${quote.source} 누르면 다른 명언으로 바뀝니다.`}
      className={`w-full rounded-2xl border border-blue-line bg-blue-soft/70 px-3.5 py-1.5 text-left transition active:scale-[0.99] active:bg-blue-soft ${className}`}
    >
      <span className="flex items-center justify-between text-[9.5px] font-bold leading-none tracking-wide text-blue-brand/60">
        <span>오늘의 명언</span>
        <span className="text-navy/35">눌러서 바꾸기</span>
      </span>
      <span data-quote-text className="mt-1 block text-[12px] font-semibold leading-[1.4] text-navy/80">
        <span className="select-none text-blue-brand/50">“</span>
        {quote.text}
        <span className="select-none text-blue-brand/50">”</span>
      </span>
      <span data-quote-source className="mt-1 block text-[10px] font-semibold leading-tight text-navy/45">
        — {quote.source}
      </span>
    </button>
  )
}
