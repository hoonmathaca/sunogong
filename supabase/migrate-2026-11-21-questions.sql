-- =====================================================================
--  선오공 — 2026-11-21 추가 마이그레이션
--  '선오공에게 질문하기' (문제 사진 질문 + 선오공이 답변) Q&A 게시판
--
--  Supabase Dashboard > SQL Editor 에 이 파일을 그대로 붙여넣고 실행하세요.
--  여러 번 실행해도 안전하며, 기존 학생·공부 기록은 건드리지 않습니다.
--  (표·버킷을 없으면 만들고, 정책은 지웠다가 다시 만듭니다.)
--
--  · study_questions : 학생이 올린 질문(사진 + 한 줄 메모)과 선오공이의 답변
--  · Storage 버킷 question-images : 질문 사진, 답변 사진, 답변 동영상
--      (비공개 버킷입니다. 앱은 1시간짜리 서명 URL로만 사진·영상을 봅니다.)
--  · 답변은 사진뿐 아니라 짧은 동영상(MP4/WebM/MOV, 50MB 이하)도 올릴 수 있습니다.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. 질문 표
-- ---------------------------------------------------------------------
create table if not exists public.study_questions (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students (id) on delete cascade,
  memo              text,                                  -- 한 줄 질문 메모(없어도 됨)
  image_path        text not null,                         -- 질문 문제 사진 (Storage 경로)
  answer            text,                                  -- 선오공이 답변 글
  answer_media_path text,                                  -- 답변 사진/동영상 (Storage 경로)
  answered_at       timestamptz,                           -- 답변을 단 시각 (null 이면 답변 대기)
  answered_by       text not null default '선오공이',
  student_read_at   timestamptz,                           -- 학생이 답변을 연 시각 (새 답변 배지)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint study_questions_memo_len   check (memo is null or length(memo) <= 200),
  constraint study_questions_answer_len check (answer is null or length(answer) <= 2000)
);

-- 이미 이전 실행으로 표가 있으면 빠진 열을 채운다
alter table public.study_questions add column if not exists memo text;
alter table public.study_questions add column if not exists answer text;
alter table public.study_questions add column if not exists answer_media_path text;
alter table public.study_questions add column if not exists answered_at timestamptz;
alter table public.study_questions add column if not exists answered_by text not null default '선오공이';
alter table public.study_questions add column if not exists student_read_at timestamptz;
alter table public.study_questions add column if not exists updated_at timestamptz not null default now();

create index if not exists study_questions_student_idx
  on public.study_questions (student_id, created_at desc);

-- 답변 대기 질문을 빨리 찾기 (관리자 질문함 배지)
create index if not exists study_questions_waiting_idx
  on public.study_questions (created_at desc)
  where answer is null;

-- ---------------------------------------------------------------------
-- 2. Storage 버킷 — 질문 사진 · 답변 사진/동영상
--    비공개(public = false), 파일 1개 50MB 까지 (Supabase 무료 티어 상한)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-images',
  'question-images',
  false,
  52428800, -- 50MB
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/3gpp'
  ]
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- 3. 권한 · RLS
--    앱은 익명 키(anon)로 동작하고, 관리자 화면은 앱 안의 비밀번호로 입장합니다.
--    (students / study_sessions / study_logs 와 같은 방식)
-- ---------------------------------------------------------------------
alter table public.study_questions enable row level security;

drop policy if exists study_questions_anon_all on public.study_questions;
create policy study_questions_anon_all on public.study_questions
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.study_questions to anon, authenticated;

-- Storage 정책 — question-images 버킷 안의 파일만
drop policy if exists question_images_read   on storage.objects;
drop policy if exists question_images_insert on storage.objects;
drop policy if exists question_images_update on storage.objects;
drop policy if exists question_images_delete on storage.objects;

create policy question_images_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'question-images');

create policy question_images_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'question-images');

create policy question_images_update on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'question-images')
  with check (bucket_id = 'question-images');

create policy question_images_delete on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'question-images');

-- ---------------------------------------------------------------------
-- 4. 확인용 (주석을 풀어 실행해 보세요)
-- ---------------------------------------------------------------------
-- select count(*) from public.study_questions;                       -- 질문 수
-- select id, public, file_size_limit from storage.buckets where id = 'question-images';
-- select answer is null as waiting, count(*) from public.study_questions group by 1;
