import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from './Modal'
import { PhotoInputButton } from './PhotoInputButton'
import { Spinner } from './Keypad'
import {
  CAMERA_FALLBACK_LABEL,
  CAMERA_HINT_TEXT,
  CAMERA_OPENING_TEXT,
  CAMERA_PAUSED_NOTICE,
  CAMERA_RETAKE_LABEL,
  CAMERA_SAVING_TEXT,
  CAMERA_SHOT_MAX_SIZE,
  CAMERA_SHOT_QUALITY,
  CAMERA_SHUTTER_LABEL,
  CAMERA_USE_LABEL,
  cameraConstraints,
  cameraErrorMessage,
  cameraFrameSize,
  cameraShotFileName,
} from '../lib/camera'

type Stage = 'opening' | 'live' | 'saving' | 'shot' | 'error'

interface InAppCameraProps {
  /** 버튼 색 — 숙제 사진은 빨강, 질문 사진은 보라 */
  accent?: 'homework' | 'purple'
  /** 찍은 사진의 긴 쪽 최대 픽셀 */
  maxSize?: number
  /** 찍었거나 사진 선택기로 고른 사진 — 부모가 화면에 맞게 줄여 올린다 */
  onFiles: (files: File[]) => void
  onClose: () => void
  /** 고르기 화면에도 남길 안내 (권한 거부 등) */
  onNotice?: (message: string | null) => void
  /** 사진 선택기로 넘어갔을 때 여러 장 고를 수 있게 (숙제 5장) */
  multiple?: boolean
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null)
      return
    }
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

function stopTracks(stream: MediaStream | null): void {
  if (!stream) return
  for (const track of stream.getTracks()) {
    try {
      track.stop()
    } catch {
      /* 이미 멈췄다 */
    }
  }
}

/**
 * 앱 안에서 사진 찍기 (getUserMedia).
 *
 * 폰 기본 카메라 앱을 띄우는 `<input capture>` 대신 브라우저 화면 안에서 카메라를 열어
 *   · 셔터 → 미리 보기 → 「이대로 올리기」/「다시 찍기」
 * 로 끝낸다. 크롬을 벗어나지 않으므로 뒤에 있던 화면이 메모리 부족으로 회수되어
 * 「메모리가 부족하여 이전 작업을 완료할 수 없습니다.」 가 뜨는 일이 없다.
 *
 * 카메라를 못 열면(권한 거부·카메라 없음·미지원) 이유를 보여 주고,
 * 같은 창에서 `<input type="file" accept="image/*">`(사진 선택기)로 넘어갈 수 있게 한다.
 * 찍은 사진은 그 자리에서 긴 쪽 maxSize(기본 1200px) JPEG 로 줄이고, 카메라는 바로 끈다.
 */
