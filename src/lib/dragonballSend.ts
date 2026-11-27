/**
 * 달력·오늘 공부 이력에서 드래곤볼을 쏠 때 쓰는 문구·지급 도우미 (2026-11-28).
 *
 * · 학원공부 일괄 / 숙제공부 일괄 / 학생 한 명 — 세 경우의 확인·결과 문구
 * · 지급 이력(dragonball_grants.note)에 남길 짧은 메모
 * 화면과 분리해 두어 단위 테스트로 문구를 확인한다.
 */
import { grantDragonballs, type GrantResult } from './kintoun'
import { starListText } from './kintounBoard'
import type { ApiResult } from './api'
import type { SessionKind } from './kinds'
import { formatDateShort } from './time'

/** 확인·결과 문구에 쓰는 이름 */
export const SEND_KIND_LABEL: Record<SessionKind, string> = {
  academy: '🏫 학원공부',
  homework: '🏠 숙제공부',
}

/** 같은 학생이 두 번 들어가지 않게 (학원·숙제 양쪽에 있어도 한 번만) */
export function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))]
}

/** 일괄 쏘기 확인 — '🏫 학원공부한 12명에게 드래곤볼 1개씩 쏠까요?' */
export function bulkConfirmText(kind: SessionKind, count: number, amount: number): string {
  return `${SEND_KIND_LABEL[kind]}한 ${count}명에게 드래곤볼 ${amount}개씩 쏠까요?`
}

/** 일괄 쏘기 결과 — '🏫 학원공부 12명에게 드래곤볼 1개씩 쏘았어요!' */
export function bulkSentText(kind: SessionKind, granted: number, amount: number): string {
  if (granted <= 0) return '드래곤볼을 받을 학생이 없어요.'
  return `${SEND_KIND_LABEL[kind]} ${granted}명에게 드래곤볼 ${amount}개씩 쏘았어요!`
}

/** 개별 쏘기 결과 — '드래곤볼 1개 — 4성구 · 7성구' */
export function individualSentText(amount: number, stars?: readonly number[] | null): string {
  const got = starListText(stars)
  return got ? `드래곤볼 ${amount}개 — ${got}` : `드래곤볼 ${amount}개를 쏘았어요.`
}

/** 지급 이력 메모 — '학원공부 일괄 (11/25)' · '숙제공부 개별' */
export function sendNote(kind: SessionKind, date?: string | null, individual = false): string {
  const when = date ? ` (${formatDateShort(date)})` : ''
  return `${SEND_KIND_LABEL[kind].replace(/^[^ ]+ /, '')} ${individual ? '개별' : '일괄'}${when}`
}

export interface SendDragonballsOptions {
  kind: SessionKind
  /** 날짜(있으면 메모에 남긴다) */
  date?: string | null
  /** 한 명에게 보낼 때 그 학생 이름 (메모에 남긴다) */
  individualName?: string | null
}

/** 드래곤볼 지급 — 모드(all/single)와 메모를 여기서 정한다 */
export function sendDragonballs(
  studentIds: readonly string[],
  amount: number,
  options: SendDragonballsOptions,
): Promise<ApiResult<GrantResult>> {
  const ids = uniqueIds(studentIds)
  if (ids.length === 0) return Promise.resolve({ ok: false, error: '드래곤볼을 받을 학생이 없어요.' })
  const individual = ids.length === 1
  const note = individual
    ? options.individualName?.trim() || sendNote(options.kind, options.date, true)
    : sendNote(options.kind, options.date, false)
  return grantDragonballs(ids, amount, individual ? 'single' : 'all', note)
}
