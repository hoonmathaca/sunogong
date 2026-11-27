import { buildMonthGrid, monthLabel } from '../lib/calendar'
import { KIND_BAR_CLASS, KIND_LABEL, KIND_TEXT_CLASS } from '../lib/kinds'
import {
  academyTimeText,
  attendanceLine,
  canOpenMonth,
  dayDots,
  dayHasContent,
  dayTotalMinutes,
  homeworkTimeText,
  type DayView,
} from '../lib/studentCalendar'
import { formatDateKo, formatMinutes, shiftMonth, weekdayOf } from '../lib/time'
import { Spinner } from '../components/Keypad'

/**
 * 학생 「공부 기록」 월별 달력 + 고른 날 상세 (2026-11-28).
 * 시안: handoffs/🎨-선오공-학생-공부기록-달력-시안-및-db-확인/design/calendar-preview-1.html
 *
 * · 달력 점 — 🏫 학원 공부 #1D4A9B(파랑) · 🏠 숙제 공부 #E0453E(빨강)
 * · 날짜를 누르면 그날 등·하원 시각(훈출 출결)과 학원·숙제 시간·푼 문제 수가 아래에 나온다
 * · 하원을 안 찍어 자동 마감된 날은 '하원 미확인(자동 마감)' 으로 알려 준다
 */
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

interface StudentStudyCalendarProps {
  /** 'YYYY-MM' */
  month: string
  /** 오늘 'YYYY-MM-DD' (한국 시간) */
  today: string
  /** 고른 날 'YYYY-MM-DD' (없으면 안내 문구) */
  selectedDate: string | null
  /** 날짜별 값 — DB 함수 값이 있으면 등·하원까지, 없으면 공부 기록만 */
  views: Map<string, DayView>
  /** 그 달을 불러오는 중 */
  loading?: boolean
  onSelect: (date: string) => void
  /** 달 이동 (delta = -1 이전 달, +1 다음 달) */
  onMonthChange: (month: string) => void
}

