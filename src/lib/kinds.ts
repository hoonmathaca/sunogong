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

/** '🏫 학원 공부' 같은 표시용 문구 */
export function kindText(value: unknown): string {
  const kind = normalizeKind(value)
  return `${KIND_EMOJI[kind]} ${KIND_LABEL[kind]}`
}
