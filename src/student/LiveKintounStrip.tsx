/**
 * 근두운 — 타이머 화면 한 줄 요약.
 *
 * 숙제 공부 타이머에서 '지금 몇 명이 공부 중인지'와 친구 몇 명의 진행 시간을
 * 타이머 숫자·버튼을 가리지 않는 얇은 줄로 보여 준다.
 * 홈 화면의 큰 카드(LiveKintounCard)와 같은 서버 함수(live_study_board)를 쓰고,
 * 15초마다 새로 읽고 그 사이에는 1초마다 시간만 흘려 보낸다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from '../lib/kintoun'
import { formatLiveClock, LIVE_REFRESH_MS, liveStrip, tickRows, type LiveBoard, type LiveRow } from '../lib/kintounBoard'

/** 타이머 줄에 띄우는 이름 최대 개수 (넘치는 인원은 '외 N명') */
export const STRIP_MAX = 3

interface LiveKintounStripProps {
  studentId: string
  /** 화면보호 모드(저조도)면 어두운 색으로 */
  dim?: boolean
}

export function LiveKintounStrip({ studentId, dim = false }: LiveKintounStripProps): JSX.Element {
  const [board, setBoard] = useState<LiveBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    const live = await api.liveStudyBoard(studentId)
    if (live.ok) {
      setBoard(live.data)
      setFetchedAt(Date.now())
      setNow(Date.now())
      setError(null)
    } else {
      setError(live.error)
    }
    setLoading(false)
  }, [studentId])

  useEffect(() => {
    void load()
  }, [load])

  /* 15초마다 새로 읽고, 1초마다 시간만 흘려 보낸다 */
  useEffect(() => {
    const refresh = window.setInterval(() => void load(), LIVE_REFRESH_MS)
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.clearInterval(refresh)
      window.clearInterval(tick)
    }
  }, [load])

  /* 앱으로 돌아오면 바로 새로 읽는다 */
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const rows: LiveRow[] = useMemo(() => (board ? tickRows(board.students, fetchedAt, now) : []), [board, fetchedAt, now])
  const strip = useMemo(() => liveStrip(rows, board?.running_count, STRIP_MAX), [rows, board])

  return (
    <div
      role="group"
      aria-label="근두운 — 지금 공부 중인 친구"
      className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-[11px] ${
        dim ? 'border border-white/10 bg-white/[0.04]' : 'border border-blue-line bg-white/80 shadow-sm'
      }`}
    >
      <span className={`shrink-0 font-extrabold ${dim ? 'text-[#7E8AA1]' : 'text-navy'}`}>
        <span aria-hidden="true">☁️</span> 근두운
      </span>

      {error ? (
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className={`truncate font-semibold ${dim ? 'text-[#5A6478]' : 'text-red-500'}`}>불러오지 못했어요</span>
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              void load()
            }}
            className={`shrink-0 font-bold underline ${dim ? 'text-[#7E8AA1]' : 'text-navy/50'}`}
          >
            다시
          </button>
        </span>
      ) : !board ? (
        <span className={`min-w-0 flex-1 truncate font-semibold ${dim ? 'text-[#5A6478]' : 'text-navy/40'}`}>
          {loading ? '불러오는 중…' : '지금은 공부 중인 친구가 없어요'}
        </span>
      ) : (
        <>
          <span className={`shrink-0 font-extrabold tabular ${dim ? 'text-[#8C97AD]' : 'text-[#5B2FC0]'}`}>
            {strip.count}명 공부 중
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            {strip.items.length === 0 ? (
              <span className={`truncate font-semibold ${dim ? 'text-[#5A6478]' : 'text-navy/40'}`}>친구를 기다리는 중</span>
            ) : (
              <>
                {strip.items.map((item, index) => (
                  <span key={`${item.label}-${index}`} className="flex min-w-0 shrink items-center gap-1">
                    {index > 0 ? (
                      <span className={`shrink-0 ${dim ? 'text-[#3F4757]' : 'text-navy/20'}`} aria-hidden="true">
                        ·
                      </span>
                    ) : null}
                    <span
                      className={`truncate font-bold ${
                        item.isMe ? (dim ? 'text-[#9A7B3A]' : 'text-[#8A5400]') : dim ? 'text-[#6C778C]' : 'text-navy/60'
                      }`}
                    >
                      {item.label}
                    </span>
                    <span className={`shrink-0 text-[10px] font-semibold tabular ${dim ? 'text-[#5A6478]' : 'text-navy/35'}`}>
                      {formatLiveClock(item.seconds)}
                    </span>
                  </span>
                ))}
                {strip.hidden > 0 ? (
                  <span className={`shrink-0 font-semibold ${dim ? 'text-[#5A6478]' : 'text-navy/35'}`}>외 {strip.hidden}명</span>
                ) : null}
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="근두운 새로고침"
            className={`shrink-0 text-[13px] leading-none transition disabled:opacity-40 ${
              dim ? 'text-[#5A6478]' : 'text-navy/30 hover:text-navy/60'
            }`}
          >
            ↻
          </button>
        </>
      )}
    </div>
  )
}
