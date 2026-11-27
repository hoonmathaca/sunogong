import { KIND_BAR_CLASS, KIND_TEXT_CLASS } from '../lib/kinds'
import { formatMinutes, formatDateShort } from '../lib/time'

export interface BarSegment {
  value: number
  className: string
  label?: string
}

export interface BarItem {
  key: string
  label: string
  sublabel?: string
  value: number
  /** 값을 학원/숙제처럼 여러 조각으로 나누어 쌓아 보여준다 */
  segments?: BarSegment[]
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
      {items.map((item) => {
        const segments = (item.segments ?? []).filter((segment) => segment.value > 0)
        const total = segments.reduce((sum, segment) => sum + segment.value, 0)
        const width = `${Math.max(2, Math.round((item.value / max) * 100))}%`
        return (
        <li key={item.key} className="flex items-center gap-2.5">
          <span className="w-[76px] shrink-0 truncate text-[12px] font-bold text-navy" title={item.label}>
            {item.label}
          </span>
          <span className="h-4 flex-1 overflow-hidden rounded-full bg-blue-soft">
            {segments.length > 0 && total > 0 ? (
              <span className="flex h-full overflow-hidden rounded-full" style={{ width }}>
                {segments.map((segment, index) => (
                  <span
                    key={`${item.key}-${index}`}
                    className={`block h-full ${segment.className}`}
                    style={{ width: `${(segment.value / total) * 100}%` }}
                    title={`${segment.label ?? ''} ${format(segment.value)}`}
                  />
                ))}
              </span>
            ) : (
              <span className={`block h-full rounded-full ${barClass}`} style={{ width }} />
            )}
          </span>
          <span className="w-16 shrink-0 text-right text-[11px] font-semibold tabular text-navy/70">{format(item.value)}</span>
          {item.sublabel ? (
            <span className="w-9 shrink-0 text-right text-[10px] tabular text-navy/35">{item.sublabel}</span>
          ) : null}
        </li>
        )
      })}
    </ul>
  )
}

/**
 * 학원 공부와 숙제 공부의 비율을 한 줄로 보여주는 막대.
 * 둘 다 0이면 아무것도 그리지 않는다.
 */
export function SplitBar({
  academy,
  homework,
  className = '',
  trackClass = 'bg-navy/10',
  academyClass = KIND_BAR_CLASS.academy,
  homeworkClass = KIND_BAR_CLASS.homework,
}: {
  academy: number
  homework: number
  className?: string
  trackClass?: string
  academyClass?: string
  homeworkClass?: string
}): JSX.Element | null {
  const a = Math.max(0, academy)
  const h = Math.max(0, homework)
  const total = a + h
  if (total <= 0) return null
  return (
    <span className={`flex h-1 w-full overflow-hidden rounded-full ${trackClass} ${className}`}>
      {a > 0 ? <span className={`block h-full ${academyClass}`} style={{ width: `${(a / total) * 100}%` }} /> : null}
      {h > 0 ? <span className={`block h-full ${homeworkClass}`} style={{ width: `${(h / total) * 100}%` }} /> : null}
    </span>
  )
}

/** 그래프·표에서 쓰는 학원/숙제 색 안내 */
export function KindLegend({ className = '' }: { className?: string }): JSX.Element {
  return (
    <div className={`flex flex-wrap items-center gap-3 text-[10px] font-semibold text-navy/50 ${className}`}>
      <span className={`flex items-center gap-1 ${KIND_TEXT_CLASS.academy}`}>
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${KIND_BAR_CLASS.academy}`} /> 🏫 학원 공부
      </span>
      <span className={`flex items-center gap-1 ${KIND_TEXT_CLASS.homework}`}>
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${KIND_BAR_CLASS.homework}`} /> 🏠 숙제 공부
      </span>
    </div>
  )
}

export interface LinePoint {
  date: string
  value: number
  problems?: number
}

export interface DualPoint {
  date: string
  academy: number
  homework: number
}