export function StudentStudyCalendar({
  month,
  today,
  selectedDate,
  views,
  loading = false,
  onSelect,
  onMonthChange,
}: StudentStudyCalendarProps): JSX.Element {
  const cells = buildMonthGrid(month)
  const selected = selectedDate ? views.get(selectedDate) : undefined
  const nextMonth = shiftMonth(month, 1)
  const canGoNext = canOpenMonth(nextMonth, today)
  const content = dayHasContent(selected)
  const total = dayTotalMinutes(selected)
  const academyProblems = selected?.academyProblems ?? 0
  const homeworkProblems = selected?.homeworkProblems ?? 0
  const academyRow = (selected?.academyMinutes ?? 0) > 0 || academyProblems > 0 || Boolean(selected?.attendance)
  const homeworkRow = (selected?.homeworkMinutes ?? 0) > 0 || homeworkProblems > 0

  return (
    <div className="mt-3.5">
      {/* 달 이동 */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="이전 달"
          onClick={() => onMonthChange(shiftMonth(month, -1))}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-soft text-[13px] font-extrabold leading-none text-navy/55 transition active:scale-95"
        >
          ‹
        </button>
        <p className="text-[13px] font-extrabold tracking-tight text-navy tabular">{monthLabel(month)}</p>
        <button
          type="button"
          aria-label="다음 달"
          disabled={!canGoNext}
          onClick={() => onMonthChange(nextMonth)}
          className={`flex h-6 w-6 items-center justify-center rounded-full bg-blue-soft text-[13px] font-extrabold leading-none text-navy/55 transition active:scale-95 ${
            canGoNext ? '' : 'opacity-30'
          }`}
        >
          ›
        </button>
      </div>

      {/* 요일 */}
      <div className="mt-2 grid grid-cols-7" aria-hidden="true">
        {WEEKDAY.map((label, index) => (
          <span
            key={label}
            className={`text-center text-[10px] font-bold ${
              index === 0 ? 'text-[#E0453E]/65' : index === 6 ? 'text-[#1D4A9B]/60' : 'text-navy/40'
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      {/* 날짜 칸 */}
      <div className="grid grid-cols-7" role="grid" aria-label={`${monthLabel(month)} 공부 기록 달력`}>
        {cells.map((cell) => {
          const view = views.get(cell.date)
          const dots = dayDots(view)
          const future = cell.date > today
          const isToday = cell.date === today
          const isSelected = cell.date === selectedDate
          const clickable = cell.inMonth && !future
          const weekend = weekdayOf(cell.date)
          return (
            <button
              key={cell.date}
              type="button"
              role="gridcell"
              disabled={!clickable}
              aria-pressed={isSelected}
              aria-label={`${formatDateKo(cell.date)}${isToday ? ' 오늘' : ''}${
                dots.academy || dots.homework
                  ? ` · ${dots.academy ? '학원 공부' : ''}${dots.academy && dots.homework ? ' · ' : ''}${
                      dots.homework ? '숙제 공부' : ''
                    }`
                  : ''
              }`}
              onClick={() => onSelect(cell.date)}
              className="flex h-[33px] flex-col items-center justify-start pt-px"
            >
              <span
                className={`flex h-[25px] w-[25px] items-center justify-center rounded-full text-[12px] font-bold tabular ${
                  isSelected
                    ? 'bg-navy text-white'
                    : !cell.inMonth || future
                      ? 'text-navy/20'
                      : weekend === 0
                        ? 'text-[#F87171]'
                        : 'text-navy'
                } ${isToday && !isSelected ? 'shadow-[inset_0_0_0_1.5px_rgba(29,74,155,0.55)]' : ''}`}
              >
                {cell.day}
              </span>
              <span className="mt-0 flex h-[5px] items-center gap-[3px]">
                {dots.academy ? <i className={`block h-[5px] w-[5px] rounded-full ${KIND_BAR_CLASS.academy}`} /> : null}
                {dots.homework ? <i className={`block h-[5px] w-[5px] rounded-full ${KIND_BAR_CLASS.homework}`} /> : null}
              </span>
            </button>
          )
        })}
      </div>

      {/* 범례 */}
      <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold">
        <span className={`h-2 w-2 rounded-full ${KIND_BAR_CLASS.academy}`} />
        <span className={KIND_TEXT_CLASS.academy}>{KIND_LABEL.academy}</span>
        <span className="w-2" />
        <span className={`h-2 w-2 rounded-full ${KIND_BAR_CLASS.homework}`} />
        <span className={KIND_TEXT_CLASS.homework}>{KIND_LABEL.homework}</span>
      </div>

      {/* 고른 날 상세 */}
      <div className="mt-3 rounded-2xl border border-[#E3ECFB] bg-[#F8FAFF] px-3.5 py-3">
        {loading ? (
          <div className="flex h-14 items-center justify-center">
            <Spinner className="h-5 w-5 border-navy/20 border-t-navy" />
          </div>
        ) : selectedDate === null ? (
          <p className="text-[11.5px] font-semibold leading-snug text-navy/45">
            달력에서 날짜를 누르면 그날 등·하원과 공부 기록이 보여요.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13.5px] font-extrabold tracking-tight text-navy tabular">
                {formatDateKo(selectedDate)}
              </p>
              <span className="shrink-0 rounded-full border border-[#E3ECFB] bg-white px-2 py-0.5 text-[10.5px] font-bold text-navy/55 tabular">
                {total > 0 ? `총 ${formatMinutes(total)}` : content ? '공부 기록 없음' : '기록 없음'}
              </span>
            </div>

            {content ? (
              <div className="mt-2 border-t border-[#E3ECFB]">
                {/* 학원 공부 — 등·하원은 훈출 출결 */}
                <div className="flex gap-[7px] py-2">
                  <span className="w-5 shrink-0 text-[14px] leading-tight" aria-hidden="true">
                    🏫
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-bold text-navy/55">{KIND_LABEL.academy}</span>
                      <span className={`text-right text-[13px] font-extrabold tracking-tight tabular ${KIND_TEXT_CLASS.academy}`}>
                        {academyTimeText(selected)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] font-bold leading-snug text-navy/60 tabular">
                      {attendanceLine(selected?.attendance)}
                    </p>
                    {academyRow && academyProblems > 0 ? (
                      <p className="text-[11.5px] font-bold text-navy/60 tabular">
                        푼 문제 <strong className="font-extrabold text-navy">{`${academyProblems}개`}</strong>
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* 숙제 공부 — 시간과 푼 문제 수 */}
                <div className="flex gap-[7px] border-t border-dashed border-[#E3ECFB] py-2">
                  <span className="w-5 shrink-0 text-[14px] leading-tight" aria-hidden="true">
                    🏠
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-bold text-navy/55">{KIND_LABEL.homework}</span>
                      <span
                        className={`text-right text-[13px] font-extrabold tracking-tight tabular ${
                          homeworkRow ? KIND_TEXT_CLASS.homework : 'text-navy/35'
                        }`}
                      >
                        {homeworkTimeText(selected)}
                      </span>
                    </div>
                    {homeworkRow ? (
                      <p className="mt-0.5 text-[11.5px] font-bold text-navy/60 tabular">
                        푼 문제 <strong className="font-extrabold text-navy">{`${homeworkProblems}개`}</strong>
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-2 border-t border-[#E3ECFB] pt-2 text-[11.5px] font-semibold leading-snug text-navy/45">
                이 날은 등·하원도 공부 기록도 없어요.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}