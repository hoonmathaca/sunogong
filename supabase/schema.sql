-- =====================================================================
--  선오공 (훈수학학원 공부 기록) — Supabase 스키마
--  Supabase Dashboard > SQL Editor 에서 이 파일을 그대로 실행하세요.
--  여러 번 실행해도 안전하도록 작성했습니다.
--
--  · 모든 날짜·시간은 한국 시간(Asia/Seoul) 기준으로 계산합니다.
--  · 타이머의 시작/일시정지/계속/종료 시각은 모두 서버 now() 로 저장하고,
--    공부 시간 계산도 서버 함수가 합니다.
--  · 하루의 공부는 그 날 자정(한국 시간 00:00) 전에 종료를 눌러야 기록됩니다.
--    자정을 넘긴 세션은 study_logs 에 남기지 않고 버립니다(삭제).
--  · 화면 꺼짐은 공부 종류에 따라 다릅니다.
--    · 학원 공부(academy): 화면을 끄거나 앱을 잠깐 벗어나도 타이머가 멈추지 않습니다(공부 시간으로 인정).
--    · 숙제 공부(homework): 화면을 끄거나 나가면 즉시 일시정지합니다.
--      (클라이언트가 pause_session 을 보내고, 신호가 끊기면 서버도 30초 뒤 일시정지)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------

create table if not exists public.students (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) > 0),
  code       text not null check (code ~ '^[0-9]{4}$'),   -- 앞자리 0 유지: 문자열 4자리
  grade      text not null default '미지정',
  created_at timestamptz not null default now()
);

create index if not exists students_code_idx on public.students (code);

create table if not exists public.study_sessions (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references public.students (id) on delete cascade,
  status              text not null default 'running' check (status in ('running', 'paused', 'finished')),
  kind                text not null default 'academy' check (kind in ('academy', 'homework')),
  started_at          timestamptz not null default now(),
  paused_at           timestamptz,
  ended_at            timestamptz,
  last_heartbeat_at   timestamptz not null default now(),
  paused_seconds      integer not null default 0 check (paused_seconds >= 0),
  auto_pause_count    integer not null default 0 check (auto_pause_count >= 0),
  auto_paused_seconds integer not null default 0 check (auto_paused_seconds >= 0),
  last_pause_auto     boolean not null default false,
  date                date not null default ((now() at time zone 'Asia/Seoul')::date),
  minutes             integer,
  problems            integer,
  created_at          timestamptz not null default now()
);

create index if not exists study_sessions_student_idx on public.study_sessions (student_id, status);
create index if not exists study_sessions_date_idx on public.study_sessions (date);

-- 학생 한 명은 동시에 하나의 세션만 (끝난 세션은 여러 개 가능)
create unique index if not exists study_sessions_one_active_idx
  on public.study_sessions (student_id)
  where status <> 'finished';

create table if not exists public.study_logs (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students (id) on delete cascade,
  date              date not null,
  minutes           integer not null default 0 check (minutes >= 0),
  problems          integer not null default 0 check (problems >= 0),
  academy_minutes   integer not null default 0 check (academy_minutes >= 0),
  academy_problems  integer not null default 0 check (academy_problems >= 0),
  homework_minutes  integer not null default 0 check (homework_minutes >= 0),
  homework_problems integer not null default 0 check (homework_problems >= 0),
  updated_at        timestamptz not null default now(),
  unique (student_id, date)
);

create index if not exists study_logs_date_idx on public.study_logs (date);

-- 이전 버전 테이블이 이미 있어도 빠진 열을 채워 넣는다
 alter table public.study_sessions add column if not exists ended_at timestamptz;
alter table public.study_sessions add column if not exists last_pause_auto boolean not null default false;
alter table public.study_sessions add column if not exists minutes integer;
alter table public.study_sessions add column if not exists problems integer;
alter table public.study_logs add column if not exists updated_at timestamptz not null default now();

-- 공부 종류(학원/숙제) — 기존 기록은 'academy' 로 두고 데이터는 그대로 둔다
alter table public.study_sessions add column if not exists kind text not null default 'academy';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'study_sessions_kind_check') then
    alter table public.study_sessions
      add constraint study_sessions_kind_check check (kind in ('academy', 'homework'));
  end if;
