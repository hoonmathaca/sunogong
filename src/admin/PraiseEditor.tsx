import { HOMEWORK_COMMENT_MAX, HOMEWORK_PRAISE_CHIPS, toggleChip } from '../lib/homeworkBoard'

/**
 * 숙제 승인 때 남기는 「선생님 칭찬 한마디」 입력칸.
 * · 칩을 누르면 입력칸에 그 문구가 들어가고, 다시 누르면 빠진다 (직접 적은 글과 섞어도 된다).
 * · 비워 두면 한마디 없이 예전처럼 1탭 바로 승인된다.
 * · 모두 반려할 때는 칭찬을 남기지 않으므로 칸을 잠근다.
 */
export function PraiseEditor({
  value,
  onChange,
  approved = true,
}: {
  value: string
  onChange: (next: string) => void
  /** 하나라도 승인하는지 (false 면 모두 반려라 칸을 잠근다) */
  approved?: boolean
}): JSX.Element {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-bold text-navy/70">
          선생님 칭찬 한마디 <span className="font-semibold text-navy/35">(선택 · 학생에게 보여요)</span>
        </p>
        <span className="text-[10.5px] font-semibold text-navy/35 tabular">
          {value.length}/{HOMEWORK_COMMENT_MAX}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {HOMEWORK_PRAISE_CHIPS.map((chip) => {
          const picked = value.includes(chip)
          return (
            <button
              key={chip}
              type="button"
              aria-pressed={picked}
              disabled={!approved}
              onClick={() => onChange(toggleChip(value, chip, HOMEWORK_COMMENT_MAX))}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-35 ${
                picked
                  ? 'bg-[#1F8A55] text-white'
                  : 'border border-[#1F8A55]/25 bg-[#F2FCF7] text-[#177A4A]'
              }`}
            >
              {chip}
            </button>
          )
        })}
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, HOMEWORK_COMMENT_MAX))}
        rows={2}
        disabled={!approved}
        placeholder="예: 풀이가 꼼꼼해요! 다음에도 이렇게 해봐요."
        className="mt-1.5 w-full resize-none rounded-xl border border-blue-line px-3 py-2 text-[12px] text-navy focus:outline-none focus:ring-2 focus:ring-[#1F8A55]/25 disabled:bg-blue-soft/40 disabled:text-navy/40"
      />
      <p className="mt-1 text-[10.5px] leading-snug text-navy/40">
        {approved
          ? '비워 두면 한마디 없이 예전처럼 승인돼요'
          : '모두 반려하면 칭찬 한마디는 저장되지 않아요'}
      </p>
    </div>
  )
}
