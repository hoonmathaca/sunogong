import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { BrandFooter, Mascot } from '../components/Brand'
import { Keypad, Spinner } from '../components/Keypad'
import { Modal } from '../components/Modal'
import {
  detectPlatform,
  enterFullscreen,
  exitFullscreen,
  fullscreenHint,
  isFullscreenActive,
  isStandaloneApp,
  PIXEL_SHIFT_INTERVAL_MS,
  pixelShift,
  supportsFullscreen,
  type Platform,
} from '../lib/fullscreen'
import { KIND_EMOJI, KIND_LABEL } from '../lib/kinds'
import { formatHMS, formatMinutes, MAX_SESSION_SECONDS } from '../lib/time'
import type { FinishResult, Student, StudySession } from '../lib/types'
import { QuestionAskForm } from './QuestionAskForm'
import { useStudyTimer, type DiscardReason, type FinishReason } from './useStudyTimer'

interface TimerScreenProps {
  student: Student
  initialSession?: StudySession | null
  onFinished: (result: FinishResult, reason: FinishReason) => void
  onDiscarded: (reason: DiscardReason) => void
  onExit: () => void
}

/** 공부 타이머 화면 */
export function TimerScreen({ student, initialSession = null, onFinished, onDiscarded, onExit }: TimerScreenProps): JSX.Element {
  const timer = useStudyTimer({ studentId: student.id, initialSession, onFinished, onDiscarded })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [problemOpen, setProblemOpen] = useState(false)
  /* 공부 중에 바로 문제 사진을 올리는 '선오공에게 질문하기' 창 */
  const [askOpen, setAskOpen] = useState(false)
  const [askBusy, setAskBusy] = useState(false)
  const [problems, setProblems] = useState('')
  const [pendingReason, setPendingReason] = useState<FinishReason>('manual')
  /* 화면보호 모드(저조도) — 숙제 공부에서만 쓴다. 기본은 꺼짐. */
  const [shield, setShield] = useState(false)
  /* 전체화면 — 브라우저 주소창·하단 내비게이션 바를 숨긴다 */
  const [fullscreen, setFullscreen] = useState(false)
  /* 전체화면을 켤 수 없을 때 잠깐 보여 주는 안내 */
  const [hint, setHint] = useState<string | null>(null)
  /* 잔상 방지용 미세 이동 횟수 (1분마다 한 칸) */
  const [shiftStep, setShiftStep] = useState(0)
  const [platform] = useState<Platform>(() =>
    typeof navigator === 'undefined' ? 'other' : detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0),
  )
  const [standalone] = useState<boolean>(() => isStandaloneApp())
  const [fsSupported] = useState<boolean>(() => supportsFullscreen())
  const enteredFullscreen = useRef(false)
  const hintTimer = useRef<number | null>(null)
  const autoHintShown = useRef(false)
  const limitModalShown = useRef(false)

  const { session, status, elapsedSeconds, busy, error, notice, limitReached, wakeLockOk, kind } = timer
  const isHomework = kind === 'homework'
  const dim = isHomework && shield

  /* 5시간이 되면 자동으로 종료 안내 (문제 수는 그대로 입력) */
  useEffect(() => {
    if (!limitReached || limitModalShown.current) return
    limitModalShown.current = true
    setAskOpen(false)
    setAskBusy(false)
    setPendingReason('limit')
    setProblems('')
    setProblemOpen(true)
  }, [limitReached])

  /* 전체화면 상태를 브라우저와 맞춘다 — 기기 뒤로가기·제스처로 나갈 수 있다 */
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const target: EventTarget = document
    const sync = () => setFullscreen(isFullscreenActive())
    target.addEventListener('fullscreenchange', sync)
    target.addEventListener('webkitfullscreenchange', sync)
    sync()
    return () => {
      target.removeEventListener('fullscreenchange', sync)
      target.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  /* 타이머 화면을 떠날 때는 우리가 켠 전체화면을 함께 정리한다 */
  useEffect(
    () => () => {
      if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
      if (enteredFullscreen.current) void exitFullscreen()
    },
    [],
  )

  /* 잔상 방지 — 화면보호 모드나 전체화면으로 오래 켜둘 때만 1분마다 조금씩 옮긴다 */
  const shifting = dim || fullscreen
  useEffect(() => {
    if (!shifting) {
      setShiftStep(0)
      return undefined
    }
    const id = window.setInterval(() => setShiftStep((step) => step + 1), PIXEL_SHIFT_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [shifting])
  const shift = shifting ? pixelShift(shiftStep) : { x: 0, y: 0 }

  const showHint = (text: string | null) => {
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
    hintTimer.current = null
    setHint(text)
    if (text) {
      hintTimer.current = window.setTimeout(() => {
        hintTimer.current = null
        setHint(null)
      }, 12_000)
    }
  }

  const blockedHint = (outcome: 'unsupported' | 'failed') =>
    fullscreenHint({ platform, supported: outcome !== 'unsupported', standalone, failed: outcome === 'failed' }) ??
    '전체화면을 켤 수 없어요'

  /* ⛶ 전체화면 버튼 */
  const toggleFullscreen = async () => {
    if (isFullscreenActive()) {
      await exitFullscreen()
      enteredFullscreen.current = false
      setFullscreen(false)
      return
    }
    const outcome = await enterFullscreen()
    if (outcome === 'active') {
      enteredFullscreen.current = true
      setFullscreen(true)
      showHint(null)
      return
    }
    enteredFullscreen.current = false
    setFullscreen(false)
    showHint(blockedHint(outcome))
  }

  /* 화면보호 모드를 켜면 전체화면도 함께 시도한다 (실패해도 조용히 넘어감) */
  const enableShield = () => {
    setShield(true)
    void enterFullscreen().then((outcome) => {
      if (outcome === 'active') {
        enteredFullscreen.current = true
        setFullscreen(true)
        return
      }
      enteredFullscreen.current = false
      if (autoHintShown.current) return
      autoHintShown.current = true
      showHint(blockedHint(outcome))
    })
  }

  /* 화면보호 모드를 끄면 전체화면도 함께 나간다 */
  const disableShield = () => {
    setShield(false)
    enteredFullscreen.current = false
    void exitFullscreen()
  }

  const openFinishFlow = () => {
    if (busy) return
    setConfirmOpen(true)
  }

  /* 질문 창을 여는 동안에는 숙제 공부도 멈추지 않는다 (사진 찍으러 카메라로 넘어가도 계속) */
  const openAsk = () => {
    timer.holdOnLeave(true)
    setAskOpen(true)
  }

  const closeAsk = () => {
    if (askBusy) return
    setAskOpen(false)
    timer.holdOnLeave(false)
  }

  const openProblemInput = () => {
    setConfirmOpen(false)
    setPendingReason('manual')
    setProblems('')
    setProblemOpen(true)
  }

  const saveAndFinish = async () => {
    const count = problems === '' ? 0 : Number(problems)
    const result = await timer.finish(Number.isFinite(count) ? count : 0, pendingReason)
    if (result) setProblemOpen(false)
  }

  const pushDigit = (digit: string) => setProblems((prev) => (prev.length >= 4 ? prev : `${prev}${digit}`))
  const popDigit = () => setProblems((prev) => prev.slice(0, -1))

  /* 저조도 화면에서는 버튼이 아닌 곳을 누르면 다시 밝게 돌아온다 */
  const handleDimTap = (event: MouseEvent<HTMLDivElement>) => {
    if (!dim) return
    const target = event.target as HTMLElement | null
    if (target?.closest('button')) return
    disableShield()
  }

  if (status === 'loading') {
    return (
      <div className="screen items-center justify-center bg-white">
        <Spinner className="h-8 w-8 border-navy/20 border-t-navy" />
      </div>
    )
  }

  if (status === 'idle') {
    return (
      <div className="screen bg-white px-5 pt-10">
        <p className="text-center text-navy/60">진행 중인 공부가 없어요.</p>
        {error ? <p className="mt-3 text-center text-sm text-red-500">{error}</p> : null}
        <div className="mt-6 flex flex-col gap-2">
          <button type="button" className="btn-navy" onClick={() => void timer.start()}>
            공부 시작
          </button>
          <button type="button" className="btn-outline" onClick={onExit}>
            홈으로
          </button>
        </div>
        <BrandFooter />
      </div>
    )
  }

  const isPaused = session?.status === 'paused'
  const remainingSeconds = Math.max(0, MAX_SESSION_SECONDS - elapsedSeconds)

  return (
    <div
      onClick={handleDimTap}
      className={`screen overflow-hidden transition-colors duration-300 ${dim ? 'bg-[#07090F]' : 'bg-gradient-to-b from-blue-soft/60 to-white'}`}
    >
      <div
        className="flex min-h-0 flex-1 flex-col transition-transform duration-1000 ease-in-out"
        style={{ transform: `translate3d(${shift.x}px, ${shift.y}px, 0)` }}
      >
        <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full px-3 py-1 text-[12px] font-bold shadow-sm ${
                dim ? 'bg-white/[0.06] text-[#7E8AA1] shadow-none' : 'bg-white text-navy'
              }`}
            >
              {student.name} · {student.grade}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-[12px] font-bold shadow-sm ${
                dim
                  ? 'bg-white/[0.06] text-[#7E8AA1] shadow-none'
                  : isHomework
                    ? 'bg-[#EDE4FF] text-[#5B2FC0]'
                    : 'bg-white text-navy'
              }`}
            >
              {KIND_EMOJI[kind]} {KIND_LABEL[kind]}
            </span>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              aria-pressed={fullscreen}
              aria-label={fullscreen ? '전체화면 나가기' : '전체화면으로 보기'}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                dim
                  ? 'border border-white/10 text-[#93A0B8]'
                  : fullscreen
                    ? 'bg-[#0B0F18] text-white'
                    : 'border border-navy/20 bg-white text-navy/70'
              }`}
            >
              {fullscreen ? '⛶ 전체화면 나가기' : fsSupported ? '⛶ 전체화면' : '⛶ 전체화면 안내'}
            </button>
            {isHomework ? (
              <button
                type="button"
                onClick={() => (dim ? disableShield() : enableShield())}
                aria-pressed={shield}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                  dim
                    ? 'border border-white/10 text-[#93A0B8]'
                    : shield
                      ? 'bg-[#0B0F18] text-white'
                      : 'border border-[#6D3BD6]/30 bg-white text-[#5B2FC0]'
                }`}
              >
                {shield ? '☀️ 밝게 보기' : '🌙 화면보호 모드'}
              </button>
            ) : null}
            <span className={`text-[11px] font-semibold ${dim ? 'text-[#3F4757]' : 'text-navy/40'}`}>10초마다 자동 저장</span>
          </div>
        </div>

        {/* 화면 꺼짐 안내 — 숙제/학원에 따라 다르게 */}
        <div className="px-5 pt-3">
          {isHomework ? (
            <div
              className={`rounded-2xl px-3 py-2 text-center text-[12.5px] font-bold ${
                dim ? 'bg-[#2A1B45] text-[#B9A6DE]' : 'bg-[#6D3BD6] text-white shadow-sm'
              }`}
            >
              📵 숙제 공부는 화면을 끄거나 나가면 멈춰요
            </div>
          ) : (
            <div
              className={`rounded-2xl px-3 py-2 text-center text-[12.5px] font-bold ${
                dim ? 'bg-white/[0.05] text-[#7E8AA1]' : 'border border-blue-line bg-white text-navy/60 shadow-sm'
              }`}
            >
              🏫 학원 공부는 화면이 꺼져도 계속 가요
            </div>
          )}
        </div>

        {/* 전체화면을 켤 수 없을 때의 짧은 안내 (12초 뒤 저절로 사라짐) */}
        {hint ? (
          <div className="px-5 pt-2">
            <button
              type="button"
              onClick={() => showHint(null)}
              className={`w-full rounded-2xl px-3 py-2 text-center text-[12px] font-semibold leading-snug ${
                dim ? 'bg-white/[0.06] text-[#93A0B8]' : 'bg-[#FFF6DA] text-[#7A5B00]'
              }`}
            >
              {hint}
            </button>
          </div>
        ) : null}

        <div className="flex flex-1 flex-col items-center justify-center px-5">
          <Mascot variant="full" className={`h-[clamp(64px,13dvh,110px)] w-auto ${dim ? 'opacity-25' : 'opacity-95'}`} />

          <div className="mt-2 text-center">
            <p className={`text-[12px] font-bold tracking-wide ${dim ? 'text-[#4A5364]' : 'text-navy/40'}`}>
              {isPaused ? '일시정지 중이에요' : '공부하는 중'}
            </p>
            <p
              className={`mt-1 text-[clamp(46px,15vw,76px)] font-extrabold leading-none tracking-tight tabular ${
                dim ? 'text-[#8C97AD]' : 'text-navy'
              }`}
            >
              {formatHMS(elapsedSeconds)}
            </p>
            <p className={`mt-2 text-[12px] font-semibold ${dim ? 'text-[#454E5F]' : 'text-navy/45'}`}>
              최대 5시간 · 남은 시간 {formatHMS(remainingSeconds)}
            </p>
          </div>

          {dim && !isPaused ? (
            <p className="mt-3 text-center text-[11px] font-semibold text-[#3D4554]">
              🌙 화면보호 모드 · 화면 아무 곳이나 누르면 밝아져요
            </p>
          ) : null}

          {isPaused ? (
            <div
              className={`mt-3 max-w-full rounded-2xl px-4 py-2 text-center text-[13px] font-semibold ${
                dim ? 'bg-white/[0.05] text-[#8C97AD]' : 'bg-white text-navy/70 shadow-sm'
              }`}
            >
              {notice ?? '일시정지 중이에요'} · 계속하려면 아래 버튼을 눌러주세요
            </div>
          ) : null}

          {!wakeLockOk ? (
            <div
              className={`mt-3 rounded-2xl px-4 py-2 text-center text-[12px] ${
                dim ? 'border border-white/10 text-[#6C778C]' : 'border border-blue-line bg-white text-navy/60'
              }`}
            >
              화면을 켜둔 채로 공부해주세요
            </div>
          ) : null}

          {error ? (
            <div className="mt-3 max-w-full break-words rounded-2xl bg-red-50 px-3 py-2 text-center text-[12px] text-red-500">
              {error}
            </div>
          ) : null}
        </div>

        <div className="px-5 pb-1.5">
          <button
            type="button"
            onClick={openAsk}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-[13.5px] font-bold transition active:scale-[0.99] ${
              dim
                ? 'border border-white/10 bg-white/[0.04] text-[#8C97AD]'
                : 'border border-[#6D3BD6]/25 bg-[#F5F0FF] text-[#4A28A0]'
            }`}
          >
            <span aria-hidden="true">💬</span>
            선오공에게 질문하기
            <span className={`text-[11px] font-semibold ${dim ? 'text-[#5A6478]' : 'text-[#6D3BD6]/60'}`}>
              타이머는 계속 가요
            </span>
          </button>
        </div>

        <div className="px-5 pb-2">
          <div className="flex gap-2.5">
            {isPaused ? (
              <button
                type="button"
                onClick={() => void timer.resume()}
                disabled={busy}
                className={`h-[54px] flex-1 rounded-2xl text-lg font-bold transition active:scale-[0.98] disabled:opacity-40 ${
                  dim ? 'bg-[#1D2536] text-[#B7C2D6]' : 'btn-navy text-lg'
                }`}
              >
                {busy ? <Spinner className="h-5 w-5 border-white/40 border-t-white" /> : '계속'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void timer.pause(false, '일시정지했어요')}
                disabled={busy}
                className={`h-[54px] flex-1 rounded-2xl text-lg font-bold transition active:scale-[0.98] disabled:opacity-40 ${
                  dim ? 'border border-white/10 bg-white/[0.04] text-[#8C97AD]' : 'btn-outline text-lg'
                }`}
              >
                일시정지
              </button>
            )}
            <button
              type="button"
              onClick={openFinishFlow}
              disabled={busy}
              className={`h-[54px] flex-1 rounded-2xl text-lg font-bold transition active:scale-[0.98] disabled:opacity-40 ${
                dim ? 'bg-[#1D2536] text-[#B7C2D6]' : 'btn-navy text-lg'
              }`}
            >
              종료
            </button>
          </div>
          <p className={`mt-2 text-center text-[11px] ${dim ? 'text-[#333B49]' : 'text-navy/35'}`}>
            {isHomework
              ? '화면을 끄거나 다른 앱으로 나가면 자동으로 멈춰요 · 끝나면 꼭 종료를 눌러주세요'
              : '화면이 꺼져도 시간은 계속 가요 · 끝나면 꼭 종료를 눌러주세요'}
          </p>
        </div>

        <BrandFooter className={dim ? 'pt-1 opacity-25' : 'pt-1'} />
      </div>

      {/* 공부 중 질문 — 타이머는 그대로 두고 문제 사진을 올린다 */}
      <Modal
        open={askOpen}
        title="선오공에게 질문하기"
        description="사진을 찍어 올려도 타이머는 멈추지 않고 계속 가요."
        onClose={closeAsk}
      >
        <QuestionAskForm studentId={student.id} onBusyChange={setAskBusy} compact />
      </Modal>

      {/* 종료 확인 */}
      <Modal
        open={confirmOpen}
        title="공부를 마칠까요?"
        description={
          <span>
            지금까지 <strong className="text-navy">{formatMinutes(Math.floor(elapsedSeconds / 60))}</strong> 공부했어요.
          </span>
        }
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setConfirmOpen(false)}>
              더 공부할래요
            </button>
            <button type="button" className="btn-navy" onClick={openProblemInput}>
              마칠래요
            </button>
          </>
        }
      />

      {/* 푼 문제 수 입력 */}
      <Modal
        open={problemOpen}
        title="오늘 푼 문제 수"
        description={
          pendingReason === 'limit'
            ? '5시간이 지나 자동으로 마무리해요. 푼 문제 수를 알려주세요.'
            : '숫자 키패드로 입력하고 저장을 눌러주세요. (0도 괜찮아요)'
        }
        onClose={() => {
          if (pendingReason === 'limit') return
          setProblemOpen(false)
        }}
        footer={
          pendingReason === 'manual' ? (
            <button type="button" className="btn-outline" onClick={() => setProblemOpen(false)} disabled={busy}>
              취소
            </button>
          ) : undefined
        }
      >
        <div className="flex items-center justify-center rounded-2xl bg-blue-soft py-4">
          <span className="text-[40px] font-extrabold leading-none text-navy tabular">
            {problems === '' ? '0' : problems}
          </span>
          <span className="ml-2 text-sm font-semibold text-navy/50">문제</span>
        </div>

        {pendingReason === 'limit' ? (
          <p className="mt-2 text-center text-[12px] font-semibold text-navy/45">
            최대 공부시간 5시간을 채워서 자동 종료돼요.
          </p>
        ) : null}

        <div className="mt-4">
          <Keypad
            onDigit={pushDigit}
            onBackspace={popDigit}
            onConfirm={() => void saveAndFinish()}
            confirmLabel="저장"
            busy={busy}
          />
        </div>
      </Modal>
    </div>
  )
}
