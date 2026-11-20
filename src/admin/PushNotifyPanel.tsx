import { useCallback, useEffect, useState } from 'react'
import { Spinner } from '../components/Keypad'
import { countPushDevices, disablePush, enablePush, readPushStatus, registerServiceWorker, sendTestPush } from '../lib/push'
import type { PushDeviceStatus } from '../lib/push'
import { pushStateHint, pushStateLabel } from '../lib/pushBoard'

type Busy = 'on' | 'off' | 'test' | null

interface Note {
  tone: 'ok' | 'error' | 'info'
  text: string
}

const NOTE_STYLE: Record<Note['tone'], string> = {
  ok: 'bg-[#E9F7EE] text-[#1F7A45]',
  error: 'bg-red-50 text-red-500',
  info: 'bg-blue-soft/70 text-navy/60',
}

/**
 * 관리자 '질문함' 맨 위 — 새 질문 알림 켜기/끄기 + 테스트 알림.
 * 브라우저 푸시(무료)라서 요금이 더 들지 않는다.
 */
export function PushNotifyPanel(): JSX.Element {
  const [status, setStatus] = useState<PushDeviceStatus | null>(null)
  const [devices, setDevices] = useState<number | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [note, setNote] = useState<Note | null>(null)

  const refresh = useCallback(async () => {
    setStatus(await readPushStatus())
  }, [])

  const refreshDevices = useCallback(async () => {
    const res = await countPushDevices()
    setDevices(res.ok ? res.data : null)
  }, [])

  useEffect(() => {
    void refresh()
    void refreshDevices()
    // 관리자 화면을 열 때 서비스 워커를 미리 준비해 둔다 (알림 켤 때 바로 구독)
    void registerServiceWorker()
  }, [refresh, refreshDevices])

  /* 구독이 브라우저 쪽에서 바뀌면 상태를 다시 읽는다 */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'sunogong:pushsubscriptionchange') void refresh()
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [refresh])

  const on = status?.state === 'on'

  const toggle = async () => {
    if (!status || busy || status.state === 'checking') return
    const turningOn = !on
    setBusy(turningOn ? 'on' : 'off')
    setNote(null)
    const res = turningOn ? await enablePush() : await disablePush()
    setBusy(null)
    if (!res.ok) {
      setNote({ tone: 'error', text: res.error })
      void refresh()
      return
    }
    setStatus(res.data)
    setNote({
      tone: 'ok',
      text: turningOn
        ? '알림을 켰어요. 이제 학생이 질문을 올리면 바로 알려 드려요.'
        : '알림을 껐어요. 이 기기에서는 더 이상 알림이 오지 않아요.',
    })
    void refreshDevices()
  }

  const test = async () => {
    if (busy) return
    setBusy('test')
    setNote(null)
    const res = await sendTestPush()
    setBusy(null)
    setNote({ tone: res.ok ? 'ok' : 'error', text: res.ok ? res.data : res.error })
  }

  const hint = status ? pushStateHint(status.state, status.platform) : '알림을 준비하고 있어요.'
  const canEnable = Boolean(status) && status?.available === 'ready'
  const disabled = !status || busy !== null || status.state === 'checking'

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-navy">🔔 새 질문 알림</h2>
          <p className="mt-1 text-[12px] text-navy/50">
            학생이 질문을 올리면 휴대폰·PC 알림으로 바로 알려 드려요. 브라우저 알림이라 추가 요금이 없어요.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            on ? 'bg-navy text-white' : 'bg-blue-soft text-navy/55'
          }`}
        >
          {status ? pushStateLabel(status.state) : '확인 중…'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => void toggle()}
          disabled={disabled || (!on && !canEnable)}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[12.5px] font-bold transition disabled:opacity-40 ${
            on ? 'border border-red-200 bg-white text-red-500 hover:bg-red-50' : 'bg-navy text-white'
          }`}
        >
          {busy === 'on' || busy === 'off' ? (
            <Spinner className="h-4 w-4 border-white/40 border-t-white" />
          ) : (
            <span aria-hidden="true">{on ? '🔕' : '🔔'}</span>
          )}
          {busy === 'on' ? '켜는 중…' : busy === 'off' ? '끄는 중…' : on ? '알림 끄기' : '알림 켜기'}
        </button>

        <button
          type="button"
          onClick={() => void test()}
          disabled={busy !== null || !on}
          className="rounded-xl border border-blue-line bg-white px-3.5 py-2 text-[12px] font-bold text-navy/70 transition hover:bg-blue-soft disabled:opacity-40"
        >
          {busy === 'test' ? '보내는 중…' : '테스트 알림 보내기'}
        </button>

        <button
          type="button"
          onClick={() => {
            void refresh()
            void refreshDevices()
          }}
          disabled={busy !== null}
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-navy/45 hover:bg-blue-soft disabled:opacity-40"
        >
          상태 새로고침
        </button>

        {devices !== null ? (
          <span className="ml-auto rounded-full bg-blue-soft px-2.5 py-1 text-[11px] font-bold text-navy/55 tabular">
            알림 받는 기기 {devices}대
          </span>
        ) : null}
      </div>

      <p className="mt-2.5 rounded-xl bg-blue-soft/50 px-3 py-2 text-[11.5px] leading-relaxed text-navy/60">{hint}</p>

      {status?.state === 'needs-install' ? (
        <ol className="mt-2 space-y-1 rounded-xl border border-blue-line bg-white px-3.5 py-2.5 text-[11px] leading-relaxed text-navy/60">
          <li>
            <strong className="font-bold text-navy/80">1.</strong> 사파리 아래 공유 버튼(⬆️)을 누릅니다.
          </li>
          <li>
            <strong className="font-bold text-navy/80">2.</strong> 목록에서 <strong className="font-bold text-navy/80">홈 화면에 추가</strong>를 누릅니다.
          </li>
          <li>
            <strong className="font-bold text-navy/80">3.</strong> 홈 화면의 <strong className="font-bold text-navy/80">선오공</strong>을 열고
            관리자 → 질문함에서 <strong className="font-bold text-navy/80">알림 켜기</strong>를 누릅니다.
          </li>
          <li className="text-navy/40">아이폰은 iOS 16.4 이상에서 알림을 지원해요.</li>
        </ol>
      ) : null}

      {note ? (
        <p className={`mt-2 rounded-xl px-3 py-2 text-[11.5px] leading-relaxed font-semibold ${NOTE_STYLE[note.tone]}`}>
          {note.text}
        </p>
      ) : null}
    </section>
  )
}
