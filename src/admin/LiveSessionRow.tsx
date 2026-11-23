import { Dragonball } from '../components/KintounCloud'
import type { AdminLiveSession } from '../lib/kintoun'
import {
  DRAGONS,
  dragonballKinds,
  dragonColorKinds,
  dragonTotal,
  formatLiveClock,
  normalizeGrantAmount,
  RAINBOW_DRAGON,
} from '../lib/kintounBoard'

/** 오른쪽 쏘기 버튼에 쓰는 일반용 아이콘 (일반용 7종을 대표) */
const DRAGON_ICON = DRAGONS[0].icon

interface LiveSessionRowProps {
  /** 지금 공부 중인 학생 한 줄 (화면에서 흐른 시간까지 더한 값) */
  row: AdminLiveSession
  /** 드래곤볼 쏘기 버튼이 쏠 개수 */
  amount: number
  /** 쏘는 중 — 두 버튼을 함께 잠근다 */
  busy?: boolean
  /** 방금 드래곤볼을 받아 반짝이는 줄 */
  flash?: boolean
  onGrant: () => void
  /** 「수업 종료」 — 확인 창을 연다 */
  onEnd: () => void
}

/**
 * 관리자 실시간 탭의 활성 세션 카드 한 줄.
 * 1줄 이름·닉네임 · 2줄 상태·시간 · 3줄 배지 + 「수업 종료」 · 오른쪽 끝 드래곤볼 쏘기.
 * (360px 에서 이름이 잘리지 않도록 이 3줄 배치를 유지한다)
 */
export function LiveSessionRow({ row, amount, busy = false, flash = false, onGrant, onEnd }: LiveSessionRowProps): JSX.Element {
  return (
    <li className={`flex items-start gap-2 px-1 py-2.5 transition ${flash ? 'bg-[#FFF3D6]' : ''}`}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-soft text-[14px]">
        {row.status === 'running' ? (row.kind === 'homework' ? '🏠' : '🏫') : '😴'}
      </span>

      {/* 1줄 이름·닉네임 · 2줄 상태·시간 · 3줄 배지 */}
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-[14px] font-extrabold leading-tight text-navy">{row.name}</span>
          <span className="shrink-0 text-[10.5px] font-semibold text-navy/35">{row.displayName}</span>
        </p>
        <p className="mt-0.5 truncate text-[11px] font-semibold text-navy/45">
          <span className={row.status === 'running' ? 'text-[#2E7D32]' : 'text-[#B07200]'}>
            {row.status === 'running' ? '공부 중' : '잠깐 쉬는 중'}
          </span>
          {' · '}
          <span className="tabular">{formatLiveClock(row.seconds)}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="inline-flex items-center gap-1 rounded-full border border-[#B9DDB9] bg-[#F0FAF0] px-1.5 py-0.5">
            <Dragonball size="sm" stars={4} />
            <span className="text-[10px] font-extrabold text-[#2E6B34] tabular">
              {row.dragonballCount}개
              <span className="ml-0.5 text-[9.5px] font-bold text-[#2E6B34]/60">
                {dragonballKinds(row.dragonballs)}/7종
              </span>
            </span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[#D9CCFF] bg-[#F7F3FF] px-1.5 py-0.5">
            <img src={DRAGON_ICON} alt="" className="h-4 w-4 object-contain" aria-hidden="true" />
            <span className="text-[10px] font-extrabold text-[#5B3FB8] tabular">
              {dragonTotal(row.dragons)}
              <span className="ml-0.5 text-[9.5px] font-bold text-[#5B3FB8]/60">
                {dragonColorKinds(row.dragons)}/7색
              </span>
            </span>
            {row.rainbowDragonCount > 0 ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-[#5B3FB8] tabular">
                <img src={RAINBOW_DRAGON.icon} alt="" className="h-4 w-4 object-contain" aria-hidden="true" />
                {row.rainbowDragonCount}
              </span>
            ) : null}
          </span>

          {/* 선생님이 직접 그 학생의 공부를 마무리한다 */}
          <button
            type="button"
            disabled={busy}
            onClick={onEnd}
            aria-label={`${row.name} 수업 종료`}
            className="ml-auto shrink-0 rounded-full border border-[#F2C4BC] bg-[#FFF5F3] px-2 py-1 text-[10.5px] font-extrabold text-[#B03A2E] transition active:scale-[0.97] disabled:opacity-40"
          >
            수업 종료
          </button>
        </div>
      </div>

      {/* 오른쪽 끝 — 글자 없이 드래곤볼 아이콘만 있는 쏘기 버튼 */}
      <button
        type="button"
        disabled={busy}
        onClick={onGrant}
        aria-label={`${row.name}에게 드래곤볼 ${normalizeGrantAmount(amount)}개 쏘기`}
        title={`드래곤볼 ${normalizeGrantAmount(amount)}개 쏘기`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F08C00] shadow-sm transition active:scale-95 disabled:opacity-40"
      >
        <Dragonball size="sm" stars={4} />
      </button>
    </li>
  )
}
