import { useEffect, useState } from 'react'
import { BrandFooter, Mascot } from '../components/Brand'
import { InstallBanner } from '../components/InstallBanner'
import { Keypad, Spinner } from '../components/Keypad'
import { QuoteCard } from '../components/QuoteCard'

interface CodeEntryScreenProps {
  onSubmit: (code: string) => Promise<{ ok: boolean; error?: string }>
  onAdmin: () => void
}

/** 학생 첫 화면: 4자리 코드 입력 */
export function CodeEntryScreen({ onSubmit, onAdmin }: CodeEntryScreenProps): JSX.Element {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)

  const push = (digit: string) => {
    if (busy) return
    setError(null)
    setCode((prev) => (prev.length >= 4 ? prev : prev + digit))
  }

  const pop = () => {
    if (busy) return
    setError(null)
    setCode((prev) => prev.slice(0, -1))
  }

  const submit = async () => {
    if (busy) return
    if (code.length !== 4) {
      setShake((n) => n + 1)
      setError('4자리 코드를 모두 입력해주세요')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await onSubmit(code)
      if (!result.ok) {
        setError(result.error ?? '코드를 확인해주세요')
        setShake((n) => n + 1)
        setCode('')
      }
    } catch (submitError) {
      console.error('[sunogong] 코드 확인 실패:', submitError)
      setError('잠시 후 다시 시도해주세요')
    } finally {
      setBusy(false)
    }
  }

  /* 컴퓨터에서도 숫자 키보드로 입력할 수 있게 */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (/^[0-9]$/.test(event.key)) push(event.key)
      else if (event.key === 'Backspace') pop()
      else if (event.key === 'Enter') void submit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="screen bg-white">
      <div className="flex-1 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-2.5">
          <Mascot variant="face" className="h-11 w-11 shrink-0" />
          <h1 className="font-round text-[28px] font-extrabold leading-none tracking-tight text-navy">선오공</h1>
        </header>
        <p className="mt-1.5 text-[15px] font-semibold text-navy/55">선생님, 오늘도 공부했어요!</p>

        <div className="mt-[clamp(10px,2.8dvh,22px)] flex flex-col items-center">
          <div key={shake} className={`flex gap-3 ${error ? 'animate-shake' : ''}`} aria-label={`입력한 자릿수 ${code.length}개`}>
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className={`flex h-[clamp(52px,8dvh,72px)] w-[clamp(48px,17vw,64px)] items-center justify-center rounded-2xl border-2 text-[30px] font-bold tabular transition-colors ${
                  error
                    ? 'border-red-300 bg-red-50/40'
                    : code[index]
                      ? 'border-navy bg-blue-soft'
                      : index === code.length
                        ? 'border-blue-brand bg-white'
                        : 'border-blue-line bg-white'
                }`}
              >
                {code[index] ? <span className="animate-pop">{code[index]}</span> : null}
              </div>
            ))}
          </div>

          <p
            role="alert"
            className={`mt-2 h-6 text-[13px] font-semibold ${error ? 'text-red-500' : 'text-navy/45'}`}
          >
            {error ?? '선생님께 받은 4자리 코드를 입력하세요'}
          </p>

          <div className="mt-1 w-full max-w-[340px]">
            <Keypad
              onDigit={push}
              onBackspace={pop}
              onConfirm={() => void submit()}
              confirmLabel="확인"
              confirmDisabled={code.length !== 4}
              busy={busy}
            />
          </div>

          {/* 출결코드 입력 바로 아래 — 누르면 다른 명언으로 바뀐다 */}
          <QuoteCard className="mt-2 max-w-[340px]" />
        </div>
      </div>

      <div className="px-5 pt-2">
        <InstallBanner />
      </div>

      <div className="flex items-center justify-end px-5 pt-2">
        <button
          type="button"
          onClick={onAdmin}
          className="btn-ghost border border-blue-line px-3 py-1.5 text-[12px]"
        >
          관리자
        </button>
      </div>

      <BrandFooter className="pt-2" />
      {busy ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-white/40">
          <Spinner className="h-8 w-8 border-navy/20 border-t-navy" />
        </div>
      ) : null}
    </div>
  )
}
