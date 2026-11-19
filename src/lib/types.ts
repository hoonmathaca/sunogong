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
}
