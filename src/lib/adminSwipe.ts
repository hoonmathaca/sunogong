/**
 * 관리자 화면 좌우 스와이프로 탭 이동 (모바일)
 *
 * 판정은 모두 순수 함수라 `tools/lib-test.ts` 에서 값을 넣어 검증한다.
 * 화면(`AdminApp`)은 손가락이 닿은 곳·떨어진 곳·가로로 넘길 수 있는 영역인지만 넘긴다.
 */

/**
 * 관리자 탭 순서 — 왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전
 * 2026-11-28 원장님 지시로 「실시간 → 공부기록 → 숙제관리 → 질문함 → 랭킹」 순서(훈출과 같게),
 * 관리자 화면을 열면 첫 탭은 「실시간」이다.
 */
export const ADMIN_TAB_ORDER = ['kintoun', 'dashboard', 'homework', 'questions', 'ranking'] as const
export type AdminTab = (typeof ADMIN_TAB_ORDER)[number]

/** 이만큼(px)은 밀어야 탭이 넘어간다 — 손가락이 살짝 흔들린 것은 무시 */
export const SWIPE_MIN_DISTANCE = 60
/** 가로 이동이 세로 이동의 이 배수보다 커야 한다 — 세로 스크롤과 구분 */
export const SWIPE_SLOPE_RATIO = 1.5
/** 표가 이만큼(px) 넘칠 때만 '가로로 넘기는 영역'으로 본다 */
export const SWIPE_SCROLL_SLACK = 4

/** 스와이프를 가로채면 안 되는 곳: 입력·선택·수정 가능한 곳, 모달·사진 확대, 직접 표시한 곳 */
export const SWIPE_BLOCKING_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  '[role="dialog"]',
  '[aria-modal="true"]',
  '[data-swipe-ignore]',
].join(',')

export type SwipeDirection = 'next' | 'prev'
export type SwipeBlockReason = 'blocked' | 'scroller'

export interface SwipePoint {
  x: number
  y: number
}

export interface SwipeGesture {
  dx: number
  dy: number
}

/** 시작·끝 지점 → 이동 거리 */
export function gestureFrom(start: SwipePoint, end: SwipePoint): SwipeGesture {
  return { dx: end.x - start.x, dy: end.y - start.y }
}

/**
 * 민 방향. 왼쪽으로 밀면(dx < 0) 다음 탭, 오른쪽으로 밀면 이전 탭.
 * 거리가 모자라거나 세로로 더 움직였으면 null (탭을 바꾸지 않는다).
 */
export function swipeDirection(
  gesture: SwipeGesture,
  minDistance: number = SWIPE_MIN_DISTANCE,
  slopeRatio: number = SWIPE_SLOPE_RATIO,
): SwipeDirection | null {
  const dx = Math.abs(gesture.dx)
  const dy = Math.abs(gesture.dy)
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
  if (dx < minDistance) return null
  if (dx <= dy * slopeRatio) return null
  return gesture.dx < 0 ? 'next' : 'prev'
}

/** 지금 탭에서 한 칸 옮긴 위치. 첫 탭에서 이전, 끝 탭에서 다음이면 null */
export function tabAfterSwipe(
  index: number,
  direction: SwipeDirection,
  count: number = ADMIN_TAB_ORDER.length,
): number | null {
  if (!Number.isInteger(index) || index < 0 || index >= count) return null
  const next = direction === 'next' ? index + 1 : index - 1
  return next >= 0 && next < count ? next : null
}

/**
 * 이 칸이 가로로 넘칠 만큼 넓은가 (표·탭 줄에서 좌우로 넘기는 중이면 탭을 바꾸지 않는다)
 * 세로로만 넘치는 상자(overflow-y-auto)는 해당 없음.
 */
export function isHorizontalScroller(box: { scrollWidth?: number; clientWidth?: number } | null | undefined): boolean {
  if (!box) return false
  const scrollWidth = box.scrollWidth
  const clientWidth = box.clientWidth
  if (typeof scrollWidth !== 'number' || typeof clientWidth !== 'number') return false
  return scrollWidth - clientWidth > SWIPE_SCROLL_SLACK
}

function matchesSelector(node: SwipeNode, selector: string): boolean {
  const matches = node.matches
  if (typeof matches !== 'function') return false
  try {
    return matches.call(node, selector)
  } catch {
    return false
  }
}

/** 스와이프 대상·조상 중에 DOM 노드로 필요한 부분만 */
export interface SwipeNode {
  parentElement?: SwipeNode | null
  matches?: (selector: string) => boolean
  scrollWidth?: number
  clientWidth?: number
}

/**
 * 손가락이 닿은 곳에서 위로 올라가며 스와이프를 가로챌 곳을 찾는다.
 * `stopAt`(스와이프를 거는 컨테이너)에서 멈추므로 바깥 영역은 살피지 않는다.
 */
export function swipeBlockReason(
  target: SwipeNode | null | undefined,
  stopAt: SwipeNode | null | undefined = null,
): SwipeBlockReason | null {
  let node: SwipeNode | null = target ?? null
  for (let depth = 0; node && depth < 64; depth += 1) {
    if (node === stopAt) break
    if (matchesSelector(node, SWIPE_BLOCKING_SELECTOR)) return 'blocked'
    if (isHorizontalScroller(node)) return 'scroller'
    node = node.parentElement ?? null
  }
  return null
}

export interface SwipeInput extends SwipeGesture {
  /** 지금 탭 위치 */
  index: number
  /** 탭 개수 (기본: 관리자 탭 5개) */
  count?: number
  /** 입력창·모달·가로 스크롤 안에서 시작했으면 true */
  blocked?: boolean
}

/** 스와이프 결과로 옮길 탭 위치. 바꿀 것이 없으면 null */
export function resolveTabSwipe(input: SwipeInput): number | null {
  if (input.blocked) return null
  const direction = swipeDirection(input)
  if (!direction) return null
  return tabAfterSwipe(input.index, direction, input.count ?? ADMIN_TAB_ORDER.length)
}

/** 손가락 하나로 시작한 경우에만 스와이프로 본다 (두 손가락 확대·스크롤 제외) */
export function isSingleTouch(touchCount: number): boolean {
  return touchCount === 1
}
