import type { ReactNode } from 'react'
import { GRADE_FILTERS, type GradeFilter } from '../lib/grades'
import type { StatScope } from '../lib/stats'

export function AdminSection({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}): JSX.Element {
  return (
    <section className={`card ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold text-navy">{title}</h2>
          {description ? <div className="mt-1 text-[12px] text-navy/50">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

const STAT_TONES = {
  white: {
    box: 'border border-blue-line bg-white text-navy',
    label: 'text-navy/45',
    value: 'text-navy',
    sub: 'text-navy/40',
  },
  navy: {
    box: 'bg-navy text-white',
    label: 'text-white/60',
    value: 'text-white',
    sub: 'text-white/50',
  },
  /** 🏫 학원 공부 */
  academy: {
    box: 'border border-blue-line bg-blue-soft/60 text-navy',
    label: 'text-navy/50',
    value: 'text-navy',
    sub: 'text-navy/40',
  },
  /** 🏠 숙제 공부 — 숙제 시작 버튼과 같은 보라색 */
  homework: {
    box: 'border border-[#6D3BD6]/15 bg-[#EDE4FF]/60 text-navy',
    label: 'text-[#5B2FC0]/60',
    value: 'text-[#5B2FC0]',
    sub: 'text-[#5B2FC0]/50',
  },
} as const

export function StatCard({
  label,
  value,
  sub,
  tone = 'white',
}: {
  label: string
  value: string
  sub?: string
  tone?: keyof typeof STAT_TONES
}): JSX.Element {
  const style = STAT_TONES[tone] ?? STAT_TONES.white
  return (
    <div className={`rounded-2xl px-4 py-3 ${style.box}`}>
      <p className={`text-[11px] font-semibold ${style.label}`}>{label}</p>
      <p className={`mt-1 text-xl font-extrabold tabular ${style.value}`}>{value}</p>
      {sub ? <p className={`mt-0.5 text-[11px] ${style.sub}`}>{sub}</p> : null}
    </div>
  )
}

export function GradeFilterSelect({
  value,
  onChange,
  className = '',
}: {
  value: GradeFilter
  onChange: (next: GradeFilter) => void
  className?: string
}): JSX.Element {
  return (
    <label className={`inline-flex items-center gap-2 text-[12px] font-semibold text-navy/60 ${className}`}>
      학년
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as GradeFilter)}
        className="rounded-xl border border-blue-line bg-white px-2.5 py-1.5 text-[12px] font-bold text-navy focus:outline-none focus:ring-2 focus:ring-blue-brand/30"
      >
        {GRADE_FILTERS.map((grade) => (
          <option key={grade} value={grade}>
            {grade}
          </option>
        ))}
      </select>
    </label>
  )
}

const SCOPE_OPTIONS: { scope: StatScope; label: string }[] = [
  { scope: 'all', label: '전체' },
  { scope: 'academy', label: '🏫 학원 공부' },
  { scope: 'homework', label: '🏠 숙제 공부' },
]

/**
 * 통계 구분 고르기 — 전체 / 🏫 학원 공부 / 🏠 숙제 공부.
 * 대시보드·랭킹·학생 상세에서 같은 모양으로 쓴다.
 */
export function KindScopeSwitch({
  value,
  onChange,
  className = '',
  label,
}: {
  value: StatScope
  onChange: (next: StatScope) => void
  className?: string
  /** 화면 읽기용 이름 (예: '학생 비교 구분') */
  label?: string
}): JSX.Element {
  return (
    <div
      role="group"
      aria-label={label ?? '공부 구분'}
      className={`inline-flex rounded-full bg-blue-soft p-0.5 ${className}`}
    >
      {SCOPE_OPTIONS.map((option) => {
        const active = value === option.scope
        const activeClass = option.scope === 'homework' ? 'bg-[#6D3BD6] text-white shadow-soft' : 'bg-navy text-white shadow-soft'
        return (
          <button
            key={option.scope}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.scope)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold transition ${
              active ? activeClass : 'text-navy/50 hover:text-navy/70'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function LoadingBlock({ label = '불러오는 중…' }: { label?: string }): JSX.Element {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-navy/45">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-navy/20 border-t-navy" />
      {label}
    </div>
  )
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-red-50 px-3 py-2 text-[12px] text-red-500">
      <span className="break-words">{message}</span>
      {onRetry ? (
        <button type="button" className="shrink-0 font-bold underline" onClick={onRetry}>
          다시 시도
        </button>
      ) : null}
    </div>
  )
}

export function EmptyBlock({ message }: { message: string }): JSX.Element {
  return <div className="rounded-2xl bg-blue-soft/70 px-3 py-6 text-center text-[13px] text-navy/40">{message}</div>
}

export function CodeBadge({ duplicated }: { duplicated: boolean }): JSX.Element | null {
  if (!duplicated) return null
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">동일코드</span>
  )
}
