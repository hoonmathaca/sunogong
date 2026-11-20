/**
 * 새 질문 웹 푸시 알림 — Vercel Serverless Function (POST /api/notify-question)
 *
 *  · 학생이 질문을 올리면  { questionId }  를 받아 push_subscriptions 의 모든 기기로 알림을 보낸다.
 *  · 관리자 화면의 '테스트 알림 보내기'는  { test: true } + x-sunogong-admin 머리글(관리자 비밀번호).
 *  · 만료된 구독(404/410)은 표에서 지운다.
 *
 *  필요한 Vercel 환경변수
 *    VAPID_PRIVATE_KEY  (필수, 비밀) — web-push generate-vapid-keys 의 privateKey
 *    VAPID_PUBLIC_KEY   (선택) — 비어 있으면 아래 DEFAULT_VAPID_PUBLIC_KEY 사용
 *    VAPID_SUBJECT      (선택) — 기본 mailto:illkg1@gmail.com
 *    VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — 앱과 같은 값(이미 설정되어 있음)
 *
 *  추가 요금 없음: Vercel Hobby 무료 실행 한도 안에서 동작한다.
 */
import { sendNotification, setVapidDetails } from 'web-push'

/** src/lib/pushBoard.ts 의 VAPID_PUBLIC_KEY 와 같은 값이어야 한다 */
const DEFAULT_VAPID_PUBLIC_KEY =
  'BAHw0qEKNdHLWAV5wakdHeHQr3OsQY_bjpS4T1KC4HY2mbu2ELjJgMx4JZfGEsj9rYMT1zziJja-VFq_rqNJpZg'
const DEFAULT_VAPID_SUBJECT = 'mailto:illkg1@gmail.com'
const PUSH_TITLE = '선오공 새 질문'
const PUSH_URL = '/admin?tab=questions'
const ADMIN_HEADER = 'x-sunogong-admin'

/* Vercel(Node) 런타임 최소 타입 — @types/node 없이도 빌드되도록 직접 적는다 */
declare const process: { env: Record<string, string | undefined> }
declare const fetch: (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>

interface ApiRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

interface ApiResponse {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
}

interface PushSubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

interface StudyQuestionRow {
  id: string
  memo: string | null
  push_notified_at: string | null
  students?: { name: string | null } | { name: string | null }[] | null
}

function env(name: string): string {
  return (process.env[name] ?? '').trim()
}

function supabaseConfig(): { url: string; key: string } {
  const url = (env('VITE_SUPABASE_URL') || env('SUPABASE_URL')).replace(/\/+$/, '')
  const key = env('VITE_SUPABASE_ANON_KEY') || env('SUPABASE_ANON_KEY')
  return { url, key }
}

function adminPassword(): string {
  return env('VITE_ADMIN_PASSWORD') || env('ADMIN_PASSWORD') || '0801'
}

function headerValue(req: ApiRequest, name: string): string {
  const raw = req.headers?.[name] ?? req.headers?.[name.toLowerCase()]
  if (Array.isArray(raw)) return (raw[0] ?? '').trim()
  return (raw ?? '').trim()
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function readBody(req: ApiRequest): Record<string, unknown> {
  const body = req.body
  if (!body) return {}
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  if (typeof body === 'object') return body as Record<string, unknown>
  return {}
}

function studentNameOf(row: StudyQuestionRow): string {
  const students = row.students
  const first = Array.isArray(students) ? students[0] : students
  return (first?.name ?? '').trim()
}

function questionBody(studentName: string): string {
  return studentName ? `${studentName} 학생이 질문을 올렸어요!` : '학생이 질문을 올렸어요!'
}

async function restRequest(
  path: string,
  init: { method: string; body?: string; prefer?: string },
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const { url, key } = supabaseConfig()
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: init.method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init.body,
  })
  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  return { ok: response.ok, status: response.status, data }
}

async function listSubscriptions(): Promise<PushSubscriptionRow[]> {
  const res = await restRequest('push_subscriptions?select=id,endpoint,p256dh,auth', { method: 'GET' })
  if (!res.ok) throw new Error(`subscriptions_read_failed_${res.status}`)
  return Array.isArray(res.data) ? (res.data as PushSubscriptionRow[]) : []
}

async function readQuestion(questionId: string): Promise<StudyQuestionRow | null> {
  const res = await restRequest(
    `study_questions?id=eq.${encodeURIComponent(questionId)}&select=id,memo,push_notified_at,students(name)`,
    { method: 'GET' },
  )
  if (!res.ok) throw new Error(`question_read_failed_${res.status}`)
  const rows = Array.isArray(res.data) ? (res.data as StudyQuestionRow[]) : []
  return rows[0] ?? null
}

