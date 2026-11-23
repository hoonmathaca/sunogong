import { Modal } from '../components/Modal'
import type { AdminLiveSession } from '../lib/kintoun'
import { endProblemsText, endStudyKindNotice, endStudySummary, parseEndProblems } from '../lib/kintounBoard'

interface EndStudyModalProps {
  open: boolean
  /** 확인 중인 활성 세션 (화면에서 흐른 시간까지 더한 값) */
  row: AdminLiveSession | null
  /** 문제 수 입력칸 값 ('' 이면 0문제로 마무리) */
  problems: string
  onProblemsChange: (value: string) => void
  busy: boolean
  error: string | null
  onClose: () => void
  onConfirm: () => void
}

/**
 * 관리자 「수업 종료」 확인 창.
 * 실수로 누르지 않도록 학생 이름·지금까지의 시간을 보여 주고 문제 수를 한 번 받는다.
 * (비워 두면 0문제로 마무리)
 */
export function EndStudyModal({
  open,
  row,
  problems,
  onProblemsChange,
  busy,
  error,
  onClose,
  onConfirm,
}: EndStudyModalProps): JSX.Element | null {
  if (!row) return null
  const minutes = Math.floor(Math.max(0, row.seconds) / 60)
  const count = parseEndProblems(problems)
  const isHomework = row.kind === 'homework'

  return (
    <Modal
      open={open}
      title="수업을 마칠까요?"
      description={endStudySummary(row, problems)}
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <>
          <button type="button" className="btn-outline px-4" disabled={busy} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-2xl bg-[#C0392B] px-4 py-2.5 text-[13px] font-extrabold text-white shadow-soft transition active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? '마무리 중…' : '수업 종료'}
          </button>
        </>
      }
    >
      <div className="rounded-2xl bg-blue-soft px-4 py-3 text-center">
        <p className="text-[11.5px] font-bold text-navy/50">지금까지</p>
        <p className="mt-0.5 text-[26px] font-extrabold leading-none text-navy tabular">{minutes}분</p>
        {row.status === 'paused' ? (
          <p className="mt-1 text-[11px] font-semibold text-[#B07200]">잠깐 쉬는 중 — 쉬기 전까지의 시간이에요</p>
        ) : null}
        <p className="mt-1 text-[11px] font-semibold text-navy/45">{row.name} · {row.grade}</p>
      </div>

      <p className="mt-2 rounded-2xl bg-[#FFF6DA] px-3 py-2 text-[11.5px] font-semibold leading-snug text-[#7A5B00]">
        {endStudyKindNotice(row.kind)}
      </p>

      <label className="mt-3 block text-[12px] font-extrabold text-navy/70" htmlFor="end-study-problems">
        오늘 푼 문제 수 (선택)
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id="end-study-problems"
          type="number"
          inputMode="numeric"
          min={0}
          max={9999}
          value={problems}
          placeholder="0"
          onChange={(event) => onProblemsChange(endProblemsText(event.target.value))}
          className="w-24 rounded-xl border border-blue-line bg-white px-3 py-2 text-center text-[15px] font-extrabold text-navy tabular focus:outline-none focus:ring-2 focus:ring-blue-brand/30"
        />
        <span className="text-[12px] font-semibold text-navy/50">
          문제 · 비워 두면 <b className="text-navy/70">0문제</b>로 마무리해요
        </span>
      </div>

      {minutes < 1 ? (
        <p className="mt-2 rounded-2xl bg-[#FFF6DA] px-3 py-2 text-[11.5px] font-semibold leading-snug text-[#7A5B00]">
          1분이 안 돼서 공부 시간은 0분으로 들어가요.
          {isHomework ? ' 문제 수도 0이면 기록에 남지 않아요.' : ''}
        </p>
      ) : null}

      <p className="mt-3 text-[11.5px] font-semibold text-navy/45">
        지금까지의 시간으로 마무리하면 학생 화면은 잠시 뒤 저절로 결과 화면으로 바뀌어요.
      </p>

      {count === 0 && !isHomework ? (
        <p className="mt-1 text-[11px] font-semibold text-navy/35">문제 수는 나중에 대시보드에서 고칠 수 있어요.</p>
      ) : null}

      {error ? (
        <p className="mt-2 break-words rounded-2xl bg-red-50 px-3 py-2 text-center text-[12px] text-red-500">{error}</p>
      ) : null}
    </Modal>
  )
}