export function InAppCamera({
  accent = 'homework',
  maxSize = CAMERA_SHOT_MAX_SIZE,
  onFiles,
  onClose,
  onNotice,
  multiple = false,
}: InAppCameraProps): JSX.Element {
  const [stage, setStage] = useState<Stage>('opening')
  const [error, setError] = useState<string | null>(null)
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const shotUrlRef = useRef<string | null>(null)
  const stageRef = useRef<Stage>('opening')
  const aliveRef = useRef(true)
  /** 화면을 벗어나 카메라를 잠깐 꺼 둔 상태 (돌아오면 저절로 다시 연다) */
  const pausedRef = useRef(false)

  stageRef.current = stage

  const stopStream = useCallback(() => {
    const stream = streamRef.current
    streamRef.current = null
    stopTracks(stream)
    const video = videoRef.current
    if (video) {
      try {
        video.pause()
      } catch {
        /* 재생 중이 아니었다 */
      }
      video.srcObject = null
    }
  }, [])

  const releaseShot = useCallback(() => {
    if (shotUrlRef.current) {
      URL.revokeObjectURL(shotUrlRef.current)
      shotUrlRef.current = null
    }
    setShot(null)
  }, [])

  const start = useCallback(async () => {
    stopStream()
    pausedRef.current = false
    setError(null)
    setStage('opening')
    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
      setError(cameraErrorMessage(null))
      setStage('error')
      return
    }
    try {
      const stream = await mediaDevices.getUserMedia(cameraConstraints())
      if (!aliveRef.current) {
        stopTracks(stream)
        return
      }
      streamRef.current = stream
      /* 카메라를 여는 사이 화면을 벗어났으면 잠깐 꺼 두고, 돌아오면 다시 연다 */
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        stopStream()
        pausedRef.current = true
        setError(CAMERA_PAUSED_NOTICE)
        setStage('error')
        return
      }
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        video.muted = true
        try {
          await video.play()
        } catch {
          /* 자동 재생이 막혀도 화면에 잡히면 손으로 찍을 수 있다 */
        }
      }
      if (!aliveRef.current) {
        stopStream()
        return
      }
      setStage('live')
    } catch (openError) {
      stopStream()
      setError(cameraErrorMessage(openError))
      setStage('error')
    }
  }, [stopStream])

  useEffect(() => {
    aliveRef.current = true
    void start()
    return () => {
      aliveRef.current = false
      stopStream()
      if (shotUrlRef.current) {
        URL.revokeObjectURL(shotUrlRef.current)
        shotUrlRef.current = null
      }
    }
  }, [start, stopStream])

  /* 화면이 그려진 뒤에도 비디오에 카메라를 붙여 둔다 (다시 찍기로 다시 그릴 때 빠지지 않게) */
  useEffect(() => {
    if (stage !== 'live') return
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return
    if (video.srcObject === stream) return
    video.srcObject = stream
    video.muted = true
    video.play().catch(() => {
      /* 자동 재생이 막혀도 화면에 잡히면 손으로 찍을 수 있다 */
    })
  }, [stage])

  /* 앱 전환·화면 꺼짐 — 찍는 중이면 카메라를 끄고, 돌아오면 다시 연다 */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (stageRef.current !== 'live') return
        stopStream()
        pausedRef.current = true
        setError(CAMERA_PAUSED_NOTICE)
        setStage('error')
        return
      }
      if (pausedRef.current && stageRef.current === 'error') void start()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [start, stopStream])

  const takeShot = useCallback(async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError('카메라 화면이 아직 준비되지 않았어요. 잠시 뒤 다시 찍어 주세요.')
      return
    }
    setError(null)
    setStage('saving')
    let canvas: HTMLCanvasElement | null = null
    try {
      const size = cameraFrameSize(video.videoWidth, video.videoHeight, maxSize)
      canvas = document.createElement('canvas')
      canvas.width = size.width
      canvas.height = size.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('canvas_unavailable')
      context.drawImage(video, 0, 0, size.width, size.height)
      const blob = await canvasToBlob(canvas, 'image/jpeg', CAMERA_SHOT_QUALITY)
      if (!blob) throw new Error('canvas_empty')
      /* 확인하는 동안에는 카메라를 꺼 둔다(메모리·배터리) */
      stopStream()
      releaseShot()
      const url = URL.createObjectURL(blob)
      shotUrlRef.current = url
      setShot({ file: new File([blob], cameraShotFileName(), { type: 'image/jpeg' }), url })
      setStage('shot')
    } catch {
      setError('사진을 찍지 못했어요. 다시 찍어 주세요.')
      stopStream()
      setStage('error')
    } finally {
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
      }
    }
  }, [maxSize, releaseShot, stopStream])

  const retake = () => {
    releaseShot()
    void start()
  }

  const confirmShot = () => {
    if (!shot) return
    onNotice?.(null)
    onFiles([shot.file])
    onClose()
  }

  const pickFromPicker = (files: File[]) => {
    if (files.length === 0) return
    onNotice?.(null)
    onFiles(files)
    onClose()
  }

  const openFallback = () => {
    /* 사진 선택기로 넘어가는 동안 카메라를 꺼 둔다 */
    stopStream()
  }

  const primaryClass =
    accent === 'homework'
      ? 'bg-[#E0453E] text-white shadow-sm active:scale-[0.99]'
      : 'bg-[#6D3BD6] text-white shadow-sm active:scale-[0.99]'
  const ghostClass =
    accent === 'homework'
      ? 'border border-[#E0453E]/30 bg-[#FFF7F6] text-[#C4332B]'
      : 'border border-[#6D3BD6]/30 bg-[#F5F0FF] text-[#4A28A0]'

  const content = (
    <Modal open title="사진 찍기" onClose={onClose}>
      <div className="flex flex-col gap-2.5" data-inapp-camera={stage}>
        {stage === 'shot' && shot ? (
          <div className="overflow-hidden rounded-2xl border border-blue-line bg-black">
            <img src={shot.url} alt="찍은 사진" className="max-h-[46dvh] w-full object-contain" />
          </div>
        ) : stage === 'error' ? null : (
          <div className="relative overflow-hidden rounded-2xl border border-navy/10 bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              aria-label="카메라 화면"
              className="aspect-[4/3] w-full bg-black object-contain"
              data-inapp-camera-video="1"
            />
            {stage === 'opening' || stage === 'saving' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-navy/70 text-white">
                <Spinner className="h-6 w-6 border-white/40 border-t-white" />
                <p className="text-[12.5px] font-bold">{stage === 'saving' ? CAMERA_SAVING_TEXT : CAMERA_OPENING_TEXT}</p>
              </div>
            ) : null}
          </div>
        )}

        {error ? (
          <div className="rounded-2xl bg-red-50 px-3 py-2 text-[12px] font-semibold leading-snug text-red-500">
            {error}
          </div>
        ) : null}

        {stage === 'shot' ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={retake}
              data-inapp-camera-action="retake"
              className={`h-[50px] rounded-2xl text-[14px] font-bold ${ghostClass}`}
            >
              {CAMERA_RETAKE_LABEL}
            </button>
            <button
              type="button"
              onClick={confirmShot}
              data-inapp-camera-action="use"
              className={`h-[50px] rounded-2xl text-[15px] font-bold ${primaryClass}`}
            >
              {CAMERA_USE_LABEL}
            </button>
          </div>
        ) : stage === 'error' ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void start()}
              data-inapp-camera-action="retry"
              className={`h-[46px] rounded-2xl text-[14px] font-bold ${ghostClass}`}
            >
              다시 열기
            </button>
            <PhotoInputButton
              name="camera-fallback"
              label={CAMERA_FALLBACK_LABEL}
              multiple={multiple}
              accent={accent}
              onFiles={pickFromPicker}
              onPickClick={openFallback}
              className="h-[50px] text-[14px]"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void takeShot()}
            disabled={stage !== 'live'}
            data-inapp-camera-action="shutter"
            className={`h-[52px] w-full rounded-2xl text-[16px] font-bold transition disabled:opacity-50 ${primaryClass}`}
          >
            {CAMERA_SHUTTER_LABEL}
          </button>
        )}

        <p className="text-[10.5px] leading-snug text-navy/40">{CAMERA_HINT_TEXT}</p>
      </div>
    </Modal>
  )

  /* 숙제 제출 창·질문 창 위에 뜨므로 body 로 보낸다 — 창 안 스크롤·변형에 깎이지 않는다 */
  if (typeof document === 'undefined') return content
  return createPortal(content, document.body)
}
