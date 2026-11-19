import type { SessionKind } from './kinds'

export interface Student {
  id: string
  name: string
  code: string
  grade: string
  created_at: string
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