end $$;

alter table public.study_logs add column if not exists academy_minutes  integer not null default 0;
alter table public.study_logs add column if not exists academy_problems integer not null default 0;
alter table public.study_logs add column if not exists homework_minutes integer not null default 0;
alter table public.study_logs add column if not exists homework_problems integer not null default 0;

-- 기존 기록(종류를 모르는 날)은 학원 공부로 한 번만 옮겨 둔다. 여러 번 실행해도 안전하다.
update public.study_logs
   set academy_minutes  = minutes,
       academy_problems = problems
 where academy_minutes = 0 and homework_minutes = 0 and homework_problems = 0
   and (minutes > 0 or problems > 0);

-- ---------------------------------------------------------------------
-- 2. 서버 시각 · 날짜 도우미
-- ---------------------------------------------------------------------

create or replace function public.server_now()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

create or replace function public.kst_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Seoul')::date;
$$;

-- 세션의 실제 공부 초 (일시정지 시간 제외, 최대 5시간)
create or replace function public.session_elapsed_seconds(
  p_started_at      timestamptz,
  p_paused_at       timestamptz,
  p_ended_at        timestamptz,
  p_status          text,
  p_paused_seconds  integer
)
returns integer
language sql
stable
as $$
  select greatest(
    0,
    least(
      18000,
      floor(
        extract(epoch from (
          coalesce(
            p_ended_at,
            case
              when p_status = 'paused' then coalesce(p_paused_at, now())
              else now()
            end
          ) - p_started_at
        ))
      )::integer - coalesce(p_paused_seconds, 0)
    )
  );
$$;

-- ---------------------------------------------------------------------
-- 3. 타이머 RPC
-- ---------------------------------------------------------------------

-- 코드로 학생 찾기 (같은 코드 학생이 여러 명일 수 있음)
create or replace function public.find_students_by_code(p_code text)
returns setof public.students
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.students
  where code = p_code
  order by name;
$$;

-- 진행 중 세션 정리: 자정 초과 / 숙제 공부 자동 일시정지 / 5시간 초과
create or replace function public.reconcile_session(p_session_id uuid)
returns public.study_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s     public.study_sessions;
  v_now timestamptz := now();
  v_gap integer;
begin
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if s.status = 'finished' then
    return s;
  end if;

  -- (1) 한국 시간 자정을 넘겼으면 기록하지 않고 세션을 버린다
  --     (12시 전에 종료를 누르지 않은 공부는 study_logs 에 남기지 않는다)
  if (v_now at time zone 'Asia/Seoul')::date > s.date then
    delete from public.study_sessions where id = s.id;
    return null;
  end if;

  -- (2) 숙제 공부는 화면을 끄거나 나가면 멈춘다.
  --     클라이언트가 화면을 벗어나는 순간 pause_session 을 보내지만,
  --     요청이 닿지 못한 경우를 대비해 하트비트가 30초 이상 끊기면 서버에서도 일시정지시킨다.
  --     (멈춘 시각은 마지막 신호 시각 = 마지막으로 공부한 것이 확인된 시점)
  if s.status = 'running' and s.kind = 'homework' then
    v_gap := greatest(0, floor(extract(epoch from (v_now - s.last_heartbeat_at)))::integer);
    if v_gap > 30 then
      update public.study_sessions
         set status           = 'paused',
             paused_at        = s.last_heartbeat_at,
             auto_pause_count = s.auto_pause_count + 1,
             last_pause_auto  = true
       where id = s.id
       returning * into s;
    end if;
  end if;

  -- (3) 학원 공부는 하트비트가 끊겨도 임의로 일시정지하지 않는다.
  --     화면을 끄고 공부를 계속하는 경우(페이지가 잠들어 하트비트가 끊김)를 공부 시간으로 인정한다.
  --     앱을 닫았다가 다시 연 경우는 클라이언트가 마지막 신호 시각까지로 일시정지시킨다.

  -- (4) 5시간(300분)을 넘겼으면 자동 종료
  if public.session_elapsed_seconds(
       s.started_at, s.paused_at, s.ended_at, s.status, s.paused_seconds
     ) >= 18000 then
    perform public.finish_session(s.id, coalesce(s.problems, 0));
    select * into s from public.study_sessions where id = p_session_id;
  end if;

  return s;
