import type { SessionKind } from './kinds'

export interface Student {
  id: string
  name: string
  code: string
  grade: string
  created_at: string
  /** 실명 대신 보여 줄 별명 (2026-11-21 추가, 없으면 '수련생') */
  nickname?: string | null
  /** 받은 드래곤볼 개수 (제한 없이 누적) */
  dragonball_count?: number
  /** 성구별 보유 개수 맵 — {"1":0,...,"7":0} (2026-11-21 추가) */
  dragonballs?: Record<string, number> | null
}

export type SessionStatus = 'running' | 'paused' | 'finished'

export interface StudySession {
  id: string
  student_id: string
  status: SessionStatus
  /** 학원 공부 / 숙제 공부 (DB 마이그레이션 전에는 없을 수 있다) */
  kind?: SessionKind
  started_at: string
  paused_at: string | null
  ended_at: string | null
  last_heartbeat_at: string
  paused_seconds: number
  auto_pause_count: number
  auto_paused_seconds: number
  date: string
  minutes: number | null
  problems: number | null
  created_at: string
}

export interface StudyLog {
  id: string
  student_id: string
  date: string
  minutes: number
  problems: number
  /** 학원/숙제 구분 집계 (DB 마이그레이션 전에는 없을 수 있다) */
  academy_minutes?: number
  academy_problems?: number
  homework_minutes?: number
  homework_problems?: number
  updated_at: string
}

/* ------------------------------------------------------------------ */
/* '선오공에게 질문하기' Q&A                                            */
/* ------------------------------------------------------------------ */

/** 학생이 올린 질문 + 선오공이의 답변 */
export interface StudyQuestion {
  id: string
  student_id: string
  /** 한 줄 질문 메모 (없을 수 있다) */
  memo: string | null
  /** 질문 문제 사진의 Storage 경로 */
  image_path: string
  /** 선오공이 답변 글 (없으면 답변 대기) */
  answer: string | null
  /** 답변에 붙인 사진·동영상의 Storage 경로 */
  answer_media_path: string | null
  /** 답변을 단 시각 (null 이면 답변 대기) */
  answered_at: string | null
  answered_by: string | null
  /** 학생이 답변을 연 시각 (null 이면 새 답변) */
  student_read_at: string | null
  created_at: string
  updated_at: string
  /** 관리자 목록에서 학생 이름·학년을 함께 읽는다 */
  students?: { name: string | null; grade: string | null } | { name: string | null; grade: string | null }[] | null
}

export interface HeartbeatResult {
  session: StudySession
  server_now: string
}

export interface FinishResult {
  session: StudySession
  log: StudyLog | null
  seconds: number
  minutes: number
  problems: number
  total_minutes: number
  total_problems: number
  date: string
  kind?: SessionKind
  discarded?: boolean
}
