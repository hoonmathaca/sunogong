import type { ReactNode } from 'react'
import { GRADE_FILTERS, type GradeFilter } from '../lib/grades'

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

export function StatCard({
  label,
  value,
  sub,
  tone = 'white',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'white' | 'navy'
}): JSX.Element {
  const navy = tone === 'navy'
  return (
    <div className={`rounded-2xl px-4 py-3 ${navy ? 'bg-navy text-white' : 'border border-blue-line bg-white text-navy'}`}>
      <p className={`text-[11px] font-semibold ${navy ? 'text-white/60' : 'text-navy/45'}`}>{label}</p>
      <p className="mt-1 text-xl font-extrabold tabular">{value}</p>
      {sub ? <p className={`mt-0.5 text-[11px] ${navy ? 'text-white/50' : 'text-navy/40'}`}>{sub}</p> : null}
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
