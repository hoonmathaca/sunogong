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
  /** 칠성구를 합쳐 만든 무지개 볼 개수 (2026-11-21 추가 · 2026-11-22 부터 쓰지 않음) */
  rainbow_ball_count?: number
  /** 일반용 보유 맵 — {"red":0,...} (2026-11-22 추가) */
  dragons?: Record<string, number> | null
  /** 7색을 모두 모아 만든 무지개용 마리 수 (2026-11-22 추가) */
  rainbow_dragon_count?: number
  /** 사탕교환권 장 수 (2026-11-22 추가) */
  candy_tickets?: number
  /** 1,000포인트 교환권 장 수 (2026-11-22 추가) */
  point_1000_tickets?: number
  /** 10,000포인트 교환권 장 수 (2026-11-22 추가) */
  point_10000_tickets?: number
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
  /** 쉬는 시간이 60분을 넘어 자동 종료됐고 문제 수를 아직 입력받지 못했다 (2026-11-22 추가) */
  problems_pending?: boolean
  /** 일시정지 60분 경과로 자동 종료된 세션 (2026-11-22 추가) */
  auto_ended?: boolean
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

/** 일시정지 60분 경과 → 자동 종료 결과 (auto_end_paused_session) */
export interface AutoEndResult {
  session: StudySession | null
  log: StudyLog | null
  seconds: number
  minutes: number
  problems: number
  total_minutes: number
  total_problems: number
  date: string
  kind?: SessionKind
  /** 문제 수를 아직 입력받지 못했다 */
  problems_pending?: boolean
  /** 이번 요청으로 자동 종료됐다 */
  auto_ended?: boolean
  /** 이미 끝나 있던 세션 */
  already_finished?: boolean
  /** 쉬는 중이 아니라 자동 종료하지 않았다 */
  not_paused?: boolean
  /** 자정을 넘긴 공부라 기록하지 않고 버렸다 */
  discarded?: boolean
}

/** 자동 종료된 세션에 문제 수를 입력한 결과 (set_session_problems) */
export interface PendingProblemsResult {
  session: StudySession
  log: StudyLog | null
  problems: number
  minutes: number
  total_minutes: number
  total_problems: number
  date: string
  kind?: SessionKind
  problems_pending?: boolean
}
