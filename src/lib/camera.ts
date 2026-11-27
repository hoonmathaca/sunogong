/**
 * 앱 안에서 찍는 카메라(in-app camera)에 쓰는 순수 함수와 문구.
 *
 * 안드로이드 크롬에서 `<input type="file" capture="environment">` 로 폰 기본 카메라 앱을 띄우면,
 * 카메라 앱이 메모리를 크게 쓰면서 뒤에 있던 크롬(파일 선택 액티비티)이 OS 에게 회수되고,
 * 돌아올 때 「메모리가 부족하여 이전 작업을 완료할 수 없습니다.」 가 뜨며 찍은 사진이 사라진다.
 *
 * 그래서 「📷 바로 찍기」는 브라우저 화면 안에서 `getUserMedia` 로 카메라를 열고,
 * 셔터 → 미리 보기 확인(다시 찍기) → 줄여서 올리기로 끝낸다(화면을 벗어나지 않는다).
 * 카메라를 못 여는 기기(권한 거부·미지원)에서만 `<input type="file" accept="image/*">` 로 넘어간다.
 */
import { fitInside } from './questionBoard'

/** 요청할 카메라 화면 크기 — 폰 화면에 보여 주고 한 장 찍기에 충분한 만큼만 받는다(메모리 절약) */
export const CAMERA_FRAME_WIDTH = 1280
export const CAMERA_FRAME_HEIGHT = 960
/** 찍은 사진의 긴 쪽 최대 픽셀 (숙제 사진과 같은 1200px) */
export const CAMERA_SHOT_MAX_SIZE = 1200
/** 찍은 사진을 JPEG 로 담을 때의 품질 (올릴 때 한 번 더 줄이므로 조금 높게) */
export const CAMERA_SHOT_QUALITY = 0.82

/* 화면에 보이는 버튼 이름 — 숙제 사진 고르기의 「📷 바로 찍기」는 그대로 두고, 창 안에서만 쓴다 */
export const CAMERA_SHUTTER_LABEL = '📸 찍기'
export const CAMERA_RETAKE_LABEL = '🔄 다시 찍기'
export const CAMERA_USE_LABEL = '이대로 올리기'
export const CAMERA_FALLBACK_LABEL = '🖼️ 사진 선택기로 고르기'
export const CAMERA_OPENING_TEXT = '카메라를 여는 중…'
export const CAMERA_HINT_TEXT = '찍고 나서 한 번 더 확인해요. 사진은 화면에 맞게 줄여서 올라가요.'
export const CAMERA_SAVING_TEXT = '찍은 사진을 준비하는 중…'

/** 앱 카메라를 못 쓸 때 사진 선택기로 넘어가며 남기는 안내 */
export const CAMERA_FALLBACK_NOTICE =
  '이 기기에서는 앱 카메라를 쓸 수 없어 사진 선택기로 열었어요. 사진을 고르거나 카메라로 찍어 주세요.'

/** 카메라를 여는 중에 화면을 벗어났을 때(앱 전환·화면 꺼짐) 남기는 안내 */
export const CAMERA_PAUSED_NOTICE = '카메라를 잠시 멈쳤어요. 화면으로 돌아오면 다시 열어요. 안 열리면 「다시 열기」를 눌러 주세요.'

/** 앱 카메라를 쓸 수 있는 환경인지 (getUserMedia + https/PWA 보안 환경) */
export interface CameraEnv {
  mediaDevices?: { getUserMedia?: unknown } | null
  isSecureContext?: boolean
}

export function inAppCameraSupported(env: CameraEnv | null | undefined): boolean {
  if (!env) return false
  if (env.isSecureContext === false) return false
  return typeof env.mediaDevices?.getUserMedia === 'function'
}

/** 브라우저에 요청할 카메라 조건 — 뒤쪽(environment) 카메라, 1280×960 정도, 소리 없음 */
export function cameraConstraints(): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: CAMERA_FRAME_WIDTH },
      height: { ideal: CAMERA_FRAME_HEIGHT },
    },
  }
}

/** getUserMedia 가 낸 오류 이름 (DOMException.name) */
export function cameraErrorName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = (error as { name?: unknown }).name
    return typeof name === 'string' ? name : ''
  }
  return ''
}

/** 카메라를 못 열었을 때 화면에 남길 말 — 무엇을 하면 되는지 함께 알려 준다 */
export function cameraErrorMessage(error: unknown): string {
  switch (cameraErrorName(error)) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return '카메라 권한이 꺼져 있어요. 브라우저에서 카메라를 허용하거나 사진 선택기로 골라 주세요.'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return '카메라를 찾지 못했어요. 사진 선택기로 골라 주세요.'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return '카메라를 열지 못했어요(다른 앱이 쓰고 있을 수 있어요). 사진 선택기로 골라 주세요.'
    default:
      return '카메라를 열지 못했어요. 사진 선택기로 골라 주세요.'
  }
}

/** 찍은 화면(비디오) 크기 → 올릴 사진 크기 (긴 쪽 maxSize 이하) */
export function cameraFrameSize(
  width: number,
  height: number,
  maxSize: number = CAMERA_SHOT_MAX_SIZE,
): { width: number; height: number } {
  return fitInside(width, height, maxSize)
}

/** 찍은 사진 파일 이름 — camera-20261128-083412.jpg */
export function cameraShotFileName(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const date = Number.isFinite(now.getTime()) ? now : new Date(0)
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `camera-${day}-${time}.jpg`
}
