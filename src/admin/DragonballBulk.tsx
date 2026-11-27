import { useState } from 'react'
import { Dragonball } from '../components/KintounCloud'
import type { SessionKind } from '../lib/kinds'
import { DRAGONBALL_MAX_AMOUNT, normalizeGrantAmount } from '../lib/kintounBoard'
import { bulkConfirmText, bulkSentText, sendDragonballs } from '../lib/dragonballSend'

interface DragonballBulkProps {
  /** 그날(또는 오늘) 학원공부로 기록한 학생 */
  academyIds: string[]
  /** 그날(또는 오늘) 숙제공부로 기록한 학생 */
  homeworkIds: string[]
  amount: number
  onAmountChange: (next: number) => void
  /** 지급 이력 메모에 남길 날짜 (없으면 오늘) */
  date?: string | null
  /** 지급에 성공하면 부모가 목록·학생을 다시 읽는다 */
  onSent: () => void
  disabled?: boolean
}

/**
 * 학원공부 일괄 · 숙제공부 일괄 드래곤볼 쏘기 (2026-11-28).
 * 일괄은 한 번 더 확인하고(실수로 눌러도 취소), 한 학생에게는 그 줄에서 바로 쏜다.
 */
export function DragonballBulk({
  academyIds,
  homeworkIds,
  amount,
  onAmountChange,
  date,
  onSent,
  disabled = false,
}: DragonballBulkProps): JSX.Element {
  const [confirm, setConfirm] = useState<SessionKind | null>(null)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const idsOf = (kind: SessionKind) => (kind === 'academy' ? academyIds : homeworkIds)

  const send = async (kind: SessionKind) => {
    const ids = idsOf(kind)
    if (ids.length === 0 || sending) return
    setSending(true)
    setMessage(null)
    setError(null)
    const res = await sendDragonballs(ids, normalizeGrantAmount(amount), { kind, date })
    setSending(false)
    setConfirm(null)
    if (res.ok) {
      setMessage(bulkSentText(kind, res.data.granted, res.data.amount))
      onSent()
    } else {
      setError(res.error)
    }
  }

  const busy = disabled || sending

  return (
    <div className="rounded-2xl border border-[#F3C978] bg-gradient-to-br from-[#FFF8E8] to-[#FFE7B8] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11.5px] font-bold text-[#7A4A00]">
          한 학생에게
          <span className="ml-1.5 inline-flex items-center gap-1 align-middle">
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-[14px] font-extrabold text-[#7A4A00]"
              onClick={() => onAmountChange(Math.max(1, normalizeGrantAmount(amount) - 1))}
              aria-label="1개 줄이기"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={DRAGONBALL_MAX_AMOUNT}
              value={amount}
              onChange={(event) => onAmountChange(normalizeGrantAmount(event.target.value))}
              className="w-12 rounded-xl border border-[#E8C57E] bg-white px-2 py-1 text-center text-[14px] font-extrabold text-[#7A4A00] tabular focus:outline-none focus:ring-2 focus:ring-[#F7A93B]/40"
            />
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-[14px] font-extrabold text-[#7A4A00]"
              onClick={() =>
                onAmountChange(Math.min(DRAGONBALL_MAX_AMOUNT, normalizeGrantAmount(amount) + 1))
              }
              aria-label="1개 늘리기"
            >
              +
            </button>
            <span className="ml-0.5 text-[12px]">개</span>
          </span>
        </label>
        <span className="text-[10.5px] font-semibold text-[#A97516]">🎲 1~7성구 랜덤</span>
      </div>

      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy || academyIds.length === 0}
          onClick={() => {
            setConfirm('academy')
            setMessage(null)
            setError(null)
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#1D4A9B] px-3 py-2.5 text-[12px] font-extrabold text-white shadow-soft transition active:scale-[0.98] disabled:opacity-35"
        >
          <Dragonball size="sm" />
          🏫 학원공부 일괄 {academyIds.length}명
        </button>
        <button
          type="button"
          disabled={busy || homeworkIds.length === 0}
          onClick={() => {
            setConfirm('homework')
            setMessage(null)
            setError(null)
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#D9382F] px-3 py-2.5 text-[12px] font-extrabold text-white shadow-soft transition active:scale-[0.98] disabled:opacity-35"
        >
          <Dragonball size="sm" />
          🏠 숙제공부 일괄 {homeworkIds.length}명
        </button>
      </div>

      {confirm ? (
        <div className="mt-2 rounded-xl bg-white/95 px-3 py-2">
          <p className="text-[11.5px] font-bold text-[#7A4A00]">
            {bulkConfirmText(confirm, idsOf(confirm).length, normalizeGrantAmount(amount))}
          </p>
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button
              type="button"
              className="rounded-lg px-2.5 py-1 text-[11px] font-bold text-navy/50 hover:bg-blue-soft"
              onClick={() => setConfirm(null)}
              disabled={sending}
            >
              취소
            </button>
            <button
              type="button"
              className="rounded-lg bg-[#F08C00] px-2.5 py-1 text-[11px] font-extrabold text-white disabled:opacity-50"
              onClick={() => void send(confirm)}
              disabled={sending}
            >
              {sending ? '쏘는 중…' : '쏘기'}
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="mt-2 rounded-xl bg-white/85 px-3 py-2 text-[11.5px] font-bold text-[#7A4A00]">{message}</p>
      ) : null}
      {error ? <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[11.5px] font-bold text-red-500">{error}</p> : null}
    </div>
  )
}
