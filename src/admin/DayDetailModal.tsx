import { useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { DragonballBulk } from './DragonballBulk'
import { dayBreakdown, EMPTY_DAY_SUM, addLogToDaySum, type DaySum } from '../lib/calendar'
import { individualSentText, sendDragonballs } from '../lib/dragonballSend'
import type { SessionKind } from '../lib/kinds'
import { normalizeGrantAmount } from '../lib/kintounBoard'
import { splitLog, type LogIndex } from '../lib/stats'
import { formatDateKo, formatMinutes } from '../lib/time'
import type { Student } from '../lib/types'

interface DayDetailModalProps {
  open: boolean
  /** 그 날짜 (YYYY-MM-DD) */
  date: string | null
  /** 학년 필터가 적용된 학생 목록 */
  students: Student[]
  /** 그 달 기록 인덱스 */
  index: LogIndex
  onClose: () => void
  /** 드래곤볼을 쏘면 학생 목록(보유 개수)·달력을 다시 읽는다 */
  onSent: () => void
}

/**
 * 달력에서 날짜를 눌렀을 때 — 그날 공부한/안 한 학생과
 * 학원공부 일괄 · 숙제공부 일괄 드래곤볼 쏘기 (2026-11-28).
 */
export function DayDetailModal({ open, date, students, index, onClose, onSent }: DayDetailModalProps): JSX.Element | null {
  const [amount, setAmount] = useState(1)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sentMessage, setSentMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const breakdown = useMemo(
    () => (date ? dayBreakdown(students, index, date) : { academy: [], homework: [], missing: [] }),
    [students, index, date],
  )

  const sum: DaySum = useMemo(() => {
    if (!date) return { ...EMPTY_DAY_SUM }
    let total: DaySum = { ...EMPTY_DAY_SUM }
    for (const student of students) {
      const log = index.get(student.id)?.get(date)
      if (log) total = addLogToDaySum(total, log)
    }
    return total
  }, [students, index, date])

  if (!open || !date) return null

  const sendOne = async (student: Student, kind: SessionKind) => {
    if (sendingId) return
    setSendingId(`${student.id}:${kind}`)
    setSentMessage(null)
    setError(null)
    const res = await sendDragonballs([student.id], normalizeGrantAmount(amount), {
      kind,
      date,
      individualName: student.name,
    })
    setSendingId(null)
    if (res.ok) {
      setSentMessage(`${student.name} · ${individualSentText(res.data.amount, res.data.stars)}`)
      onSent()
    } else {
      setError(res.error)
    }
  }

  const rowsOf = (kind: SessionKind) => {
    const list = kind === 'academy' ? breakdown.academy : breakdown.homework
    return list.map((student) => {
      const split = splitLog(index.get(student.id)?.get(date) ?? null)
      const minutes = kind === 'academy' ? split.academyMinutes : split.homeworkMinutes
      const problems = kind === 'academy' ? split.academyProblems : split.homeworkProblems
      return { student, minutes, problems }
    })
  }

  const section = (kind: SessionKind) => {
    const rows = rowsOf(kind)
    const accent = kind === 'academy' ? 'text-[#1D4A9B]' : 'text-[#D9382F]'
    const label = kind === 'academy' ? '🏫 학원 공부한 학생' : '🏠 숙제 공부한 학생'
    return (
      <div>
        <h3 className={`text-[12.5px] font-extrabold ${accent}`}>
          {label} {rows.length}명
        </h3>
        {rows.length === 0 ? (
          <p className="mt-1 rounded-xl bg-blue-soft/60 px-3 py-2.5 text-[11.5px] font-semibold text-navy/40">
            이 날은 {kind === 'academy' ? '학원' : '숙제'} 공부 기록이 없어요.
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-blue-line rounded-xl border border-blue-line">
            {rows.map(({ student, minutes, problems }) => {
              const busy = sendingId === `${student.id}:${kind}`
              const worked = minutes > 0 || problems > 0
              return (
                <li key={`${kind}-${student.id}`} className="flex items-center gap-2 px-2.5 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-bold text-navy">{student.name}</span>
                    <span className="block text-[10.5px] font-semibold text-navy/40 tabular">
                      {student.grade} · {minutes}분 · 푼 숙제 {problems}개
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={!worked || sendingId !== null}
                    onClick={() => void sendOne(student, kind)}
                    aria-label={`${student.name} ${kind === 'academy' ? '학원공부' : '숙제공부'} 드래곤볼 쏘기`}
                    className={`shrink-0 rounded-lg px-2 py-1 text-[10.5px] font-extrabold text-white transition active:scale-[0.97] disabled:opacity-30 ${
                      kind === 'academy' ? 'bg-[#1D4A9B]' : 'bg-[#D9382F]'
                    }`}
                  >
                    {busy ? '쏘는 중…' : '쏘기'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  }

  return (
    <Modal
      open={open}
      wide
      title={`${formatDateKo(date)} 공부 이력`}
      description={`${sum.students}명 기록 · 기록 없음 ${breakdown.missing.length}명`}
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-[#C7D8F7] bg-[#EEF4FF] px-3 py-2">
          <p className="text-[10.5px] font-extrabold text-[#1D4A9B]">🏫 학원 공부</p>
          <p className="text-[15px] font-extrabold text-[#1D4A9B] tabular">
            {sum.academyStudents}명 · {formatMinutes(sum.academyMinutes)}
          </p>
          <p className="text-[10.5px] font-semibold text-[#1D4A9B]/70 tabular">푼 숙제 {sum.academyProblems}개</p>
        </div>
        <div className="rounded-2xl border border-[#F7C9C5] bg-[#FFF1F0] px-3 py-2">
          <p className="text-[10.5px] font-extrabold text-[#D9382F]">🏠 숙제 공부</p>
          <p className="text-[15px] font-extrabold text-[#D9382F] tabular">
            {sum.homeworkStudents}명 · {formatMinutes(sum.homeworkMinutes)}
          </p>
          <p className="text-[10.5px] font-semibold text-[#D9382F]/70 tabular">푼 숙제 {sum.homeworkProblems}개</p>
        </div>
      </div>

      <div className="mt-3">
        <DragonballBulk
          academyIds={breakdown.academy.map((student) => student.id)}
          homeworkIds={breakdown.homework.map((student) => student.id)}
          amount={amount}
          onAmountChange={setAmount}
          date={date}
          onSent={onSent}
        />
      </div>

      {sentMessage ? (
        <p className="mt-2 rounded-xl bg-[#F0FAF0] px-3 py-2 text-[11.5px] font-bold text-[#2E6B34]">{sentMessage}</p>
      ) : null}
      {error ? <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[11.5px] font-bold text-red-500">{error}</p> : null}

      <div className="mt-4 space-y-3">
        {section('academy')}
        {section('homework')}
        <div>
          <h3 className="text-[12.5px] font-extrabold text-navy/60">기록 없는 학생 {breakdown.missing.length}명</h3>
          {breakdown.missing.length === 0 ? (
            <p className="mt-1 rounded-xl bg-blue-soft/60 px-3 py-2.5 text-[11.5px] font-semibold text-navy/40">
              모두 기록을 남겼어요.
            </p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {breakdown.missing.map((student) => (
                <span
                  key={`missing-${student.id}`}
                  className="rounded-full border border-blue-line px-2.5 py-1 text-[11px] font-semibold text-navy/60"
                >
                  {student.name}
                  <span className="ml-1 text-[9px] text-navy/35">{student.grade}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="mt-3 text-[10px] text-navy/40">
        드래곤볼은 한 개마다 1~7성구가 랜덤으로 나와요. 지난 날짜에서 쏘아도 학생에게는 지금 바로 쌓이고, 지급
        이력에 그 날짜가 메모로 남습니다.
      </p>
    </Modal>
  )
}
