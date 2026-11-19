export const KST_TZ = 'Asia/Seoul'

/** 1회 최대 공부시간 (5시간 = 300분) */
export const MAX_SESSION_SECONDS = 5 * 60 * 60

/** 하트비트가 이 시간 이상 끊기면 일시정지로 처리 (서버 규칙과 동일) */
export const HEARTBEAT_TIMEOUT_MS = 30 * 1000

/** 하트비트 전송 주기 */
export const HEARTBEAT_INTERVAL_MS = 10 * 1000

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: KST_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

interface KstParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function kstParts(ms: number): KstParts {
  const parts = partsFormatter.formatToParts(new Date(ms))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  }
}

const pad = (n: number, len = 2) => String(Math.max(0, Math.floor(n))).padStart(len, '0')

/** 한국 시간 기준 'YYYY-MM-DD' */
export function kstDateString(ms: number = Date.now()): string {
  const p = kstParts(ms)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** 한국 시간 기준 'HH:MM' */
export function kstTimeString(ms: number = Date.now()): string {
  const p = kstParts(ms)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

export function todayKst(): string {
  return kstDateString()
}

export function isDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** 'YYYY-MM-DD' 를 UTC 정오 기준 밀리초로 (한국은 서머타임이 없어 날짜 계산이 안전) */
function dateToUtcMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0)
}

export function addDays(dateStr: string, days: number): string {
  const ms = dateToUtcMs(dateStr) + days * 86400_000
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function diffDays(from: string, to: string): number {
  return Math.round((dateToUtcMs(to) - dateToUtcMs(from)) / 86400_000)
}

/** 0=일, 1=월 ... 6=토 */
export function weekdayOf(dateStr: string): number {
  return new Date(dateToUtcMs(dateStr)).getUTCDay()
}

export function isWeekend(dateStr: string): boolean {
  const w = weekdayOf(dateStr)
  return w === 0 || w === 6
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']

export function formatDateKo(dateStr: string): string {
  if (!isDateString(dateStr)) return dateStr
  const [, m, d] = dateStr.split('-')
  return `${Number(m)}월 ${Number(d)}일 (${WEEKDAY_KO[weekdayOf(dateStr)]})`
}

export function formatDateShort(dateStr: string): string {
  if (!isDateString(dateStr)) return dateStr
  const [, m, d] = dateStr.split('-')
  return `${Number(m)}/${Number(d)}`
}

/** 시작~종료(포함) 날짜 배열 */
export function rangeDates(start: string, end: string): string[] {
  const out: string[] = []
  if (!isDateString(start) || !isDateString(end)) return out
  const total = diffDays(start, end)
  if (total < 0) return out
  const limit = Math.min(total, 400)
  for (let i = 0; i <= limit; i += 1) out.push(addDays(start, i))
  return out
}

/** 최근 n일 (endDate 포함) */
export function lastNDays(n: number, endDate: string = todayKst()): string[] {
  return rangeDates(addDays(endDate, -(n - 1)), endDate)
}

/** 'YYYY-MM' → 그 달의 시작/끝 */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  const start = `${y}-${pad(m)}-01`
  const endDate = new Date(Date.UTC(y, m, 0))
  const end = `${endDate.getUTCFullYear()}-${pad(endDate.getUTCMonth() + 1)}-${pad(endDate.getUTCDate())}`
  return { start, end }
}

export function currentMonthKst(): string {
  const p = kstParts(Date.now())
  return `${p.year}-${pad(p.month)}`
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

/** 분 → '1시간 30분' (0분은 '0분') */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes || 0))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest}분`
  if (rest === 0) return `${h}시간`
  return `${h}시간 ${rest}분`
}

/** 초 → 'HH:MM:SS' */
export function formatHMS(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0))
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

/** 초 → '1시간 5분' (결과 화면용, 1분 미만은 '0분') */
export function formatSecondsKorean(seconds: number): string {
  return formatMinutes(Math.floor(Math.max(0, seconds) / 60))
}

/** 이번 주(월요일 시작) 범위 */
export function weekRange(endDate: string = todayKst()): { start: string; end: string } {
  const w = weekdayOf(endDate) // 0=일
  const offset = w === 0 ? 6 : w - 1 // 월요일부터
  return { start: addDays(endDate, -offset), end: endDate }
}

/**
 * 그 날 23:59 KST 의 epoch ms.
 * 한국은 UTC+9 고정이라 23:59 KST = 같은 날 14:59 UTC.
 */
export function kstDayEndMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1, 14, 59, 0)
}

/** 밀리초 → Date.parse 안전 처리 */
export function parseMs(value: string | null | undefined): number {
  if (!value) return NaN
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : NaN
}