end;
$$;

-- 진행 중인 세션 (없으면 null)
create or replace function public.active_session(p_student_id uuid)
returns public.study_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.study_sessions;
begin
  select * into s
    from public.study_sessions
   where student_id = p_student_id
     and status <> 'finished'
   order by created_at desc
   limit 1;

  if not found then
    return null;
  end if;

  return public.reconcile_session(s.id);
end;
$$;

-- 공부 시작 (이미 진행 중이면 그 세션을 그대로 돌려줌 → 타이머 화면 복귀)
-- p_kind: 'academy'(학원 공부) 또는 'homework'(숙제 공부)
drop function if exists public.start_session(uuid);

create or replace function public.start_session(p_student_id uuid, p_kind text default 'academy')
returns public.study_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s      public.study_sessions;
  v_kind text := case when p_kind = 'homework' then 'homework' else 'academy' end;
begin
  if not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  select * into s
    from public.study_sessions
   where student_id = p_student_id
     and status <> 'finished'
   order by created_at desc
   limit 1;

  if found then
    s := public.reconcile_session(s.id);
    -- 자정을 넘겨 버려졌으면 새 세션을 연다
    if s.id is not null then
      return s;
    end if;
  end if;

  insert into public.study_sessions (student_id, status, kind, started_at, last_heartbeat_at, date)
  values (p_student_id, 'running', v_kind, now(), now(), public.kst_today())
  returning * into s;

  return s;
end;
$$;

-- 일시정지 (p_auto = 화면을 벗어나 자동으로 멈춘 경우)
create or replace function public.pause_session(p_session_id uuid, p_auto boolean default false)
returns public.study_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s     public.study_sessions;
  v_gap integer;
begin
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if s.status <> 'running' then
    return s;
  end if;

  -- 하트비트가 30초 이상 끊긴 채로 멈추면 마지막 신호 시각을 멈춘 시각으로 본다.
  -- 공부 시간은 (멈춘 시각 - 시작) - 일시정지 누적 이므로, 그 사이에 흐른 시간은
  -- paused_seconds 에 또 더하지 않는다(멈춘 시각 이후는 어차피 세지 않는다).
  v_gap := greatest(0, floor(extract(epoch from (now() - s.last_heartbeat_at)))::integer);

  update public.study_sessions
     set status           = 'paused',
         paused_at        = case when v_gap > 30 then s.last_heartbeat_at else now() end,
         auto_pause_count = s.auto_pause_count + case when p_auto or v_gap > 30 then 1 else 0 end,
         last_pause_auto  = (p_auto or v_gap > 30)
   where id = s.id
   returning * into s;

  return s;
end;
$$;

-- 계속
create or replace function public.resume_session(p_session_id uuid)
returns public.study_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s     public.study_sessions;
  v_gap integer;
begin
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if s.status <> 'paused' then
    return s;
  end if;

  v_gap := greatest(0, floor(extract(epoch from (now() - coalesce(s.paused_at, now()))))::integer);

  update public.study_sessions
     set status              = 'running',
         paused_at           = null,
         paused_seconds      = s.paused_seconds + v_gap,
         auto_paused_seconds = s.auto_paused_seconds + case when s.last_pause_auto then v_gap else 0 end,
         last_pause_auto     = false,
         last_heartbeat_at   = now()
   where id = s.id
   returning * into s;

  -- 5시간을 넘겼으면 바로 종료
  if public.session_elapsed_seconds(
       s.started_at, s.paused_at, s.ended_at, s.status, s.paused_seconds
     ) >= 18000 then
    perform public.finish_session(s.id, coalesce(s.problems, 0));
    select * into s from public.study_sessions where id = p_session_id;
  end if;

  return s;
end;
$$;

