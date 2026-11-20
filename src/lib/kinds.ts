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

/** 그래프·막대 색 — 학원은 남색, 숙제는 보라색(숙제 시작 버튼과 같은 색) */
export const KIND_BAR_CLASS: Record<SessionKind, string> = {
  academy: 'bg-navy',
  homework: 'bg-[#6D3BD6]',
}

/** 그래프에 쓰는 진한 글자색 */
export const KIND_TEXT_CLASS: Record<SessionKind, string> = {
  academy: 'text-navy',
  homework: 'text-[#5B2FC0]',
}

/** 칩·카드 배경 (아주 연한 색) */
export const KIND_SOFT_CLASS: Record<SessionKind, string> = {
  academy: 'bg-blue-soft',
  homework: 'bg-[#EDE4FF]',
}

/** '🏫 학원 공부' 같은 표시용 문구 */
export function kindText(value: unknown): string {
  const kind = normalizeKind(value)
  return `${KIND_EMOJI[kind]} ${KIND_LABEL[kind]}`
}
