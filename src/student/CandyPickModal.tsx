/**
 * 사탕교환권으로 바꿀 성구 고르기 — 학생이 직접 2개를 고른다.
 *
 * · 1~7성구 중 가지고 있는 성구를 누르면 한 개씩 골라진다.
 * · 같은 성구를 두 번 누르면 그 성구 2개(예: 3성구 2개)도 고를 수 있다.
 * · 골라 둔 칸(위의 두 칸)을 누르면 그 하나만 빠진다.
 * · 2개를 다 고르면 '사탕교환권으로 바꾸기' 가 열린다.
 */
import { Dragonball } from '../components/KintounCloud'
import { Modal } from '../components/Modal'
import { Spinner } from '../components/Keypad'
import {
  CANDY_TICKET_COST,
  candyPickCount,
  candyPickLeft,
  candyPickStatusText,
  candyPickText,
  canExchangeCandyPick,
  canPickCandyStar,
  dragonballDex,
  normalizeCandyPick,
  starName,
} from '../lib/kintounBoard'

interface CandyPickModalProps {
  open: boolean
  /** 성구별 보유 개수 맵 — {"1":0,...,"7":0} */
  rawStars: Record<string, number>
  /** 지금까지 고른 성구 (고른 차례대로, 1~7) */
  selected: number[]
  busy?: boolean
  error?: string | null
  onPick: (star: number) => void
  onUnpick: (index: number) => void
  onClear: () => void
  onClose: () => void
  onSubmit: () => void
}

export function CandyPickModal({
  open,
  rawStars,
  selected,
  busy = false,
  error = null,
  onPick,
  onUnpick,
  onClear,
  onClose,
  onSubmit,
}: CandyPickModalProps): JSX.Element {
  const picks = normalizeCandyPick(selected)
  const dex = dragonballDex(rawStars)
  const ready = canExchangeCandyPick(rawStars, picks)

  return (
    <Modal
      open={open}
      title="사탕교환권으로 바꾸기"
      description={
        <>
          쓸 <b>성구 2개</b>를 골라 주세요. 같은 성구 2개도 괜찮아요.
        </>
      }
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="btn-outline px-4" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button type="button" className="btn-navy px-4" onClick={onSubmit} disabled={!ready || busy}>
            {busy ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : '사탕교환권으로 바꾸기'}
          </button>
        </>
      }
    >
      {/* 고른 두 칸 — 누르면 그 하나만 빠진다 */}
      <div className="flex items-center gap-1.5">
        {Array.from({ length: CANDY_TICKET_COST }).map((_, slot) => {
          const star = picks[slot]
          const chosen = typeof star === 'number'
          return chosen ? (
            <button
              key={slot}
              type="button"
              onClick={() => onUnpick(slot)}
              disabled={busy}
              aria-label={`${starName(star)} 빼기`}
              className="flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#FFF0F5] px-2 py-1 ring-1 ring-[#F5B9CE] transition active:scale-[0.98] disabled:opacity-50"
            >
              <Dragonball size="md" stars={star} />
              <span className="text-[12px] font-extrabold text-[#B0265B]">{starName(star)}</span>
              <span aria-hidden="true" className="text-[11px] font-bold text-[#B0265B]/60">
                ✕
              </span>
            </button>
          ) : (
            <span
              key={slot}
              className="flex min-h-[46px] flex-1 items-center justify-center rounded-2xl border border-dashed border-[#F5B9CE] bg-white px-2 py-1 text-[11.5px] font-bold text-[#B0265B]/45"
            >
              {slot + 1}번째 성구
            </span>
          )
        })}
      </div>

      <p className="mt-1.5 flex items-center justify-between gap-2 text-[11px] font-bold">
        <span className={ready ? 'text-[#B0265B]' : 'text-navy/45'}>{candyPickStatusText(picks)}</span>
        {picks.length > 0 ? (
          <button type="button" onClick={onClear} disabled={busy} className="font-bold text-navy/40 underline">
            다시 고르기
          </button>
        ) : null}
      </p>

      {/* 1~7성구 — 가진 성구를 누를 때마다 하나씩 */}
      <ul className="mt-2 grid grid-cols-7 gap-1">
        {dex.map((slot) => {
          const picked = candyPickCount(picks, slot.stars)
          const left = candyPickLeft(rawStars, picks, slot.stars)
          const selectable = !busy && canPickCandyStar(rawStars, picks, slot.stars)
          return (
            <li key={slot.stars}>
              <button
                type="button"
                onClick={() => onPick(slot.stars)}
                disabled={!selectable}
                aria-label={`${starName(slot.stars)} 고르기 (${left}개 남음)`}
                className={`flex w-full flex-col items-center rounded-2xl px-0.5 pb-1 pt-1.5 transition active:scale-[0.97] disabled:opacity-40 ${
                  picked > 0
                    ? 'bg-[#FFF0F5] ring-2 ring-[#E9578A]'
                    : slot.owned
                      ? 'bg-white shadow-sm ring-1 ring-[#F3C978]'
                      : 'bg-white/40 ring-1 ring-white/60'
                }`}
              >
                <Dragonball size="lg" stars={slot.stars} filled={slot.owned} />
                <span className={`mt-0.5 text-[9px] font-extrabold ${slot.owned ? 'text-[#7A4A00]' : 'text-[#A97516]/60'}`}>
                  {`${slot.stars}성`}
                </span>
                <span
                  className={`mt-0.5 rounded-full px-1 text-[9px] font-extrabold tabular ${
                    picked > 0
                      ? 'bg-[#E9578A] text-white'
                      : slot.owned
                        ? 'bg-[#F08C00] text-white'
                        : 'bg-white/60 text-[#A97516]/60'
                  }`}
                >
                  {picked > 0 ? `${picked}개 고름` : slot.owned ? `×${slot.count}` : '–'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <p className="mt-2 rounded-xl bg-[#FFF8E8] px-2.5 py-1.5 text-center text-[11px] font-bold text-[#8A5400]">
        {candyPickText(picks)}
      </p>
      {error ? <p className="mt-1.5 text-center text-[11px] font-bold text-red-500">{error}</p> : null}
      <p className="mt-2 text-[10.5px] font-semibold text-navy/40">
        바꾸면 고른 성구 2개가 사라지고 사탕교환권 1장이 생겨요. 되돌릴 수 없어요.
      </p>
    </Modal>
  )
}
