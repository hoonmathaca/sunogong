import { useEffect, useState } from 'react'
import { InAppCamera } from './InAppCamera'
import { PhotoInputButton, photoButtonClasses } from './PhotoInputButton'
import { CAMERA_FALLBACK_NOTICE, inAppCameraSupported } from '../lib/camera'

interface PhotoCaptureButtonProps {
  /** 화면에 보이는 이름 (예: 📷 바로 찍기) */
  label: string
  /** 자동 점검용 표시 (기본 camera) */
  name?: string
  disabled?: boolean
  accent?: 'homework' | 'purple'
  tone?: 'primary' | 'ghost' | 'plain'
  className?: string
  /** 사진 선택기로 넘어갔을 때 여러 장 고를 수 있게 */
  multiple?: boolean
  /** 찍은 사진의 긴 쪽 최대 픽셀 */
  maxSize?: number
  onFiles: (files: File[]) => void
  /** 화면에 남길 안내 (권한 거부·폴백 안내). null 이면 지운다 */
  onNotice?: (message: string | null) => void
}

/**
 * 「📷 바로 찍기」 — 앱 안 카메라 우선, 안 되면 사진 선택기.
 *
 * 안드로이드 크롬에서 `<input type="file" capture="environment">` 는 폰 기본 카메라 앱을 띄우고,
 * 카메라 앱이 메모리를 크게 쓰는 동안 뒤의 크롬이 OS 에게 회수되어 돌아오면
 * 「메모리가 부족하여 이전 작업을 완료할 수 없습니다.」 가 뜨며 찍은 사진이 사라진다.
 *
 * 그래서 이 버튼은
 *   · 카메라를 쓸 수 있는 기기(https·PWA + getUserMedia) → 화면 안 카메라(`InAppCamera`)
 *   · 못 쓰는 기기(권한 거부·미지원) → `<input type="file" accept="image/*">` 사진 선택기
 * 로 나뉜다. 어느 쪽이든 버튼 모양·글자는 같고, 폴백일 때는 그 사실을 안내한다.
 */
export function PhotoCaptureButton({
  label,
  name = 'camera',
  disabled = false,
  accent = 'purple',
  tone = 'primary',
  className = '',
  multiple = false,
  maxSize,
  onFiles,
  onNotice,
}: PhotoCaptureButtonProps): JSX.Element {
  /* 서버(첫 렌더)에는 카메라를 알 수 없어 사진 선택기로 그린다 — 화면이 뜬 뒤 앱 카메라로 바뀐다 */
  const [supported, setSupported] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      setSupported(false)
      return
    }
    setSupported(
      inAppCameraSupported({
        mediaDevices: navigator.mediaDevices,
        isSecureContext: window.isSecureContext,
      }),
    )
  }, [])

  if (!supported) {
    return (
      <PhotoInputButton
        name={name}
        label={label}
        multiple={multiple}
        accent={accent}
        tone={tone}
        disabled={disabled}
        className={className}
        onFiles={onFiles}
        onPickClick={() => onNotice?.(CAMERA_FALLBACK_NOTICE)}
      />
    )
  }

  return (
    <>
      <div className={photoButtonClasses({ accent, tone, disabled, className })}>
        <span aria-hidden="true" className="pointer-events-none select-none whitespace-nowrap px-1 text-[12.5px] font-bold">
          {label}
        </span>
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          data-photo-capture={name}
          onClick={() => {
            onNotice?.(null)
            setOpen(true)
          }}
          className="absolute inset-0 h-full w-full cursor-pointer bg-transparent disabled:cursor-not-allowed"
        />
      </div>
      {open ? (
        <InAppCamera
          accent={accent}
          maxSize={maxSize}
          multiple={multiple}
          onFiles={onFiles}
          onNotice={onNotice}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}
