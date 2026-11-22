import { useState } from 'react'
import { QUOTES, pickQuote } from '../lib/quotes'

/**
 * 출결코드 입력 아래에 띄우는 「오늘의 한줄」 카드.
 * 화면에 들어올 때 한 개를 무작위로 골라 보여 줄 뿐, 눌러도 바뀌지 않는 일반 카드다.
 */
export function QuoteCard({ className = '' }: { className?: string }): JSX.Element {
  const [index] = useState(() => pickQuote())
  const quote = QUOTES[index]

  return (
    <div
      data-quote-card
      className={`w-full rounded-2xl border border-blue-line bg-blue-soft/70 px-3.5 py-1.5 text-left ${className}`}
    >
      <span className="block text-[9.5px] font-bold leading-none tracking-wide text-blue-brand/60">오늘의 한줄</span>
      <span data-quote-text className="mt-1 block text-[12px] font-semibold leading-[1.4] text-navy/80">
        <span className="select-none text-blue-brand/50">“</span>
        {quote.text}
        <span className="select-none text-blue-brand/50">”</span>
      </span>
      <span data-quote-source className="mt-1 block text-[10px] font-semibold leading-tight text-navy/45">
        — {quote.source}
      </span>
    </div>
  )
}
