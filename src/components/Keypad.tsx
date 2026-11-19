interface KeypadProps {
  onDigit: (digit: string) => void
  onBackspace: () => void
  onConfirm: () => void
  confirmLabel?: string
  confirmDisabled?: boolean
  busy?: boolean
  /** 숫자판과 함께 보여줄 부가 버튼 (예: 0) */
  className?: string
}

/** 모바일 한 화면에 들어가는 숫자 키패드 */
export function Keypad({
  onDigit,
  onBackspace,
  onConfirm,
  confirmLabel = '확인',
  confirmDisabled = false,
  busy = false,
  className = '',
}: KeypadProps): JSX.Element {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div className={`grid w-full grid-cols-3 gap-2.5 ${className}`}>
      {digits.map((digit) => (
        <button
          key={digit}
          type="button"
          inputMode="none"
          className="keycap h-[clamp(44px,7.2dvh,68px)]"
          onClick={() => onDigit(digit)}
          aria-label={digit}
        >
          {digit}
        </button>
      ))}

      <button
        type="button"
        inputMode="none"
        className="keycap h-[clamp(44px,7.2dvh,68px)] text-navy/60"
        onClick={onBackspace}
        aria-label="지우기"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M20 6H9l-6 6 6 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1Z" strokeLinejoin="round" />
          <path d="m13 10 4 4m0-4-4 4" strokeLinecap="round" />
        </svg>
      </button>

      <button
        type="button"
        inputMode="none"
        className="keycap h-[clamp(44px,7.2dvh,68px)]"
        onClick={() => onDigit('0')}
        aria-label="0"
      >
        0
      </button>

      <button
        type="button"
        inputMode="none"
        className="flex h-[clamp(44px,7.2dvh,68px)] select-none items-center justify-center rounded-2xl bg-navy text-base font-bold text-white shadow-soft transition
          active:scale-[0.97] disabled:bg-navy/35 disabled:shadow-none"
        onClick={onConfirm}
        disabled={confirmDisabled || busy}
      >
        {busy ? <Spinner className="h-5 w-5 border-white/40 border-t-white" /> : confirmLabel}
      </button>
    </div>
  )
}

export function Spinner({ className = 'h-5 w-5 border-navy/20 border-t-navy' }: { className?: string }): JSX.Element {
  return <span className={`inline-block animate-spin rounded-full border-2 ${className}`} aria-hidden="true" />
}