/** 같은 질문으로 두 번 알리지 않도록 한 번만 표시한다 (동시에 두 번 와도 한 번만 성공) */
async function markNotified(questionId: string): Promise<boolean> {
  const res = await restRequest(
    `study_questions?id=eq.${encodeURIComponent(questionId)}&push_notified_at=is.null`,
    {
      method: 'PATCH',
      body: JSON.stringify({ push_notified_at: new Date().toISOString() }),
      prefer: 'return=representation',
    },
  )
  if (!res.ok) throw new Error(`question_mark_failed_${res.status}`)
  return Array.isArray(res.data) && res.data.length > 0
}

async function deleteSubscription(id: string): Promise<void> {
  const res = await restRequest(`push_subscriptions?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) console.warn('[sunogong] 만료된 알림 구독 정리 실패:', res.status)
}

interface SendResult {
  sent: number
  removed: number
  failed: number
  devices: number
}

async function sendToAll(subscriptions: PushSubscriptionRow[], payload: Record<string, unknown>): Promise<SendResult> {
  const body = JSON.stringify(payload)
  let sent = 0
  let removed = 0
  let failed = 0

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          body,
          { TTL: 60 * 60 * 12, urgency: 'high' },
        )
        sent += 1
      } catch (error) {
        const statusCode = (error as { statusCode?: number } | null)?.statusCode ?? null
        if (statusCode === 404 || statusCode === 410) {
          removed += 1
          await deleteSubscription(subscription.id)
          return
        }
        failed += 1
        console.warn('[sunogong] 알림 보내기 실패:', statusCode, (error as { body?: string } | null)?.body ?? '')
      }
    }),
  )

  return { sent, removed, failed, devices: subscriptions.length }
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const { url, key } = supabaseConfig()
  if (!url || !key) {
    res.status(500).json({ ok: false, error: 'supabase_not_configured' })
    return
  }

  const vapidPrivateKey = env('VAPID_PRIVATE_KEY')
  if (!vapidPrivateKey) {
    res.status(503).json({ ok: false, error: 'push_not_configured' })
    return
  }

  try {
    setVapidDetails(
      env('VAPID_SUBJECT') || DEFAULT_VAPID_SUBJECT,
      env('VAPID_PUBLIC_KEY') || DEFAULT_VAPID_PUBLIC_KEY,
      vapidPrivateKey,
    )
  } catch (error) {
    console.warn('[sunogong] VAPID 설정 오류:', error)
    res.status(503).json({ ok: false, error: 'push_not_configured' })
    return
  }

  const body = readBody(req)

  /* 관리자 '테스트 알림 보내기' */
  if (body.test === true) {
    if (headerValue(req, ADMIN_HEADER) !== adminPassword()) {
      res.status(401).json({ ok: false, error: 'unauthorized' })
      return
    }
    try {
      const subscriptions = await listSubscriptions()
      const result = await sendToAll(subscriptions, {
        title: PUSH_TITLE,
        body: '알림이 잘 도착해요! 새 질문이 올라오면 이렇게 알려 드릴게요.',
        url: PUSH_URL,
        tag: `sunogong-test-${Date.now()}`,
        test: true,
      })
      res.status(200).json({ ok: true, test: true, ...result })
    } catch (error) {
      console.warn('[sunogong] 테스트 알림 실패:', error)
      res.status(500).json({ ok: false, error: 'push_failed' })
    }
    return
  }

  /* 학생이 질문을 올렸을 때 */
  const questionId = String(body.questionId ?? '').trim()
  if (!isUuid(questionId)) {
    res.status(400).json({ ok: false, error: 'invalid_question' })
    return
  }

  try {
    const question = await readQuestion(questionId)
    if (!question) {
      res.status(404).json({ ok: false, error: 'question_not_found' })
      return
    }
    if (question.push_notified_at) {
      res.status(200).json({ ok: true, skipped: true, sent: 0, removed: 0, failed: 0, devices: 0 })
      return
    }
    const firstTime = await markNotified(questionId)
    if (!firstTime) {
      res.status(200).json({ ok: true, skipped: true, sent: 0, removed: 0, failed: 0, devices: 0 })
      return
    }

    const subscriptions = await listSubscriptions()
    const result = await sendToAll(subscriptions, {
      title: PUSH_TITLE,
      body: questionBody(studentNameOf(question)),
      url: PUSH_URL,
      tag: `sunogong-question-${questionId}`,
    })
    res.status(200).json({ ok: true, ...result })
  } catch (error) {
    console.warn('[sunogong] 새 질문 알림 실패:', error)
    res.status(500).json({ ok: false, error: 'push_failed' })
  }
}
