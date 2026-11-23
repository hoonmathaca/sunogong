/**
 * 사진을 올리기 전에 브라우저(Canvas)에서 줄이고 JPEG 로 바꾼다.
 * 요즘 휴대폰 사진은 한 장에 3~8MB, 12~50MP 라 그대로 열면 메모리가 크게 늘어난다.
 *
 * 안드로이드 크롬에서 카메라로 찍은 원본을 그냥 디코딩하면 탭이 메모리 부족으로
 * 강제 새로고침(튕김)될 수 있어서, 큰 파일은 `createImageBitmap(file, { resizeWidth })`
 * 로 **디코딩 단계에서 바로 줄인다**(하드웨어 다운스케일 — 메모리가 1/10 수준).
 * 줄인 비트맵·캔버스는 쓰자마자 닫고(close / width=0) 미리보기 주소도 돌려준다.
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
/**
 * 이보다 작은 파일은 원본 해상도로 열어도 메모리가 몇 MB 라 안전하다.
 * (큰 사진만 디코딩 단계에서 줄인다 — 작은 사진을 억지로 늘리지 않는다)
 */
const SMALL_FILE_BYTES = 400 * 1024
/** 아주 세로로 긴 사진에서 resizeWidth 가 오히려 늘리는 경우를 걸러내는 기준 */
const TALL_RATIO = 2.5

interface LoadedImage {
  image: CanvasImageSource
  width: number
  height: number
  release: () => void
}

interface BitmapOptions {
  resizeWidth?: number
  resizeHeight?: number
  resizeQuality?: 'low' | 'medium' | 'high'
  imageOrientation?: 'from-image' | 'flipY' | 'none'
}

async function decodeBitmap(file: File, options?: BitmapOptions) {
  return (await createImageBitmap(file, options as ImageBitmapOptions)) as ImageBitmap
}

/**
 * 사진 파일을 메모리에 올린다 (가능하면 디코딩하며 줄여서).
 * 큰 파일은 가로 기준으로 먼저 줄이고, 아주 세로로 긴 사진이면 세로 기준으로 다시 줄인다.
 */
async function loadImage(file: File, maxSize: number): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const big = file.size > SMALL_FILE_BYTES
      let bitmap = big
        ? await decodeBitmap(file, { resizeWidth: maxSize, resizeQuality: 'medium', imageOrientation: 'from-image' })
        : await decodeBitmap(file, { imageOrientation: 'from-image' })

      // 세로로 아주 긴 사진(파노라마)은 가로 기준 축소가 오히려 키운다 → 세로 기준으로 다시 줄인다
      if (big && bitmap.width >= maxSize && bitmap.height > maxSize * TALL_RATIO) {
        bitmap.close()
        bitmap = await decodeBitmap(file, { resizeHeight: maxSize, resizeQuality: 'medium', imageOrientation: 'from-image' })
      }

      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => {
          try {
            bitmap.close()
          } catch {
            /* 이미 닫혔다 */
          }
        },
      }
    } catch {
      /* 사파리 구버전 등 — 아래 <img> 방식으로 */
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.decoding = 'async'
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('image_decode_failed'))
      element.src = url
    })
    return {
      image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      release: () => {
        image.src = ''
        URL.revokeObjectURL(url)
      },
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
 * 질문·숙제 사진 준비 — 긴 쪽을 maxSize 로 줄이고 JPEG 로 다시 저장한다.
 * (사진에 들어 있는 위치 정보 같은 촬영 정보도 함께 사라진다)
 * 브라우저가 사진을 읽지 못하면 원본을 그대로 돌려준다.
 * 한 번에 한 장씩 부르세요(여러 장을 Promise.all 로 동시에 열면 메모리가 두 배가 된다).
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

  let loaded: LoadedImage
  try {
    loaded = await loadImage(file, maxSize)
  } catch {
    // 읽지 못하는 형식(예: 아이폰 HEIC 를 브라우저가 못 여는 경우)은 원본으로 올린다
    return asIs()
  }

  let canvas: HTMLCanvasElement | null = null
  try {
    const size = fitInside(loaded.width, loaded.height, maxSize)
    canvas = document.createElement('canvas')
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
    // 메모리 바로 풀기 — 캔버스 픽셀과 디코딩한 비트맵을 붙잡고 있지 않는다
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
    loaded.release()
  }
}
