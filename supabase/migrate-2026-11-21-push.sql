-- =====================================================================
--  선오공 — 2026-11-21 추가 마이그레이션
--  관리자 '새 질문 알림' (웹 푸시) — 알림 받는 기기 저장 + 질문 알림 발송 표시
--
--  Supabase Dashboard > SQL Editor 에 이 파일을 그대로 붙여넣고 실행하세요.
--  여러 번 실행해도 안전하며, 기존 학생·공부 기록·질문은 건드리지 않습니다.
--
--  · push_subscriptions : 알림을 켠 관리자 기기(브라우저 푸시 구독) 목록
--  · study_questions.push_notified_at : 그 질문으로 알림을 보냈는지 (한 질문에 한 번만)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. 알림 받는 기기 표
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,          -- 브라우저가 준 푸시 주소
  p256dh      text not null,                 -- 브라우저 공개 키
  auth        text not null,                 -- 브라우저 인증 비밀
  user_agent  text,                          -- 어느 기기인지 알아보기 쉽게
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_created_idx
  on public.push_subscriptions (created_at desc);

-- ---------------------------------------------------------------------
-- 2. 질문에 '알림 보냄' 표시 (같은 질문으로 두 번 알리지 않게)
-- ---------------------------------------------------------------------
alter table public.study_questions add column if not exists push_notified_at timestamptz;

-- ---------------------------------------------------------------------
-- 3. 권한 · RLS
--    앱과 알림 서버(Vercel 함수)가 익명 키(anon)로 동작합니다.
--    (students / study_questions 와 같은 방식)
-- ---------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_anon_all on public.push_subscriptions;
create policy push_subscriptions_anon_all on public.push_subscriptions
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.push_subscriptions to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. 확인용 (주석을 풀어 실행해 보세요)
-- ---------------------------------------------------------------------
-- select count(*) from public.push_subscriptions;                                  -- 알림 켠 기기 수
-- select count(*) from public.study_questions where push_notified_at is null;      -- 알림 안 보낸 질문