/** 학원(파랑)·숙제(빨강) 두 선을 함께 그리는 추이 그래프 — 학생 상세 모달 (2026-11-28) */
export function DualTrendChart({
  points,
  metric = 'minutes',
  academyColor = '#1D4A9B',
  homeworkColor = '#E0453E',
  showAcademy = true,
  showHomework = true,
}: {
  points: DualPoint[]
  metric?: 'minutes' | 'problems'
  academyColor?: string
  homeworkColor?: string
  /** 구분을 골랐을 때 한 선만 보이게 */
  showAcademy?: boolean
  showHomework?: boolean
}): JSX.Element {
  const width = 640
  const height = 240
  const padding = { top: 18, right: 14, bottom: 28, left: 38 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom
  const maxValue = Math.max(
    10,
    ...points.map((point) => Math.max(showAcademy ? point.academy : 0, showHomework ? point.homework : 0)),
  )
  const stepX = points.length > 1 ? innerW / (points.length - 1) : innerW
  const format = (value: number) => (metric === 'minutes' ? formatMinutes(value) : `${value}개`)
  const ticks = [0, 0.5, 1].map((ratio) => Math.round(maxValue * ratio))
  const labelEvery = Math.max(1, Math.ceil(points.length / 7))

  const lineOf = (pick: (point: DualPoint) => number) => {
    const coords = points.map((point, index) => {
      const x = padding.left + index * stepX
      const y = padding.top + innerH - (pick(point) / maxValue) * innerH
      return { x, y, point, value: pick(point) }
    })
    return {
      coords,
      line: coords.map((coord) => `${coord.x.toFixed(1)},${coord.y.toFixed(1)}`).join(' '),
    }
  }

  const academy = lineOf((point) => (showAcademy ? point.academy : 0))
  const homework = lineOf((point) => (showHomework ? point.homework : 0))

  return (
    <div className="w-full overflow-hidden">
      <div className="mb-1 flex flex-wrap items-center gap-3 text-[10px] font-semibold text-navy/55">
        {showAcademy ? (
          <span className="flex items-center gap-1" style={{ color: academyColor }}>
            <span className="inline-block h-[3px] w-4 rounded-full" style={{ backgroundColor: academyColor }} />
            🏫 학원 공부
          </span>
        ) : null}
        {showHomework ? (
          <span className="flex items-center gap-1" style={{ color: homeworkColor }}>
            <span className="inline-block h-[3px] w-4 rounded-full" style={{ backgroundColor: homeworkColor }} />
            🏠 숙제 공부
          </span>
        ) : null}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="학원·숙제 공부 추이 그래프">
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

        {[
          { key: 'academy', show: showAcademy, color: academyColor, data: academy },
          { key: 'homework', show: showHomework, color: homeworkColor, data: homework },
        ].map((series) =>
          series.show ? (
            <g key={series.key}>
              {series.data.coords.length > 1 ? (
                <polyline
                  points={series.data.line}
                  fill="none"
                  stroke={series.color}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  data-series={series.key}
                />
              ) : null}
              {series.data.coords.map((coord) =>
                coord.value > 0 ? (
                  <circle key={`${series.key}-${coord.point.date}`} cx={coord.x} cy={coord.y} r={3.2} fill={series.color}>
                    <title>{`${formatDateShort(coord.point.date)} · ${series.key === 'academy' ? '🏫 학원' : '🏠 숙제'} ${format(coord.value)}`}</title>
                  </circle>
                ) : null,
              )}
            </g>
          ) : null,
        )}

        {points.map((point, index) =>
          index % labelEvery === 0 || index === points.length - 1 ? (
            <text
              key={`label-${point.date}`}
              x={padding.left + index * stepX}
              y={height - 8}
              textAnchor="middle"
              fontSize={9}
              fill="#8FA3C8"
            >
              {formatDateShort(point.date)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  )
}

/** 한 학생의 한 달 추이 라인그래프 */
export function TrendLineChart({
  points,
  metric,
  accent = '#1D4A9B',
  dotColor = '#12296B',
  areaId = 'sunogong-area',
}: {
  points: LinePoint[]
  metric: 'minutes' | 'problems'
  /** 선 색 — 학원 공부는 남색, 숙제 공부는 보라색 */
  accent?: string
  dotColor?: string
  /** 한 화면에 여러 그래프를 그릴 때 그라데이션 id가 겹치지 않게 */
  areaId?: string
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
          <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.24" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
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

        {area ? <polygon points={area} fill={`url(#${areaId})`} /> : null}
        {coords.length > 1 ? (
          <polyline points={line} fill="none" stroke={accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}

        {coords.map((coord, index) => (
          <g key={coord.point.date}>
            {coord.point.value > 0 ? (
              <circle cx={coord.x} cy={coord.y} r={3.2} fill={dotColor}>
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
