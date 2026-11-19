import { createClient } from '@supabase/supabase-js'

const rawUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

/** .env 에 Supabase 주소/키가 채워졌는지 */
export const isSupabaseConfigured = Boolean(rawUrl && rawKey)

const url = /^https?:\/\/.+/.test(rawUrl) ? rawUrl : 'https://placeholder.supabase.co'
const key = rawKey || 'placeholder-anon-key'

/** 페이지를 떠나는 순간(keepalive 요청)에도 쓸 수 있게 그대로 내보낸다 */
export const SUPABASE_URL = url.replace(/\/+$/, '')
export const SUPABASE_ANON_KEY = key

/**
 * Supabase 클라이언트.
 * 값이 비어 있어도 앱이 죽지 않도록 자리표시자로 만들고, 화면에서 안내 문구를 보여준다.
 */
export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'x-application-name': 'sunogong' } },
})

/** 관리자 입장 비밀번호 (VITE_ADMIN_PASSWORD 로 바꿀 수 있고, 기본값은 0801) */
export const ADMIN_PASSWORD = (import.meta.env.VITE_ADMIN_PASSWORD ?? '0801').trim() || '0801'
