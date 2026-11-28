/**
 * 창(모달)이 떠 있는 동안 body 스크롤을 잠그는 장치.
 *
 * 예전에는 창마다 `document.body.style.overflow` 를 직접 읽어 두고 닫을 때 그 값으로 되돌렸다.
 * 그런데 창이 두 겹(숙제 제출 창 + 사진 찍기 창)으로 뜨면
 *   · 나중에 뜬 창이 "원래 값 = hidden" 을 저장하고,
 *   · 화면이 다시 그려질 때마다(타이머는 1초마다 그린다) 그 저장 값이 다시 읽히면서
 *     먼저 뜬 창의 "원래 값" 도 hidden 으로 바뀌어,
 * 둘 다 닫힌 뒤에도 body 에 `overflow: hidden` 이 남았다.
 *
 * 2026-11-28 제보: 숙제 사진을 인앱 카메라로 찍어 제출한 뒤 홈 화면이 스크롤되지 않는
 * ("화면이 멈춤") 증상의 원인이다. 이제는 잠금 횟수를 세어
 *   · 처음 잠글 때의 값만 기억하고,
 *   · 마지막 창이 닫힐 때 한 번만 되돌린다.
 * 창이 몇 겹이든, 어떤 순서로 닫히든 원래대로 돌아온다.
 */

/** 잠글 대상 — 실제로는 document.body, 점검에서는 가짜 객체 */
export interface ScrollTarget {
  style: { overflow: string }
}

export interface ScrollLock {
  /** 창이 하나 떴다 */
  lock: () => void
  /** 창이 하나 닫혔다 */
  unlock: () => void
  /** 남은 잠금을 모두 풀고 처음 값으로 되돌린다 (화면이 통째로 바뀔 때의 안전장치) */
  reset: () => void
  /** 지금 잠겨 있는 창 수 */
  count: () => number
  /** 되돌릴 때 쓸, 처음 읽어 둔 값 */
  original: () => string | null
}

export function createScrollLock(readTarget: () => ScrollTarget | null): ScrollLock {
  let locks = 0
  let saved: string | null = null

  const restore = () => {
    const target = readTarget()
    if (target && saved !== null) target.style.overflow = saved
    saved = null
  }

  return {
    lock: () => {
      const target = readTarget()
      locks += 1
      if (locks > 1) return
      saved = target ? target.style.overflow : null
      if (target) target.style.overflow = 'hidden'
    },
    unlock: () => {
      if (locks === 0) return
      locks -= 1
      if (locks > 0) return
      restore()
    },
    reset: () => {
      if (locks === 0 && saved === null) return
      locks = 0
      restore()
    },
    count: () => locks,
    original: () => saved,
  }
}

/** 앱에서 쓰는 하나짜리 잠금 — 모든 창이 같은 것을 나눠 쓴다 */
export const bodyScrollLock: ScrollLock = createScrollLock(() =>
  typeof document === 'undefined' || !document.body ? null : document.body,
)
