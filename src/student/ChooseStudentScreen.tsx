import { BrandFooter, Mascot } from '../components/Brand'
import { Spinner } from '../components/Keypad'
import type { Student } from '../lib/types'

interface ChooseStudentScreenProps {
  code: string
  candidates: Student[]
  busy: boolean
  onSelect: (student: Student) => void
  onBack: () => void
}

/** 같은 4자리 코드를 쓰는 학생이 여럿일 때 */
export function ChooseStudentScreen({ code, candidates, busy, onSelect, onBack }: ChooseStudentScreenProps): JSX.Element {
  return (
    <div className="screen bg-white">
      <div className="flex-1 px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-2.5">
          <Mascot variant="full" className="h-11 w-11 shrink-0" />
          <div>
            <h1 className="font-round text-[24px] font-extrabold leading-none text-navy">누구세요?</h1>
            <p className="mt-1 text-[12px] font-semibold text-navy/50">코드 {code}</p>
          </div>
        </header>

        <p className="mt-4 text-[14px] text-navy/60">같은 코드를 쓰는 친구가 있어요. 이름을 눌러주세요.</p>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {candidates.map((student) => (
            <button
              key={student.id}
              type="button"
              disabled={busy}
              onClick={() => onSelect(student)}
              className="flex flex-col items-start gap-1 rounded-2xl border-2 border-blue-line bg-white px-4 py-3 text-left transition active:scale-[0.98] active:border-navy disabled:opacity-50"
            >
              <span className="text-lg font-bold text-navy">{student.name}</span>
              <span className="text-[11px] font-semibold text-navy/45">{student.grade}</span>
            </button>
          ))}
        </div>

        <button type="button" onClick={onBack} className="btn-ghost mt-4 px-0 text-[13px]">
          ← 코드 다시 입력
        </button>

        {busy ? (
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-navy/50">
            <Spinner className="h-4 w-4 border-navy/20 border-t-navy" />
            확인 중…
          </div>
        ) : null}
      </div>
      <BrandFooter />
    </div>
  )
}
