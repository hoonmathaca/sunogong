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
  /** 아직 제출 전인 초안 줄 (사진·문제 수만 저장 — 목록에는 안 보인다) */
  draft_active?: boolean
  /** 초안에 입력해 둔 문제 수 */
  draft_problems?: number | null
  /** 제출 창이 열려 있었는지 (탭이 튕겨 다시 접속하면 그대로 다시 연다) */
  draft_open?: boolean
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
  /** 숙제 공부 — 선생님 승인을 기다리는 제출 (오늘 기록에 아직 반영 전) */
  pending_approval?: boolean
  /** 승인 대기로 넘긴 제출 줄 id */
  submission_id?: string | null
  submission?: HomeworkSubmission | null
  /** 승인할 것이 없었다 (1분도 공부하지 않았고 문제 수도 0) */
  nothing?: boolean
  /** 제출한 시간·문제 수 (승인 전 값) */
  submitted_minutes?: number | null
  submitted_problems?: number | null
}

/* ------------------------------------------------------------------ */
/* 숙제 공부 제출 (사진 인증 · 승인 대기) — 2026-11-23                 */
/* ------------------------------------------------------------------ */

/** 승인 대기 / 승인 / 반려 */
export type HomeworkStatus = 'pending' | 'approved' | 'rejected'
/** 시간·문항수 각각의 처리 결과 */
export type HomeworkVerdict = 'pending' | 'approved' | 'rejected'

/** 학생이 제출한 숙제 공부 한 건 */
export interface HomeworkSubmission {
  id: string
  student_id: string
  session_id: string | null
  date: string
  started_at: string | null
  ended_at: string | null
  /** 제출한 공부 시간(분) */
  submitted_minutes: number
  /** 제출한 문제 수 (자동 종료 뒤 아직 모르면 null) */
  submitted_problems: number | null
  /** 숙제 페이지 사진 경로 (homework-photos 버킷, 최대 5장) */
  photo_paths: string[]
  status: HomeworkStatus
  time_verdict: HomeworkVerdict
  problems_verdict: HomeworkVerdict
  /** 승인된 시간·문제 수 (반려한 항목은 0) */
  approved_minutes: number
  approved_problems: number
  reject_reason: string | null
  /** 승인할 때 원장님이 남긴 칭찬·응원 한마디 (학생 홈에 민트 박스로 보인다) */
  teacher_comment: string | null
  submitted_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  created_at: string
  updated_at: string
  /** 아직 제출 전인 초안 줄 (사진·문제 수만 저장 — 목록에는 안 보인다) */
  draft_active?: boolean
  /** 초안에 입력해 둔 문제 수 */
  draft_problems?: number | null
  /** 제출 창이 열려 있었는지 (탭이 튕겨 다시 접속하면 그대로 다시 연다) */
  draft_open?: boolean
  /** 관리자 목록에서 학생 이름·학년을 함께 읽는다 */
  students?: { name: string | null; grade: string | null } | { name: string | null; grade: string | null }[] | null
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
  /** 숙제 공부 — 승인 대기 제출을 만들었다 */
  pending_approval?: boolean
  submission_id?: string | null
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
