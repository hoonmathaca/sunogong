/**
 * 질문 사진을 올리기 전에 브라우저(Canvas)에서 줄이고 JPEG 로 바꾼다.
 * 요즘 휴대폰 사진은 한 장에 3~8MB 라 그대로 올리면 느리고 저장 공간도 금방 찬다.
 */
import { fitInside } from './questionBoard'

export interface PrepareImageOptions {
  /** 긴 쪽 최대 픽셀 (기본 1400px) */
  maxSize?: number
  /** JPEG 품질 0~1 (기본 0.82) */
  quality?: number
}

export interface PreparedImage {
  blob: Blob
  /** 올릴 때 쓸 MIME 타입 */
  type: string
  width: number
  height: number
  /** 실제로 줄였는지 (원본을 그대로 쓰면 false) */
  compressed: boolean
}

const DEFAULT_MAX_SIZE = 1400
const DEFAULT_QUALITY = 0.82

interface LoadedImage {
  image: CanvasImageSource
  width: number
  height: number
  release: () => void
}

async function loadImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }
    } catch {
      /* 사파리 구버전 등 — 아래 <img> 방식으로 */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('image_decode_failed'))
      element.src = url
    })
    return {
      image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      release: () => URL.revokeObjectURL(url),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
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

/**
 * 질문 사진 준비 — 긴 쪽을 maxSize 로 줄이고 JPEG 로 다시 저장한다.
 * (사진에 들어 있는 위치 정보 같은 촬영 정보도 함께 사라진다)
 * 브라우저가 사진을 읽지 못하면 원본을 그대로 돌려준다.
 */
export async function prepareQuestionImage(
  file: File,
  options: PrepareImageOptions = {},
): Promise<PreparedImage> {
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE
  const quality = options.quality ?? DEFAULT_QUALITY
  const asIs = (): PreparedImage => ({
    blob: file,
    type: file.type || 'image/jpeg',
    width: 0,
    height: 0,
    compressed: false,
  })

  if (typeof document === 'undefined' || typeof URL === 'undefined') return asIs()

  let loaded: LoadedImage
  try {
    loaded = await loadImage(file)
  } catch {
    // 읽지 못하는 형식(예: 아이폰 HEIC 를 브라우저가 못 여는 경우)은 원본으로 올린다
    return asIs()
  }

  try {
    const size = fitInside(loaded.width, loaded.height, maxSize)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) return asIs()
    context.drawImage(loaded.image, 0, 0, size.width, size.height)
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    if (!blob) return asIs()

    // 이미 작은 JPEG 이고 다시 저장한 것이 더 크면 원본을 쓴다
    const alreadySmall = loaded.width <= maxSize && loaded.height <= maxSize
    if (alreadySmall && file.type === 'image/jpeg' && blob.size >= file.size) {
      return { ...asIs(), width: loaded.width, height: loaded.height }
    }
    return { blob, type: 'image/jpeg', width: size.width, height: size.height, compressed: true }
  } catch {
    return asIs()
  } finally {
    loaded.release()
  }
}
