/** 공부 종류 — 학원 공부(academy) / 숙제 공부(homework) */
export type SessionKind = 'academy' | 'homework'

export const KIND_LABEL: Record<SessionKind, string> = {
  academy: '학원 공부',
  homework: '숙제 공부',
}

export const KIND_EMOJI: Record<SessionKind, string> = {
  academy: '🏫',
  homework: '🏠',
}

export function normalizeKind(value: unknown): SessionKind {
  return value === 'homework' ? 'homework' : 'academy'
}

/** 화면을 끄거나 다른 화면·앱으로 나가면 바로 멈추는 종류인지 (숙제 공부만 멈춘다) */
export function pausesOnLeave(value: unknown): boolean {
  return normalizeKind(value) === 'homework'
}

/**
 * 색 — 「학파 숙빨」 (2026-11-28 원장님 지시): 학원 공부 = 파랑 `#1D4A9B`, 숙제 공부 = 빨강 `#E0453E`.
 * 학생·관리자 화면의 버튼·배지·막대·범례·그림이 모두 이 값을 함께 쓴다.
 */
export const KIND_COLOR: Record<SessionKind, { base: string; text: string; soft: string; line: string }> = {
  academy: { base: '#1D4A9B', text: '#1D4A9B', soft: '#EEF4FF', line: '#C7D8F7' },
  homework: { base: '#E0453E', text: '#D9382F', soft: '#FFF1F0', line: '#F7C9C5' },
}

/** 그래프·막대 색 — 학원은 파랑, 숙제는 빨강 */
export const KIND_BAR_CLASS: Record<SessionKind, string> = {
  academy: 'bg-[#1D4A9B]',
  homework: 'bg-[#E0453E]',
}

/** 그래프에 쓰는 진한 글자색 */
export const KIND_TEXT_CLASS: Record<SessionKind, string> = {
  academy: 'text-[#1D4A9B]',
  homework: 'text-[#D9382F]',
}

/** 칩·카드 배경 (아주 연한 색) */
export const KIND_SOFT_CLASS: Record<SessionKind, string> = {
  academy: 'bg-[#EEF4FF]',
  homework: 'bg-[#FFF1F0]',
}

/** '🏫 학원 공부' 같은 표시용 문구 */
export function kindText(value: unknown): string {
  const kind = normalizeKind(value)
  return `${KIND_EMOJI[kind]} ${KIND_LABEL[kind]}`
}