-- 10초 하트비트
create or replace function public.heartbeat(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.study_sessions;
begin
  s := public.reconcile_session(p_session_id);

  if s.status = 'running' then
    update public.study_sessions
       set last_heartbeat_at = now()
     where id = s.id
     returning * into s;
  end if;

  return jsonb_build_object(
    'session',    to_jsonb(s),
    'server_now', now()
  );
end;
$$;

-- 종료: 서버가 시간을 계산하고 study_logs 에 누적 합산(upsert)
create or replace function public.finish_session(p_session_id uuid, p_problems integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.study_sessions;
  v_now      timestamptz := now();
  v_end      timestamptz;
  v_cap      timestamptz;
  v_secs     integer;
  v_mins     integer;
  v_problems integer;
  v_kind     text;
  v_log      public.study_logs;
begin
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  -- 이미 끝난 세션이면 그대로 돌려준다 (같은 요청이 두 번 와도 기록이 두 번 쌓이지 않음)
  if s.status = 'finished' then
    select * into v_log
      from public.study_logs
     where student_id = s.student_id and date = s.date;

    return jsonb_build_object(
      'session',        to_jsonb(s),
      'log',            to_jsonb(v_log),
      'seconds',        coalesce(s.minutes, 0) * 60,
      'minutes',        coalesce(s.minutes, 0),
      'problems',       coalesce(s.problems, 0),
      'total_minutes',  coalesce(v_log.minutes, 0),
      'total_problems', coalesce(v_log.problems, 0),
      'date',           s.date,
      'kind',           s.kind
    );
  end if;

  v_end := case when s.status = 'paused' then coalesce(s.paused_at, v_now) else v_now end;

  -- 그 날 자정을 넘긴 공부는 기록하지 않고 세션만 버린다 (12시 전에 종료를 누르지 않은 경우)
  v_cap := ((s.date + 1)::timestamp at time zone 'Asia/Seoul') - interval '1 second';
  if v_end > v_cap then
    delete from public.study_sessions where id = s.id;

    select * into v_log
      from public.study_logs
     where student_id = s.student_id and date = s.date;

    return jsonb_build_object(
      'session',        null,
      'log',            null,
      'seconds',        0,
      'minutes',        0,
      'problems',       0,
      'total_minutes',  coalesce(v_log.minutes, 0),
      'total_problems', coalesce(v_log.problems, 0),
      'date',           s.date,
      'kind',           s.kind,
      'discarded',      true
    );
  end if;

  v_secs := greatest(0, floor(extract(epoch from (v_end - s.started_at)))::integer - s.paused_seconds);
  if v_secs > 18000 then
    v_secs := 18000;
  end if;
  v_mins := (v_secs / 60)::integer;

  v_problems := greatest(0, coalesce(p_problems, s.problems, 0));
  v_kind     := case when s.kind = 'homework' then 'homework' else 'academy' end;

  update public.study_sessions
     set status          = 'finished',
         ended_at        = v_end,
         paused_at       = null,
         last_pause_auto = false,
         minutes         = v_mins,
         problems        = v_problems
   where id = s.id
   returning * into s;

  insert into public.study_logs as l (
    student_id, date, minutes, problems,
    academy_minutes, academy_problems, homework_minutes, homework_problems, updated_at
  )
  values (
    s.student_id, s.date, v_mins, v_problems,
    case when v_kind = 'academy'  then v_mins     else 0 end,
    case when v_kind = 'academy'  then v_problems else 0 end,
    case when v_kind = 'homework' then v_mins     else 0 end,
    case when v_kind = 'homework' then v_problems else 0 end,
    now()
  )
  on conflict (student_id, date) do update
    set minutes           = l.minutes + excluded.minutes,
        problems          = l.problems + excluded.problems,
        academy_minutes   = l.academy_minutes + excluded.academy_minutes,
        academy_problems  = l.academy_problems + excluded.academy_problems,
        homework_minutes  = l.homework_minutes + excluded.homework_minutes,
        homework_problems = l.homework_problems + excluded.homework_problems,
        updated_at        = now()
  returning * into v_log;

  return jsonb_build_object(
    'session',        to_jsonb(s),
    'log',            to_jsonb(v_log),
    'seconds',        v_secs,
    'minutes',        v_mins,
    'problems',       v_problems,
    'total_minutes',  coalesce(v_log.minutes, 0),
    'total_problems', coalesce(v_log.problems, 0),
    'date',           s.date,
    'kind',           v_kind
  );
end;
$$;

-- 자정을 넘긴 세션 버리기 (기록 없이 삭제)
create or replace function public.discard_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.study_sessions
   where id = p_session_id
     and status <> 'finished';
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

-- ---------------------------------------------------------------------
-- 3.5 '선오공에게 질문하기' Q&A (2026-11-21 추가)
--     학생: 문제 사진 + 한 줄 메모 → 선오공이(관리자)가 답변 글 + 사진/동영상
--     자세한 변경 이력은 supabase/migrate-2026-11-21-questions.sql
-- ---------------------------------------------------------------------

create table if not exists public.study_questions (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students (id) on delete cascade,
  memo              text,
  image_path        text not null,
  answer            text,
  answer_media_path text,
  answered_at       timestamptz,
  answered_by       text not null default '선오공이',
  student_read_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint study_questions_memo_len   check (memo is null or length(memo) <= 200),
  constraint study_questions_answer_len check (answer is null or length(answer) <= 2000)
);

alter table public.study_questions add column if not exists memo text;
alter table public.study_questions add column if not exists answer text;
alter table public.study_questions add column if not exists answer_media_path text;
alter table public.study_questions add column if not exists answered_at timestamptz;
alter table public.study_questions add column if not exists answered_by text not null default '선오공이';
alter table public.study_questions add column if not exists student_read_at timestamptz;
alter table public.study_questions add column if not exists updated_at timestamptz not null default now();

create index if not exists study_questions_student_idx
  on public.study_questions (student_id, created_at desc);

create index if not exists study_questions_waiting_idx
  on public.study_questions (created_at desc)
  where answer is null;

-- 질문 사진 · 답변 사진/동영상 버킷 (비공개, 1개 50MB 까지)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-images',
  'question-images',
  false,
  52428800,
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
-- 4. 권한 · RLS
--    앱은 익명 키(anon)로 동작합니다. 관리자 화면은 앱 안의 비밀번호로 입장합니다.
-- ---------------------------------------------------------------------

alter table public.students         enable row level security;
alter table public.study_sessions   enable row level security;
alter table public.study_logs       enable row level security;
alter table public.study_questions  enable row level security;

drop policy if exists students_anon_all on public.students;
create policy students_anon_all on public.students
  for all to anon, authenticated using (true) with check (true);

drop policy if exists study_sessions_anon_all on public.study_sessions;
create policy study_sessions_anon_all on public.study_sessions
  for all to anon, authenticated using (true) with check (true);

drop policy if exists study_logs_anon_all on public.study_logs;
create policy study_logs_anon_all on public.study_logs
  for all to anon, authenticated using (true) with check (true);

drop policy if exists study_questions_anon_all on public.study_questions;
create policy study_questions_anon_all on public.study_questions
  for all to anon, authenticated using (true) with check (true);

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

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.students, public.study_sessions, public.study_logs, public.study_questions to anon, authenticated;

grant execute on function public.server_now() to anon, authenticated;
grant execute on function public.kst_today() to anon, authenticated;
grant execute on function public.session_elapsed_seconds(timestamptz, timestamptz, timestamptz, text, integer) to anon, authenticated;
grant execute on function public.find_students_by_code(text) to anon, authenticated;
grant execute on function public.reconcile_session(uuid) to anon, authenticated;
grant execute on function public.active_session(uuid) to anon, authenticated;
grant execute on function public.start_session(uuid, text) to anon, authenticated;
grant execute on function public.pause_session(uuid, boolean) to anon, authenticated;
grant execute on function public.resume_session(uuid) to anon, authenticated;
grant execute on function public.heartbeat(uuid) to anon, authenticated;
grant execute on function public.finish_session(uuid, integer) to anon, authenticated;
grant execute on function public.discard_session(uuid) to anon, authenticated;
