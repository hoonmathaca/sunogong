import { useCallback, useEffect, useRef, useState } from 'react'
import { Spinner } from '../components/Keypad'
import { PhotoInputButton } from '../components/PhotoInputButton'
import * as questionsApi from '../lib/questions'
import { QUESTION_MEMO_MAX } from '../lib/questionBoard'
import type { StudyQuestion } from '../lib/types'

interface QuestionAskFormProps {
  studentId: string
  /** 질문이 올라갔을 때 */
  onSubmitted?: (question: StudyQuestion) => void
  /** 올리는 중인지 (타이머 화면에서 창을 닫지 않게) */
  onBusyChange?: (busy: boolean) => void
  compact?: boolean
}

/**
 * 문제 사진 + 한 줄 메모를 받아 질문을 올리는 폼.
 * 사진은 올리기 전에 브라우저에서 줄여(JPEG) 용량을 아낀다.
 */
export function QuestionAskForm({
  studentId,
  onSubmitted,
  onBusyChange,
  compact = false,
}: QuestionAskFormProps): JSX.Element {
  const cameraRef = useRef<HTMLInputElement | null>(null)
  const albumRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<'idle' | 'preparing' | 'uploading'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return undefined
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const pickFile = useCallback((next: File | null) => {
    setError(null)
    setDone(false)
    if (!next) return
    if (!next.type.startsWith('image/')) {
      setError('문제 사진을 골라 주세요.')
      return
    }
    setFile(next)
  }, [])

  const reset = () => {
    setFile(null)
    setMemo('')
    setError(null)
    if (cameraRef.current) cameraRef.current.value = ''
    if (albumRef.current) albumRef.current.value = ''
  }

  const submit = async () => {
    if (busy) return
    if (!file) {
      // 방금 올린 뒤 '하나 더 질문하기'를 누른 경우 — 새 질문을 받을 준비만 한다
      if (done) {
        setDone(false)
        return
      }
      setError('문제 사진을 먼저 골라 주세요.')
      return
    }
    setBusy(true)
    setStage('preparing')
    setError(null)
    setDone(false)
    // 사진 준비(줄이기)가 끝나면 올리는 중으로 바꿔 준다
    const stageTimer = window.setTimeout(() => setStage('uploading'), 1200)
    try {
      const res = await questionsApi.createQuestion({ studentId, memo, file })
      if (!res.ok) {
        setError(res.error)
        return
      }
      reset()
      setDone(true)
      onSubmitted?.(res.data)
    } catch (submitError) {
      console.warn('[sunogong] 질문 올리기 실패:', submitError)
      setError('질문을 올리지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.')
    } finally {
      window.clearTimeout(stageTimer)
      setStage('idle')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {file && previewUrl ? (
        <div className="relative overflow-hidden rounded-2xl border border-blue-line bg-blue-soft/40">
          <img src={previewUrl} alt="올릴 문제 사진" className={`w-full object-contain ${compact ? 'max-h-[180px]' : 'max-h-[240px]'}`} />
          <div className="absolute right-2 top-2 flex gap-1.5">
            <PhotoInputButton
              name="retake"
              label="다시 고르기"
              multiple
              disabled={busy}
              inputRef={albumRef}
              onFiles={(picked) => pickFile(picked[0] ?? null)}
              tone="plain"
              className="h-[30px] rounded-full bg-white/95 px-3 text-[11px] text-navy shadow-sm"
            />
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="rounded-full bg-navy/80 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm disabled:opacity-50"
            >
              빼기
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-[#6D3BD6]/25 bg-[#EDE4FF]/40 px-3 py-4 text-center">
          <p className="text-[13px] font-bold text-[#4A28A0]">문제 사진을 찍거나 골라 주세요</p>
          <p className="mt-1 text-[11px] font-semibold text-[#5B2FC0]/60">사진은 자동으로 줄여서 올라가요</p>
          <div className="mt-3 flex gap-2">
            <PhotoInputButton
              name="camera"
              label="📷 사진 찍기"
              capture
              tone="primary"
              disabled={busy}
              inputRef={cameraRef}
              onFiles={(picked) => pickFile(picked[0] ?? null)}
              className="h-11 flex-1 rounded-xl text-[14px]"
            />
            <PhotoInputButton
              name="album"
              label="🖼️ 앨범에서"
              multiple
              tone="plain"
              disabled={busy}
              inputRef={albumRef}
              onFiles={(picked) => pickFile(picked[0] ?? null)}
              className="h-11 flex-1 rounded-xl border border-[#6D3BD6]/25 bg-white text-[14px] text-[#4A28A0]"
            />
          </div>
        </div>
      )}

      <label className="block">
        <span className="text-[12px] font-bold text-navy/60">한 줄 메모 (선택)</span>
        <input
          type="text"
          value={memo}
          maxLength={QUESTION_MEMO_MAX}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="예) 3번 문제에서 막혔어요"
          className="mt-1 w-full rounded-xl border border-blue-line bg-white px-3 py-2.5 text-[14px] text-navy placeholder:text-navy/30 focus:outline-none focus:ring-2 focus:ring-blue-brand/30"
        />
        <span className="mt-1 block text-right text-[10px] font-semibold text-navy/35">
          {memo.length}/{QUESTION_MEMO_MAX}
        </span>
      </label>

      {error ? (
        <div className="rounded-2xl bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-500">{error}</div>
      ) : null}

      {done ? (
        <div className="rounded-2xl bg-[#EDE4FF] px-3 py-2.5 text-[12.5px] font-bold text-[#4A28A0]">
          ✅ 질문을 올렸어요! 선오공이가 확인하고 답을 달아줄게요.
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !file}
        className={`h-[50px] w-full rounded-2xl text-[16px] font-bold text-white shadow-soft transition active:scale-[0.99] disabled:opacity-50 ${
          done ? 'bg-[#4A28A0]' : 'bg-[#6D3BD6]'
        }`}
      >
        {busy ? (
          <span className="inline-flex items-center gap-2">
            <Spinner className="h-5 w-5 border-white/40 border-t-white" />
            {stage === 'preparing' ? '사진 준비 중…' : '올리는 중…'}
          </span>
        ) : done ? (
          '하나 더 질문하기'
        ) : (
          '질문 올리기'
        )}
      </button>
    </div>
  )
}
