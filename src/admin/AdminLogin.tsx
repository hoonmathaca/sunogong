import { useState } from 'react'
import { BrandFooter, Mascot } from '../components/Brand'
import { ADMIN_PASSWORD } from '../lib/supabase'

interface AdminLoginProps {
  onSuccess: () => void
  onBack: () => void
}

/** 관리자 비밀번호 입장 */
export function AdminLogin({ onSuccess, onBack }: AdminLoginProps): JSX.Element {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)

  const submit = () => {
    if (value.trim() === ADMIN_PASSWORD) {
      setError(null)
      onSuccess()
      return
    }
    setError('비밀번호가 맞지 않아요')
    setShake((n) => n + 1)
    setValue('')
  }

  return (
    <div className="screen bg-gradient-to-b from-blue-soft/60 to-white">
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Mascot variant="face" className="h-24 w-24" />
        <h1 className="mt-4 font-round text-[26px] text-navy">선오공 관리자</h1>
        <p className="mt-1 text-[13px] font-semibold text-navy/50">관리자 비밀번호를 입력해주세요</p>

        <form
          key={shake}
          className={`mt-6 w-full max-w-xs ${error ? 'animate-shake' : ''}`}
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={value}
            onChange={(event) => {
              setError(null)
              setValue(event.target.value)
            }}
            placeholder="••••"
            className="w-full rounded-2xl border-2 border-blue-line bg-white px-4 py-3 text-center text-[24px] font-bold tracking-[0.4em] text-navy focus:border-navy focus:outline-none"
            aria-label="관리자 비밀번호"
          />
          <p role="alert" className={`mt-2 h-5 text-center text-[12px] font-semibold ${error ? 'text-red-500' : 'text-navy/35'}`}>
            {error ?? '기기에서는 로그인이 유지돼요'}
          </p>
          <button type="submit" className="btn-navy mt-2 h-[50px] w-full text-base">
            입장
          </button>
        </form>

        <button type="button" onClick={onBack} className="btn-ghost mt-5 text-[12px]">
          ← 학생 화면으로
        </button>
      </div>
      <BrandFooter />
    </div>
  )
}
