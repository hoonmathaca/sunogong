import { formatMinutes, formatDateShort } from '../lib/time'

export interface BarItem {
  key: string
  label: string
  sublabel?: string
  value: number
}

export function HorizontalBars({
  items,
  format,
  barClass = 'bg-blue-brand',
  emptyText = '표시할 기록이 없어요',
}: {
  items: BarItem[]
  format: (value: number) => string
  barClass?: string
  emptyText?: string
}): JSX.Element {
  if (items.length === 0) {
    return <div className="rounded-2xl bg-blue-soft/70 px-3 py-6 text-center text-[13px] text-navy/40">{emptyText}</div>
  }
  const max = Math.max(1, ...items.map((item) => item.value))

  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2.5">
          <span className="w-[76px] shrink-0 truncate text-[12px] font-bold text-navy" title={item.label}>
            {item.label}
          </span>
          <span className="h-4 flex-1 overflow-hidden rounded-full bg-blue-soft">
            <span
              className={`block h-full rounded-full ${barClass}`}
              style={{ width: `${Math.max(2, Math.round((item.value / max) * 100))}%` }}
            />
          </span>
          <span className="w-16 shrink-0 text-right text-[11px] font-semibold tabular text-navy/70">{format(item.value)}</span>
          {item.sublabel ? (
            <span className="w-9 shrink-0 text-right text-[10px] tabular text-navy/35">{item.sublabel}</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export interface LinePoint {
  date: string
  value: number
  problems?: number
}

/** 한 학생의 한 달 추이 라인그래프 */
export function TrendLineChart({
  points,
  metric,
}: {
  points: LinePoint[]
  metric: 'minutes' | 'problems'
}): JSX.Element {
  const width = 640
  const height = 240
  const padding = { top: 18, right: 14, bottom: 28, left: 38 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom
  const values = points.map((point) => point.value)
  const maxValue = Math.max(10, ...values)
  const stepX = points.length > 1 ? innerW / (points.length - 1) : innerW

  const coords = points.map((point, index) => {
    const x = padding.left + index * stepX
    const y = padding.top + innerH - (point.value / maxValue) * innerH
    return { x, y, point }
  })

  const line = coords.map((coord) => `${coord.x.toFixed(1)},${coord.y.toFixed(1)}`).join(' ')
  const area = coords.length
    ? `${padding.left},${padding.top + innerH} ${line} ${(padding.left + innerW).toFixed(1)},${padding.top + innerH}`
    : ''

  const format = (value: number) => (metric === 'minutes' ? formatMinutes(value) : `${value}개`)
  const ticks = [0, 0.5, 1].map((ratio) => Math.round(maxValue * ratio))
  const labelEvery = Math.max(1, Math.ceil(points.length / 7))

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="공부 추이 그래프">
        <defs>
          <linearGradient id="sunogong-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1D4A9B" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#1D4A9B" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => {
          const y = padding.top + innerH - (tick / maxValue) * innerH
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#D8E3F8" strokeWidth={1} />
              <text x={padding.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#8FA3C8">
                {tick}
              </text>
            </g>
          )
        })}

        {area ? <polygon points={area} fill="url(#sunogong-area)" /> : null}
        {coords.length > 1 ? (
          <polyline points={line} fill="none" stroke="#1D4A9B" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}

        {coords.map((coord, index) => (
          <g key={coord.point.date}>
            {coord.point.value > 0 ? (
              <circle cx={coord.x} cy={coord.y} r={3.2} fill="#12296B">
                <title>
                  {formatDateShort(coord.point.date)} · {format(coord.point.value)}
                </title>
              </circle>
            ) : null}
            {index % labelEvery === 0 || index === coords.length - 1 ? (
              <text x={coord.x} y={height - 8} textAnchor="middle" fontSize={9} fill="#8FA3C8">
                {formatDateShort(coord.point.date)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  )
}
