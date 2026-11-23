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
--  · 쉬는 중(일시정지) 30분이 지나면 앱이 "아직 공부 중인가요?" 알림을 띄우고,
--    총 60분이 지나면 세션을 자동 종료합니다(문제 수는 다음 접속 때 입력받습니다).
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
  problems_pending    boolean not null default false,
  auto_ended          boolean not null default false,
  created_at          timestamptz not null default now()
);

create index if not exists study_sessions_student_idx on public.study_sessions (student_id, status);
create index if not exists study_sessions_date_idx on public.study_sessions (date);
create index if not exists study_sessions_pending_problems_idx
  on public.study_sessions (student_id, ended_at)
  where problems_pending;

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
alter table public.study_sessions add column if not exists problems_pending boolean not null default false;
alter table public.study_sessions add column if not exists auto_ended boolean not null default false;
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
-- 1. 숙제 제출 표
-- ---------------------------------------------------------------------
create table if not exists public.homework_submissions (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references public.students (id) on delete cascade,
  -- 이 제출을 만든 공부 세션 (한 세션에 한 번만 제출)
  session_id          uuid unique references public.study_sessions (id) on delete set null,
  date                date not null default public.kst_today(),
  started_at          timestamptz,
  ended_at            timestamptz,
  -- 학생이 제출한 값 (문제 수는 자동 종료 뒤 아직 모를 수 있어 비어 있을 수 있다)
  submitted_minutes   integer not null default 0 check (submitted_minutes >= 0 and submitted_minutes <= 300),
  submitted_problems  integer check (submitted_problems is null or (submitted_problems >= 0 and submitted_problems <= 9999)),
  -- 올린 숙제 사진 경로 (homework-photos 버킷, 최대 5장)
  photo_paths         text[] not null default '{}'::text[],
  -- pending(승인 대기) / approved(하나라도 승인) / rejected(둘 다 반려)
  status              text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  time_verdict        text not null default 'pending' check (time_verdict in ('pending', 'approved', 'rejected')),
  problems_verdict    text not null default 'pending' check (problems_verdict in ('pending', 'approved', 'rejected')),
  -- 승인된 값 (반려한 항목은 0)
  approved_minutes    integer not null default 0 check (approved_minutes >= 0),
  approved_problems   integer not null default 0 check (approved_problems >= 0),
  reject_reason       text,
  -- 승인할 때 남긴 칭찬·응원 한마디 (학생 홈에 민트 박스로 보인다)
  teacher_comment     text,
  submitted_at        timestamptz not null default now(),
  reviewed_at         timestamptz,
  reviewed_by         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint homework_submissions_photos_max check (
    array_length(photo_paths, 1) is null or array_length(photo_paths, 1) <= 5
  ),
  constraint homework_submissions_reason_len check (reject_reason is null or length(reject_reason) <= 300),
  constraint homework_submissions_comment_len check (teacher_comment is null or length(teacher_comment) <= 200)
);

create index if not exists homework_submissions_pending_idx
  on public.homework_submissions (submitted_at asc)
  where status = 'pending';

create index if not exists homework_submissions_student_idx
  on public.homework_submissions (student_id, created_at desc);

create index if not exists homework_submissions_status_idx
  on public.homework_submissions (status, created_at desc);

comment on table  public.homework_submissions is '숙제 공부 제출 — 원장님 승인 전에는 study_logs 에 반영하지 않는다';
comment on column public.homework_submissions.photo_paths is '숙제 페이지 사진 경로 (homework-photos 버킷, 최대 5장)';
comment on column public.homework_submissions.submitted_problems is 'null 이면 자동 종료 뒤 문제 수를 아직 받지 못한 제출';
comment on column public.homework_submissions.teacher_comment is '원장님이 승인할 때 남긴 칭찬·응원 한마디 (학생 홈 숙제 제출 카드에 민트 박스로 보인다, 최대 200자)';

-- 이미 만들어진 표에도 칭찬 한마디 열을 더한다 (여러 번 실행해도 안전)
alter table public.homework_submissions
  add column if not exists teacher_comment text;

alter table public.homework_submissions
  drop constraint if exists homework_submissions_comment_len;
alter table public.homework_submissions
  add constraint homework_submissions_comment_len check (
    teacher_comment is null or length(teacher_comment) <= 200
  );

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
  -- 지난 날짜에 시작한 미종료 세션이 남아 있으면 먼저 정리한다
  perform public.maybe_cleanup_stale_study_sessions();

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
  -- 지난 날짜에 시작한 미종료 세션이 남아 있으면 먼저 정리한다
  perform public.maybe_cleanup_stale_study_sessions();

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

  -- 숙제 공부는 사진·문제 수와 함께 승인 대기로 넘긴다 (study_logs 에 바로 넣지 않는다)
  if coalesce(s.kind, 'academy') = 'homework' then
    return public.close_homework_session(s.id, p_problems, '{}'::text[]);
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
-- 3.2 일시정지 30분 알림 · 60분 자동 종료 · 다음 접속 때 문제 수 입력 (2026-11-22 추가)
--     자세한 변경 이유는 supabase/migrate-2026-11-22-pause-autoend.sql
--     · 일시정지 60분 경과 → auto_end_paused_session() 이 세션을 끝내고
--       problems_pending = true 로 표시한다(문제 수는 아직 모름, study_logs 문제 수 0).
--     · 학생이 다음에 접속해 문제 수를 넣으면 set_session_problems() 가
--       그 날 기록에 문제 수를 더한다 → 통계·랭킹에 반영.
-- ---------------------------------------------------------------------

create or replace function public.auto_end_paused_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s      public.study_sessions;
  v_end  timestamptz;
  v_cap  timestamptz;
  v_secs integer;
  v_mins integer;
  v_kind text;
  v_log  public.study_logs;
  v_res  jsonb;
begin
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  -- 이미 끝난 세션 → 그대로
  if s.status = 'finished' then
    select * into v_log
      from public.study_logs
     where student_id = s.student_id and date = s.date;

    return jsonb_build_object(
      'session',          to_jsonb(s),
      'log',              to_jsonb(v_log),
      'seconds',          coalesce(s.minutes, 0) * 60,
      'minutes',          coalesce(s.minutes, 0),
      'problems',         coalesce(s.problems, 0),
      'total_minutes',    coalesce(v_log.minutes, 0),
      'total_problems',   coalesce(v_log.problems, 0),
      'date',             s.date,
      'kind',             s.kind,
      'problems_pending', s.problems_pending,
      'already_finished', true
    );
  end if;

  -- 공부 중인 세션은 자동 종료하지 않는다 (쉬는 중일 때만)
  if s.status <> 'paused' then
    return jsonb_build_object(
      'session',          to_jsonb(s),
      'log',              null,
      'seconds',          0,
      'minutes',          0,
      'problems',         0,
      'total_minutes',    0,
      'total_problems',   0,
      'date',             s.date,
      'kind',             s.kind,
      'problems_pending', false,
      'not_paused',       true
    );
  end if;

  -- 숙제 공부는 승인 대기 제출로 넘긴다 (문제 수는 다음 접속 때 제출 표에서 받는다)
  if coalesce(s.kind, 'academy') = 'homework' then
    v_res := public.close_homework_session(s.id, null, '{}'::text[]);
    return v_res || jsonb_build_object(
      'problems_pending', coalesce((v_res ->> 'pending_approval')::boolean, false),
      'auto_ended',       true
    );
  end if;

  -- 공부를 멈춘 시각까지가 공부 시간이다 (쉬는 동안의 시간은 세지 않는다)
  v_end := coalesce(s.paused_at, now());

  -- 그 날 자정을 넘긴 공부는 기록하지 않고 세션만 버린다 (기존 규칙과 같다)
  v_cap := ((s.date + 1)::timestamp at time zone 'Asia/Seoul') - interval '1 second';
  if v_end > v_cap then
    delete from public.study_sessions where id = s.id;

    select * into v_log
      from public.study_logs
     where student_id = s.student_id and date = s.date;

    return jsonb_build_object(
      'session',          null,
      'log',              null,
      'seconds',          0,
      'minutes',          0,
      'problems',         0,
      'total_minutes',    coalesce(v_log.minutes, 0),
      'total_problems',   coalesce(v_log.problems, 0),
      'date',             s.date,
      'kind',             s.kind,
      'problems_pending', false,
      'discarded',        true
    );
  end if;

  v_secs := greatest(0, floor(extract(epoch from (v_end - s.started_at)))::integer - s.paused_seconds);
  if v_secs > 18000 then
    v_secs := 18000;
  end if;
  v_mins := (v_secs / 60)::integer;
  v_kind := case when s.kind = 'homework' then 'homework' else 'academy' end;

  update public.study_sessions
     set status           = 'finished',
         ended_at         = v_end,
         paused_at        = null,
         last_pause_auto  = false,
         minutes          = v_mins,
         problems         = null,               -- 아직 모른다 (problems_pending 으로 표시)
         problems_pending = (v_mins > 0),       -- 1분도 안 됐으면 물어볼 것이 없다
         auto_ended       = true
   where id = s.id
   returning * into s;

  if v_mins > 0 then
    -- 문제 수는 0으로 넣어 두고, 나중에 set_session_problems() 가 더한다
    insert into public.study_logs as l (
      student_id, date, minutes, problems,
      academy_minutes, academy_problems, homework_minutes, homework_problems, updated_at
    )
    values (
      s.student_id, s.date, v_mins, 0,
      case when v_kind = 'academy'  then v_mins else 0 end,
      0,
      case when v_kind = 'homework' then v_mins else 0 end,
      0,
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
  else
    -- 공부한 시간이 0분이면 기록 줄도 만들지 않는다 (그 날 기록은 그대로)
    select * into v_log
      from public.study_logs
     where student_id = s.student_id and date = s.date;
  end if;

  return jsonb_build_object(
    'session',          to_jsonb(s),
    'log',              to_jsonb(v_log),
    'seconds',          v_secs,
    'minutes',          v_mins,
    'problems',         0,
    'total_minutes',    coalesce(v_log.minutes, 0),
    'total_problems',   coalesce(v_log.problems, 0),
    'date',             s.date,
    'kind',             v_kind,
    'problems_pending', s.problems_pending,
    'auto_ended',       true
  );
end;
$$;

-- 자동 종료된 세션의 문제 수 입력 → 그 날 기록에 더한다 (한 세션에 한 번만)
create or replace function public.set_session_problems(p_session_id uuid, p_problems integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.study_sessions;
  v_problems integer := greatest(0, least(9999, coalesce(p_problems, 0)));
  v_kind     text;
  v_log      public.study_logs;
begin
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if s.status <> 'finished' then
    raise exception 'session_not_finished' using errcode = 'P0002';
  end if;

  if not s.problems_pending then
    raise exception 'problems_not_pending' using errcode = 'P0002';
  end if;

  v_kind := case when s.kind = 'homework' then 'homework' else 'academy' end;

  update public.study_sessions
     set problems         = v_problems,
         problems_pending = false
   where id = s.id
   returning * into s;

  update public.study_logs
     set problems          = problems + v_problems,
         academy_problems  = academy_problems  + case when v_kind = 'academy'  then v_problems else 0 end,
         homework_problems = homework_problems + case when v_kind = 'homework' then v_problems else 0 end,
         updated_at        = now()
   where student_id = s.student_id and date = s.date
   returning * into v_log;

  -- 그 날 기록이 지워졌으면 세션 시간으로 다시 만들어 둔다
  if v_log.id is null then
    insert into public.study_logs as l (
      student_id, date, minutes, problems,
      academy_minutes, academy_problems, homework_minutes, homework_problems, updated_at
    )
    values (
      s.student_id, s.date, coalesce(s.minutes, 0), v_problems,
      case when v_kind = 'academy'  then coalesce(s.minutes, 0) else 0 end,
      case when v_kind = 'academy'  then v_problems else 0 end,
      case when v_kind = 'homework' then coalesce(s.minutes, 0) else 0 end,
      case when v_kind = 'homework' then v_problems else 0 end,
      now()
    )
    on conflict (student_id, date) do update
      set problems          = l.problems + excluded.problems,
          academy_problems  = l.academy_problems  + excluded.academy_problems,
          homework_problems = l.homework_problems + excluded.homework_problems,
          updated_at        = now()
    returning * into v_log;
  end if;

  return jsonb_build_object(
    'session',          to_jsonb(s),
    'log',              to_jsonb(v_log),
    'problems',         v_problems,
    'minutes',          coalesce(s.minutes, 0),
    'total_minutes',    coalesce(v_log.minutes, 0),
    'total_problems',   coalesce(v_log.problems, 0),
    'date',             s.date,
    'kind',             v_kind,
    'problems_pending', false
  );
end;
$$;

-- 문제 수 입력을 기다리는 세션 목록 (오래된 것부터, 최근 30일)
create or replace function public.pending_problem_sessions(p_student_id uuid)
returns setof public.study_sessions
language sql
stable
security definer
set search_path = public
as $$
  select *
    from public.study_sessions
   where student_id = p_student_id
     and status = 'finished'
     and coalesce(kind, 'academy') = 'academy'
     and problems_pending
     and coalesce(minutes, 0) > 0
     and date >= (public.kst_today() - 30)
   order by coalesce(ended_at, created_at) asc, created_at asc;
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

-- ---------------------------------------------------------------------
-- 3.6 관리자 '새 질문 알림' (웹 푸시, 2026-11-21 추가)
--     알림을 켠 관리자 기기(브라우저 푸시 구독)와, 질문별 알림 발송 표시
--     자세한 변경 이력은 supabase/migrate-2026-11-21-push.sql
-- ---------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_created_idx
  on public.push_subscriptions (created_at desc);

-- 같은 질문으로 두 번 알리지 않게
 alter table public.study_questions add column if not exists push_notified_at timestamptz;

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
-- 3.7 근두운 · 드래곤볼 (2026-11-21 추가)
--     학생 닉네임(실명 대신), 지금 공부 중인 친구들(닉네임+시간), 선오공이 드래곤볼 쏘기
--     자세한 변경 이력·검증은 supabase/migrate-2026-11-21-kintoun-dragonball.sql
-- ---------------------------------------------------------------------

alter table public.students add column if not exists nickname text;
alter table public.students add column if not exists dragonball_count integer not null default 0;
-- 1~7성구 도감 (2026-11-21 추가) — 키 '1'~'7', 값은 보유 개수
alter table public.students add column if not exists dragonballs jsonb not null
  default '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb;
-- 칠성구를 합쳐 만든 무지개 볼 개수 (2026-11-21 추가)
alter table public.students add column if not exists rainbow_ball_count integer not null default 0;

-- 예전에 개수만 있던 드래곤볼은 1~7성구로 무작위로 나눠 담는다 (합계는 그대로)
do $$
declare
  r         record;
  remaining integer;
  star      integer;
  parts     jsonb;
begin
  for r in
    select s.id, coalesce(s.dragonball_count, 0) as total
      from public.students s
     where coalesce(s.dragonball_count, 0) > 0
       and coalesce((select sum(value::int) from jsonb_each_text(s.dragonballs)), 0) = 0
  loop
    remaining := r.total;
    parts := '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb;
    while remaining > 0 loop
      star := 1 + floor(random() * 7)::int;
      parts := jsonb_set(parts, array[star::text], to_jsonb((parts ->> star::text)::int + 1));
      remaining := remaining - 1;
    end loop;
    update public.students set dragonballs = parts where id = r.id;
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'students_nickname_check') then
    alter table public.students
      add constraint students_nickname_check
      check (
        nickname is null
        or (length(btrim(nickname)) between 1 and 10 and nickname !~ '[\r\n\t]')
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'students_dragonball_count_check') then
    alter table public.students
      add constraint students_dragonball_count_check check (dragonball_count >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'students_rainbow_ball_count_check') then
    alter table public.students
      add constraint students_rainbow_ball_count_check check (rainbow_ball_count >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'students_dragonballs_check') then
    alter table public.students
      add constraint students_dragonballs_check
      check (
        jsonb_typeof(dragonballs) = 'object'
        and dragonballs ? '1' and dragonballs ? '2' and dragonballs ? '3'
        and dragonballs ? '4' and dragonballs ? '5' and dragonballs ? '6'
        and dragonballs ? '7'
        and (dragonballs ->> '1')::int >= 0
        and (dragonballs ->> '2')::int >= 0
        and (dragonballs ->> '3')::int >= 0
        and (dragonballs ->> '4')::int >= 0
        and (dragonballs ->> '5')::int >= 0
        and (dragonballs ->> '6')::int >= 0
        and (dragonballs ->> '7')::int >= 0
        and ((dragonballs ->> '1')::int + (dragonballs ->> '2')::int + (dragonballs ->> '3')::int
           + (dragonballs ->> '4')::int + (dragonballs ->> '5')::int + (dragonballs ->> '6')::int
           + (dragonballs ->> '7')::int) = coalesce(dragonball_count, 0)
      );
  end if;
end $$;

create table if not exists public.dragonball_grants (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete cascade,
  amount      integer not null check (amount > 0),
  mode        text not null default 'single' check (mode in ('all', 'single')),
  note        text,
  -- 그때 지급한 성구들 (예: {4,7})
  stars       integer[] not null default '{}'::integer[]
    check (stars <@ array[1, 2, 3, 4, 5, 6, 7]::integer[]),
  created_at  timestamptz not null default now()
);

create index if not exists dragonball_grants_student_idx
  on public.dragonball_grants (student_id, created_at desc);

-- 학생 닉네임 바꾸기 (빈 값이면 '수련생'으로 돌아간다)
create or replace function public.set_student_nickname(p_student_id uuid, p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick text := nullif(btrim(coalesce(p_nickname, '')), '');
  v_row  public.students;
begin
  if v_nick is not null then
    if v_nick ~ '[\r\n\t]' then
      raise exception 'nickname_invalid' using errcode = '22023';
    end if;
    if length(v_nick) > 10 then
      raise exception 'nickname_too_long' using errcode = '22023';
    end if;
  end if;

  update public.students set nickname = v_nick where id = p_student_id returning * into v_row;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'nickname',         v_row.nickname,
    'dragonball_count', v_row.dragonball_count
  );
end;
$$;

-- 내 닉네임 · 드래곤볼 개수
create or replace function public.student_profile(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.students;
begin
  select * into v_row from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'nickname',           v_row.nickname,
    'dragonball_count',   coalesce(v_row.dragonball_count, 0),
    'dragonballs',        coalesce(v_row.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb),
    'rainbow_ball_count', coalesce(v_row.rainbow_ball_count, 0)
  );
end;
$$;

-- 내 드래곤볼 도감 — 성구 맵·총 개수·모은 종류 수
create or replace function public.student_dragonballs(p_student_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
           'dragonballs',        coalesce(s.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb),
           'total',              coalesce(s.dragonball_count, 0),
           'collected',          (select count(*) from jsonb_each_text(coalesce(s.dragonballs, '{}'::jsonb)) as e(key, value)
                                    where e.value::int > 0),
           'rainbow_ball_count', coalesce(s.rainbow_ball_count, 0),
           'rainbow_ready',      not exists (
                                   select 1 from jsonb_each_text(coalesce(s.dragonballs, '{}'::jsonb)) as e(key, value)
                                    where e.value::int < 1
                                 )
                                 and (select count(*) from jsonb_each_text(coalesce(s.dragonballs, '{}'::jsonb))) = 7
         )
    from public.students s
   where s.id = p_student_id;
$$;

-- 근두운 — 지금 공부 중인 학생 (닉네임 + 진행 시간만, 실명·id 없음)
create or replace function public.live_study_board(p_student_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r         record;
  v_rows    jsonb := '[]'::jsonb;
  v_running integer := 0;
  v_now     timestamptz := now();
  v_secs    integer;
  v_empty   jsonb := '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb;
begin
  -- 숙제 공부는 하트비트가 30초 끊기면 일시정지로 본다 (reconcile_session 과 같은 규칙)
  update public.study_sessions s
     set status           = 'paused',
         paused_at        = s.last_heartbeat_at,
         auto_pause_count = s.auto_pause_count + 1,
         last_pause_auto  = true
   where s.status = 'running'
     and s.kind = 'homework'
     and s.date = public.kst_today()
     and v_now - s.last_heartbeat_at > interval '30 seconds';

  for r in
    select s.student_id, s.status, s.started_at, s.paused_at, s.ended_at, s.paused_seconds,
           coalesce(st.dragonballs, v_empty) as dragonballs,
           coalesce(st.rainbow_ball_count, 0) as rainbow_ball_count,
           coalesce(nullif(btrim(st.nickname), ''), '수련생') as nickname
      from public.study_sessions s
      join public.students st on st.id = s.student_id
     where s.status <> 'finished'
       and s.date = public.kst_today()
     order by s.started_at asc
  loop
    v_secs := public.session_elapsed_seconds(
      r.started_at, r.paused_at, r.ended_at, r.status, r.paused_seconds
    );

    continue when v_secs >= 18000;

    if r.status = 'running' then
      v_running := v_running + 1;
    end if;

    v_rows := v_rows || jsonb_build_array(
      jsonb_build_object(
        'nickname',           r.nickname,
        'status',             r.status,
        'started_at',         r.started_at,
        'seconds',            v_secs,
        'is_me',              (p_student_id is not null and r.student_id = p_student_id),
        'dragonballs',        r.dragonballs,
        'rainbow_ball_count', r.rainbow_ball_count
      )
    );
  end loop;

  return jsonb_build_object(
    'server_now',    v_now,
    'running_count', v_running,
    'students',      v_rows
  );
end;
$$;

-- 칠성구 합치기 — 1~7성구를 하나씩(모두 있을 때) 합쳐 무지개 볼 1개
create or replace function public.craft_rainbow_ball(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.students;
  v_empty   jsonb := '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb;
  v_map     jsonb;
  v_total   integer;
  v_rainbow integer;
  v_need    integer := 0;
  star      integer;
begin
  -- 같은 학생이 두 번 눌러도 한 번만 합쳐지도록 줄을 잠그고 읽는다
  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_map     := coalesce(v_row.dragonballs, v_empty);
  v_total   := coalesce(v_row.dragonball_count, 0);
  v_rainbow := coalesce(v_row.rainbow_ball_count, 0);

  for star in 1 .. 7 loop
    if coalesce((v_map ->> star::text)::int, 0) < 1 then
      v_need := v_need + 1;
    end if;
  end loop;

  if v_need > 0 then
    raise exception 'dragonballs_incomplete' using errcode = '22023';
  end if;

  for star in 1 .. 7 loop
    v_map := jsonb_set(
      v_map,
      array[star::text],
      to_jsonb(greatest(0, coalesce((v_map ->> star::text)::int, 0) - 1))
    );
  end loop;

  update public.students
     set dragonballs         = v_map,
         dragonball_count    = greatest(0, v_total - 7),
         rainbow_ball_count  = v_rainbow + 1
   where id = p_student_id;

  return jsonb_build_object(
    'crafted',            true,
    'rainbow_ball_count', v_rainbow + 1,
    'dragonballs',        v_map,
    'total',              greatest(0, v_total - 7),
    'collected',          (select count(*) from jsonb_each_text(v_map) as e(key, value)
                            where e.value::int > 0)
  );
end;
$$;

-- 선오공이 드래곤볼 쏘기 — 개수만큼 1~7성구 랜덤 (전체 일괄 · 개별)
create or replace function public.grant_dragonballs(
  p_student_ids uuid[],
  p_amount      integer,
  p_mode        text default 'single',
  p_note        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount  integer := floor(coalesce(p_amount, 0))::integer;
  v_mode    text := case when p_mode = 'all' then 'all' else 'single' end;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_id      uuid;
  i         integer;
  v_count   integer := 0;
  v_total   integer := 0;
  v_stars   integer[] := '{}'::integer[];
  v_last    integer[] := '{}'::integer[];
  v_map     jsonb;
  v_awards  jsonb := '[]'::jsonb;
begin
  if v_amount < 1 or v_amount > 99 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if coalesce(array_length(p_student_ids, 1), 0) = 0 then
    raise exception 'no_students' using errcode = '22023';
  end if;

  for v_id in select distinct s.id from public.students s where s.id = any(p_student_ids) loop
    -- 1~7성구를 개수만큼 랜덤으로 뽑는다
    select array_agg(1 + floor(random() * 7)::int) into v_stars
      from generate_series(1, v_amount);
    v_stars := coalesce(v_stars, '{}'::integer[]);

    select coalesce(s.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb),
           coalesce(s.dragonball_count, 0)
      into v_map, v_total
      from public.students s
     where s.id = v_id;

    for i in 1 .. array_length(v_stars, 1) loop
      v_map := jsonb_set(
        v_map,
        array[v_stars[i]::text],
        to_jsonb(coalesce((v_map ->> v_stars[i]::text)::int, 0) + 1)
      );
    end loop;

    update public.students
       set dragonballs      = v_map,
           dragonball_count = v_total + v_amount
     where id = v_id;

    insert into public.dragonball_grants (student_id, amount, mode, note, stars)
    values (v_id, v_amount, v_mode, v_note, v_stars);

    v_count := v_count + 1;
    v_last := v_stars;
    v_total := v_total + v_amount;
    v_awards := v_awards || jsonb_build_array(
      jsonb_build_object(
        'student_id',  v_id,
        'stars',       to_jsonb(v_stars),
        'total',       v_total,
        'dragonballs', v_map
      )
    );
  end loop;

  if v_count = 0 then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'granted',    v_count,
    'amount',     v_amount,
    'mode',       v_mode,
    'last_total', v_total,
    'stars',      to_jsonb(v_last),
    'awards',     v_awards
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3.8 숙제 공부 사진 인증 · 시간/문항수 분리 승인 (2026-11-23 추가)
--     자세한 변경 이유는 supabase/migrate-2026-11-23-homework-photo-approval.sql
--     · 숙제 공부는 사진(최대 5장)과 문제 수를 함께 내고, 승인 전에는 기록에 넣지 않는다.
--     · 원장님이 시간·문항수를 따로 승인/반려하면 승인한 항목만 study_logs 에 더해진다.
-- ---------------------------------------------------------------------
-- 3.8.1 숙제 세션 마무리 → 승인 대기 제출 만들기
--    finish_session(학생이 직접 종료) · auto_end_paused_session(60분 자동 종료) ·
--    submit_homework(사진과 함께 제출) 이 모두 이 함수를 거친다.
--    같은 세션으로 두 번 불러도 제출 줄은 한 번만 생긴다.
-- ---------------------------------------------------------------------
create or replace function public.close_homework_session(
  p_session_id  uuid,
  p_problems    integer,
  p_photo_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s           public.study_sessions;
  v_end       timestamptz;
  v_cap       timestamptz;
  v_secs      integer;
  v_mins      integer;
  v_problems  integer;
  v_paths     text[];
  v_sub       public.homework_submissions;
  v_log       public.study_logs;
begin
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if coalesce(s.kind, 'academy') <> 'homework' then
    raise exception 'not_homework_session' using errcode = '22023';
  end if;

  if coalesce(array_length(p_photo_paths, 1), 0) > 5 then
    raise exception 'too_many_photos' using errcode = '22023';
  end if;

  -- 사진 경로 정리: 빈 값·중복을 빼고 5장까지만
  v_paths := coalesce(p_photo_paths, '{}'::text[]);
  v_paths := array(
    select p from (
      select distinct btrim(p) as p from unnest(v_paths) as p
    ) t
    where coalesce(t.p, '') <> ''
    limit 5
  );

  -- 이미 제출된 세션이면 그 제출을 돌려준다.
  -- (아직 승인 전이면 나중에 들어온 문제 수·사진으로 채워 준다)
  select * into v_sub from public.homework_submissions where session_id = s.id;
  if found then
    if v_sub.status = 'pending' then
      update public.homework_submissions
         set submitted_problems = coalesce(
               case when coalesce(p_problems, 0) > 0 then p_problems end,
               submitted_problems
             ),
             photo_paths = case
               when coalesce(array_length(v_paths, 1), 0) > 0
                    and coalesce(array_length(photo_paths, 1), 0) = 0
                 then v_paths
               else photo_paths
             end,
             updated_at = now()
       where id = v_sub.id
       returning * into v_sub;
    end if;

    select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;

    return jsonb_build_object(
      'session',            to_jsonb(s),
      'submission',         to_jsonb(v_sub),
      'submission_id',      v_sub.id,
      'log',                to_jsonb(v_log),
      'seconds',            coalesce(s.minutes, 0) * 60,
      'minutes',            coalesce(s.minutes, 0),
      'problems',           coalesce(v_sub.submitted_problems, 0),
      'submitted_minutes',  v_sub.submitted_minutes,
      'submitted_problems', v_sub.submitted_problems,
      'total_minutes',      coalesce(v_log.minutes, 0),
      'total_problems',     coalesce(v_log.problems, 0),
      'date',               s.date,
      'kind',               'homework',
      'pending_approval',   true,
      'already',            true
    );
  end if;

  if s.status = 'finished' then
    -- 서버가 5시간 초과로 먼저 마무리해 둔 세션 — 시간은 그대로 쓰고 기록만 승인 대기로 남긴다
    v_mins := coalesce(s.minutes, 0);
    if coalesce(p_problems, 0) > 0 then
      v_problems := greatest(0, least(9999, p_problems));
    else
      v_problems := s.problems;   -- 비어 있으면 그대로 비워 둔다(다음 접속 때 받는다)
    end if;
  else
    v_end := case when s.status = 'paused' then coalesce(s.paused_at, now()) else now() end;

    -- 그 날 자정을 넘긴 공부는 기록하지 않고 세션만 버린다 (예전 규칙과 같다)
    v_cap := ((s.date + 1)::timestamp at time zone 'Asia/Seoul') - interval '1 second';
    if v_end > v_cap then
      delete from public.study_sessions where id = s.id;

      select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;

      return jsonb_build_object(
        'session',          null,
        'submission',       null,
        'log',              null,
        'seconds',          0,
        'minutes',          0,
        'problems',         0,
        'total_minutes',    coalesce(v_log.minutes, 0),
        'total_problems',   coalesce(v_log.problems, 0),
        'date',             s.date,
        'kind',             'homework',
        'pending_approval', false,
        'discarded',        true
      );
    end if;

    v_secs := greatest(0, floor(extract(epoch from (v_end - s.started_at)))::integer - s.paused_seconds);
    if v_secs > 18000 then
      v_secs := 18000;
    end if;
    v_mins := (v_secs / 60)::integer;
    -- 문제 수를 아직 받지 못했으면 비워 둔다 (다음 접속 때 사진·문제 수를 받는다)
    if p_problems is null and s.problems is null then
      v_problems := null;
    else
      v_problems := greatest(0, least(9999, coalesce(p_problems, s.problems, 0)));
    end if;

    update public.study_sessions
       set status           = 'finished',
           ended_at         = v_end,
           paused_at        = null,
           last_pause_auto  = false,
           minutes          = v_mins,
           problems         = v_problems,
           problems_pending = false
     where id = s.id
     returning * into s;

    select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;

    -- 1분도 공부하지 않았고 문제 수도 없으면 승인할 것이 없다 (기록 줄을 만들지 않는다)
    if v_mins <= 0 and coalesce(v_problems, 0) <= 0 then
      return jsonb_build_object(
        'session',          to_jsonb(s),
        'submission',       null,
        'log',              to_jsonb(v_log),
        'seconds',          v_secs,
        'minutes',          v_mins,
        'problems',         v_problems,
        'total_minutes',    coalesce(v_log.minutes, 0),
        'total_problems',   coalesce(v_log.problems, 0),
        'date',             s.date,
        'kind',             'homework',
        'pending_approval', false,
        'nothing',          true
      );
    end if;
  end if;

  insert into public.homework_submissions (
    student_id, session_id, date, started_at, ended_at,
    submitted_minutes, submitted_problems, photo_paths, status, submitted_at
  )
  values (
    s.student_id, s.id, s.date, s.started_at, coalesce(s.ended_at, v_end),
    v_mins, v_problems, v_paths, 'pending', now()
  )
  returning * into v_sub;

  select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;

  return jsonb_build_object(
    'session',            to_jsonb(s),
    'submission',         to_jsonb(v_sub),
    'submission_id',      v_sub.id,
    'log',                to_jsonb(v_log),
    'seconds',            v_secs,
    'minutes',            v_mins,
    'problems',           v_problems,
    'submitted_minutes',  v_sub.submitted_minutes,
    'submitted_problems', v_sub.submitted_problems,
    'total_minutes',      coalesce(v_log.minutes, 0),
    'total_problems',     coalesce(v_log.problems, 0),
    'date',               s.date,
    'kind',               'homework',
    'pending_approval',   true
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3.8.2 학생이 숙제 공부를 제출 (타이머 화면 종료)
--    사진은 0장이어도 된다(최대 5장) — 사진 없이 내면 반려될 수 있다는 확인은 화면이 받는다.
-- ---------------------------------------------------------------------
create or replace function public.submit_homework(
  p_session_id  uuid,
  p_problems    integer,
  p_photo_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s       public.study_sessions;
  v_paths text[];
  v_problems integer := greatest(0, least(9999, coalesce(p_problems, 0)));
begin
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if coalesce(s.kind, 'academy') <> 'homework' then
    raise exception 'not_homework_session' using errcode = '22023';
  end if;

  v_paths := array(
    select p from (
      select distinct btrim(p) as p from unnest(coalesce(p_photo_paths, '{}'::text[])) as p
    ) t
    where coalesce(t.p, '') <> ''
  );

  if coalesce(array_length(v_paths, 1), 0) > 5 then
    raise exception 'too_many_photos' using errcode = '22023';
  end if;

  -- 사진은 필수가 아니다 (2026-11-23). 0장이면 화면이 확인을 받고 그대로 제출한다.
  return public.close_homework_session(s.id, v_problems, v_paths);
end;
$$;

-- ---------------------------------------------------------------------
-- 3.8.3 자동 종료된 숙제 공부의 문제 수 · 사진 채우기 (다음 접속 때)
-- ---------------------------------------------------------------------
create or replace function public.submit_pending_homework(
  p_submission_id uuid,
  p_problems      integer,
  p_photo_paths   text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s        public.homework_submissions;
  v_paths  text[];
  v_all    text[];
  v_problems integer := greatest(0, least(9999, coalesce(p_problems, 0)));
begin
  select * into s from public.homework_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'submission_not_found' using errcode = 'P0002';
  end if;

  if s.status <> 'pending' then
    raise exception 'already_reviewed' using errcode = '22023';
  end if;

  v_paths := array(
    select p from (
      select distinct btrim(p) as p from unnest(coalesce(p_photo_paths, '{}'::text[])) as p
    ) t
    where coalesce(t.p, '') <> ''
  );

  -- 이미 올린 사진 + 이번에 올린 사진 (5장까지)
  v_all := array(
    select p from (
      select distinct p from unnest(coalesce(s.photo_paths, '{}'::text[]) || coalesce(v_paths, '{}'::text[])) as p
    ) t
    where coalesce(t.p, '') <> ''
  );
  v_all := coalesce(v_all, '{}'::text[]);

  if coalesce(array_length(v_all, 1), 0) > 5 then
    raise exception 'too_many_photos' using errcode = '22023';
  end if;

  -- 사진은 필수가 아니다 (2026-11-23). 0장이면 화면이 확인을 받고 그대로 제출한다.
  update public.homework_submissions
     set submitted_problems = v_problems,
         photo_paths        = v_all,
         updated_at         = now()
   where id = s.id
   returning * into s;

  return to_jsonb(s);
end;
$$;

-- ---------------------------------------------------------------------
-- 3.8.4 원장님 확인 — 시간·문항수를 따로 승인/반려
--    · 승인한 항목만 study_logs 에 더한다 (그 날 학원 공부 기록과 합쳐진다)
--    · 반려한 항목은 0으로 확정한다 (다시 제출하지 않는다)
--    · 하나라도 승인되면 드래곤볼 1개 (한 제출에 한 번만)
-- ---------------------------------------------------------------------
drop function if exists public.review_homework_submission(uuid, boolean, boolean, text);

create or replace function public.review_homework_submission(
  p_submission_id     uuid,
  p_time_approved     boolean,
  p_problems_approved boolean,
  p_reject_reason     text default null,
  p_teacher_comment   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.homework_submissions;
  v_minutes  integer;
  v_problems integer;
  v_any      boolean;
  v_status   text;
  v_comment  text;
  v_log      public.study_logs;
begin
  select * into s from public.homework_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'submission_not_found' using errcode = 'P0002';
  end if;

  if s.status <> 'pending' then
    raise exception 'already_reviewed' using errcode = '22023';
  end if;

  if coalesce(p_problems_approved, false) and s.submitted_problems is null then
    raise exception 'problems_unknown' using errcode = '22023';
  end if;

  v_comment := nullif(btrim(coalesce(p_teacher_comment, '')), '');
  if v_comment is not null and length(v_comment) > 200 then
    raise exception 'comment_too_long' using errcode = '22023';
  end if;

  v_minutes  := case when coalesce(p_time_approved, false) then greatest(0, coalesce(s.submitted_minutes, 0)) else 0 end;
  v_problems := case when coalesce(p_problems_approved, false) then greatest(0, coalesce(s.submitted_problems, 0)) else 0 end;
  v_any      := coalesce(p_time_approved, false) or coalesce(p_problems_approved, false);
  v_status   := case when v_any then 'approved' else 'rejected' end;

  if v_minutes > 0 or v_problems > 0 then
    insert into public.study_logs as l (
      student_id, date, minutes, problems,
      academy_minutes, academy_problems, homework_minutes, homework_problems, updated_at
    )
    values (
      s.student_id, s.date, v_minutes, v_problems,
      0, 0, v_minutes, v_problems, now()
    )
    on conflict (student_id, date) do update
      set minutes           = l.minutes + excluded.minutes,
          problems          = l.problems + excluded.problems,
          homework_minutes  = l.homework_minutes + excluded.homework_minutes,
          homework_problems = l.homework_problems + excluded.homework_problems,
          updated_at        = now()
    returning * into v_log;
  else
    select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;
  end if;

  update public.homework_submissions
     set status           = v_status,
         time_verdict     = case when coalesce(p_time_approved, false) then 'approved' else 'rejected' end,
         problems_verdict = case when coalesce(p_problems_approved, false) then 'approved' else 'rejected' end,
         approved_minutes = v_minutes,
         approved_problems = v_problems,
         reject_reason    = nullif(btrim(coalesce(p_reject_reason, '')), ''),
         teacher_comment  = case when v_any then v_comment else null end,
         reviewed_at      = now(),
         reviewed_by      = '선오공이',
         updated_at       = now()
   where id = s.id
   returning * into s;

  -- 드래곤볼은 숙제 승인과 별개다 — 여기서 드래곤볼을 주지 않는다.
  return jsonb_build_object(
    'submission', to_jsonb(s),
    'log',        to_jsonb(v_log),
    'minutes',    v_minutes,
    'problems',   v_problems,
    'status',     v_status
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3.8.5 자동 종료된 숙제 공부 중 문제 수를 아직 받지 못한 제출 (학생 다음 접속)
-- ---------------------------------------------------------------------
create or replace function public.pending_homework_submissions(p_student_id uuid)
returns setof public.homework_submissions
language sql
stable
security definer
set search_path = public
as $$
  select *
    from public.homework_submissions
   where student_id = p_student_id
     and status = 'pending'
     and submitted_problems is null
     and date >= (public.kst_today() - 30)
   order by coalesce(ended_at, created_at) asc, created_at asc;
$$;

-- ---------------------------------------------------------------------
-- 3.8.6 기존 함수 연결
--    7-1. finish_session: 숙제 공부는 기록에 바로 넣지 않고 승인 대기로 넘긴다
--    7-2. auto_end_paused_session: 숙제 공부의 60분 자동 종료도 승인 대기로 넘긴다
--    7-3. 정리: 숙제 세션은 문제 수 대기 목록에서 뺀다 (제출 표가 대신 물어본다)
-- ---------------------------------------------------------------------

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

  -- 숙제 공부는 사진·문제 수와 함께 승인 대기로 넘긴다 (study_logs 에 바로 넣지 않는다)
  if coalesce(s.kind, 'academy') = 'homework' then
    return public.close_homework_session(s.id, p_problems, '{}'::text[]);
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

create or replace function public.auto_end_paused_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s      public.study_sessions;
  v_end  timestamptz;
  v_cap  timestamptz;
  v_secs integer;
  v_mins integer;
  v_kind text;
  v_log  public.study_logs;
  v_res  jsonb;
begin
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  -- 이미 끝난 세션 → 그대로
  if s.status = 'finished' then
    select * into v_log
      from public.study_logs
     where student_id = s.student_id and date = s.date;

    return jsonb_build_object(
      'session',          to_jsonb(s),
      'log',              to_jsonb(v_log),
      'seconds',          coalesce(s.minutes, 0) * 60,
      'minutes',          coalesce(s.minutes, 0),
      'problems',         coalesce(s.problems, 0),
      'total_minutes',    coalesce(v_log.minutes, 0),
      'total_problems',   coalesce(v_log.problems, 0),
      'date',             s.date,
      'kind',             s.kind,
      'problems_pending', s.problems_pending,
      'already_finished', true
    );
  end if;

  -- 공부 중인 세션은 자동 종료하지 않는다 (쉬는 중일 때만)
  if s.status <> 'paused' then
    return jsonb_build_object(
      'session',          to_jsonb(s),
      'log',              null,
      'seconds',          0,
      'minutes',          0,
      'problems',         0,
      'total_minutes',    0,
      'total_problems',   0,
      'date',             s.date,
      'kind',             s.kind,
      'problems_pending', false,
      'not_paused',       true
    );
  end if;

  -- 숙제 공부는 승인 대기 제출로 넘긴다 (문제 수는 다음 접속 때 제출 표에서 받는다)
  if coalesce(s.kind, 'academy') = 'homework' then
    v_res := public.close_homework_session(s.id, null, '{}'::text[]);
    return v_res || jsonb_build_object(
      'problems_pending', coalesce((v_res ->> 'pending_approval')::boolean, false),
      'auto_ended',       true
    );
  end if;

  -- 공부를 멈춘 시각까지가 공부 시간이다 (쉬는 동안의 시간은 세지 않는다)
  v_end := coalesce(s.paused_at, now());

  -- 그 날 자정을 넘긴 공부는 기록하지 않고 세션만 버린다 (기존 규칙과 같다)
  v_cap := ((s.date + 1)::timestamp at time zone 'Asia/Seoul') - interval '1 second';
  if v_end > v_cap then
    delete from public.study_sessions where id = s.id;

    select * into v_log
      from public.study_logs
     where student_id = s.student_id and date = s.date;

    return jsonb_build_object(
      'session',          null,
      'log',              null,
      'seconds',          0,
      'minutes',          0,
      'problems',         0,
      'total_minutes',    coalesce(v_log.minutes, 0),
      'total_problems',   coalesce(v_log.problems, 0),
      'date',             s.date,
      'kind',             s.kind,
      'problems_pending', false,
      'discarded',        true
    );
  end if;

  v_secs := greatest(0, floor(extract(epoch from (v_end - s.started_at)))::integer - s.paused_seconds);
  if v_secs > 18000 then
    v_secs := 18000;
  end if;
  v_mins := (v_secs / 60)::integer;
  v_kind := case when s.kind = 'homework' then 'homework' else 'academy' end;

  update public.study_sessions
     set status           = 'finished',
         ended_at         = v_end,
         paused_at        = null,
         last_pause_auto  = false,
         minutes          = v_mins,
         problems         = null,               -- 아직 모른다 (problems_pending 으로 표시)
         problems_pending = (v_mins > 0),       -- 1분도 안 됐으면 물어볼 것이 없다
         auto_ended       = true
   where id = s.id
   returning * into s;

  if v_mins > 0 then
    -- 문제 수는 0으로 넣어 두고, 나중에 set_session_problems() 가 더한다
    insert into public.study_logs as l (
      student_id, date, minutes, problems,
      academy_minutes, academy_problems, homework_minutes, homework_problems, updated_at
    )
    values (
      s.student_id, s.date, v_mins, 0,
      case when v_kind = 'academy'  then v_mins else 0 end,
      0,
      case when v_kind = 'homework' then v_mins else 0 end,
      0,
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
  else
    -- 공부한 시간이 0분이면 기록 줄도 만들지 않는다 (그 날 기록은 그대로)
    select * into v_log
      from public.study_logs
     where student_id = s.student_id and date = s.date;
  end if;

  return jsonb_build_object(
    'session',          to_jsonb(s),
    'log',              to_jsonb(v_log),
    'seconds',          v_secs,
    'minutes',          v_mins,
    'problems',         0,
    'total_minutes',    coalesce(v_log.minutes, 0),
    'total_problems',   coalesce(v_log.problems, 0),
    'date',             s.date,
    'kind',             v_kind,
    'problems_pending', s.problems_pending,
    'auto_ended',       true
  );
end;
$$;

-- 숙제 세션은 문제 수 대기 목록에서 뺀다 (문제 수·사진은 제출 표가 물어본다)
create or replace function public.pending_problem_sessions(p_student_id uuid)
returns setof public.study_sessions
language sql
stable
security definer
set search_path = public
as $$
  select *
    from public.study_sessions
   where student_id = p_student_id
     and status = 'finished'
     and coalesce(kind, 'academy') = 'academy'
     and problems_pending
     and coalesce(minutes, 0) > 0
     and date >= (public.kst_today() - 30)
   order by coalesce(ended_at, created_at) asc, created_at asc;
$$;

-- ---------------------------------------------------------------------
-- 3.8.7 Storage — 숙제 사진 버킷 (비공개)
--    무료 플랜 용량을 아끼려고 앱에서 긴 변 1200px · JPEG 0.72 로 줄여 올린다(장당 100~150KB).
--    버킷 자체 상한은 5MB 로 두어 원본이 그대로 올라가는 일을 막는다.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'homework-photos',
  'homework-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists homework_photos_read   on storage.objects;
drop policy if exists homework_photos_insert on storage.objects;
drop policy if exists homework_photos_update on storage.objects;
drop policy if exists homework_photos_delete on storage.objects;

create policy homework_photos_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'homework-photos');

create policy homework_photos_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'homework-photos');

create policy homework_photos_update on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'homework-photos')
  with check (bucket_id = 'homework-photos');

create policy homework_photos_delete on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'homework-photos');

-- ---------------------------------------------------------------------
-- 4. 권한 · RLS
--    앱은 익명 키(anon)로 동작합니다. 관리자 화면은 앱 안의 비밀번호로 입장합니다.
-- ---------------------------------------------------------------------

alter table public.students         enable row level security;
alter table public.study_sessions   enable row level security;
alter table public.study_logs       enable row level security;
alter table public.study_questions  enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.dragonball_grants enable row level security;

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

drop policy if exists push_subscriptions_anon_all on public.push_subscriptions;
create policy push_subscriptions_anon_all on public.push_subscriptions
  for all to anon, authenticated using (true) with check (true);

drop policy if exists dragonball_grants_anon_all on public.dragonball_grants;
create policy dragonball_grants_anon_all on public.dragonball_grants
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
grant select, insert, update, delete on public.students, public.study_sessions, public.study_logs, public.study_questions, public.push_subscriptions, public.dragonball_grants to anon, authenticated;

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
grant execute on function public.auto_end_paused_session(uuid) to anon, authenticated;
grant execute on function public.set_session_problems(uuid, integer) to anon, authenticated;
grant execute on function public.pending_problem_sessions(uuid) to anon, authenticated;
grant execute on function public.set_student_nickname(uuid, text) to anon, authenticated;
grant execute on function public.student_profile(uuid) to anon, authenticated;
grant execute on function public.student_dragonballs(uuid) to anon, authenticated;
grant execute on function public.live_study_board(uuid) to anon, authenticated;
grant execute on function public.craft_rainbow_ball(uuid) to anon, authenticated;
grant execute on function public.grant_dragonballs(uuid[], integer, text, text) to anon, authenticated;


-- =====================================================================
-- 2026-11-22 추가: 일반용 7종 · 무지개용 · 교환권 (migrate-2026-11-22-color-dragons-tickets.sql)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. students — 일반용 · 교환권
-- ---------------------------------------------------------------------
alter table public.students
  add column if not exists dragons jsonb not null
  default '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb;

alter table public.students add column if not exists rainbow_dragon_count integer not null default 0;
alter table public.students add column if not exists candy_tickets        integer not null default 0;
alter table public.students add column if not exists point_1000_tickets   integer not null default 0;
alter table public.students add column if not exists point_10000_tickets  integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'students_dragons_check') then
    alter table public.students
      add constraint students_dragons_check
      check (
        jsonb_typeof(dragons) = 'object'
        and dragons ? 'red' and dragons ? 'orange' and dragons ? 'yellow'
        and dragons ? 'green' and dragons ? 'blue' and dragons ? 'navy'
        and dragons ? 'purple'
        and (dragons ->> 'red')::int    >= 0
        and (dragons ->> 'orange')::int >= 0
        and (dragons ->> 'yellow')::int >= 0
        and (dragons ->> 'green')::int  >= 0
        and (dragons ->> 'blue')::int   >= 0
        and (dragons ->> 'navy')::int   >= 0
        and (dragons ->> 'purple')::int >= 0
      );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'students_rainbow_dragon_count_check') then
    alter table public.students
      add constraint students_rainbow_dragon_count_check check (rainbow_dragon_count >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'students_tickets_check') then
    alter table public.students
      add constraint students_tickets_check
      check (candy_tickets >= 0 and point_1000_tickets >= 0 and point_10000_tickets >= 0);
  end if;
end $$;

-- 예전 무지개 볼 → 일반용 1마리 (색은 학생 id 로 정해져 다시 실행해도 그대로)
do $$
declare
  v_colors text[] := array['red', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple'];
  r        record;
  v_map    jsonb;
  v_color  text;
  i        integer;
begin
  for r in
    select s.id,
           coalesce(s.rainbow_ball_count, 0) as rb,
           coalesce(s.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb) as map
      from public.students s
     where coalesce(s.rainbow_ball_count, 0) > 0
  loop
    v_map := r.map;
    for i in 1 .. r.rb loop
      v_color := v_colors[1 + (abs(hashtext(r.id::text || ':' || i::text)) % 7)];
      v_map := jsonb_set(
        v_map,
        array[v_color],
        to_jsonb(coalesce((v_map ->> v_color)::int, 0) + 1)
      );
    end loop;
    update public.students
       set dragons            = v_map,
           rainbow_ball_count = 0
     where id = r.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. ticket_uses — 관리자가 교환권을 사용 처리한 이력
-- ---------------------------------------------------------------------
create table if not exists public.ticket_uses (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete cascade,
  ticket      text not null check (ticket in ('candy', 'point1000', 'point10000')),
  amount      integer not null default 1 check (amount > 0),
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists ticket_uses_created_idx on public.ticket_uses (created_at desc);
create index if not exists ticket_uses_student_idx on public.ticket_uses (student_id, created_at desc);

comment on column public.students.dragons is '일반용 보유 맵 (red·orange·yellow·green·blue·navy·purple)';
comment on column public.students.rainbow_dragon_count is '무지개용 마리 수';
comment on column public.students.candy_tickets is '성구 2개로 바꾼 사탕교환권 장 수 (관리자가 사용 처리)';
comment on column public.students.point_1000_tickets is '일반용 1마리로 바꾼 1,000포인트 교환권 장 수';
comment on column public.students.point_10000_tickets is '무지개용 1마리로 바꾼 10,000포인트 교환권 장 수';

-- ---------------------------------------------------------------------
-- 3. 내 닉네임 · 드래곤볼 · 일반용 · 교환권
-- ---------------------------------------------------------------------
create or replace function public.student_profile(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.students;
begin
  select * into v_row from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'nickname',              v_row.nickname,
    'dragonball_count',      coalesce(v_row.dragonball_count, 0),
    'dragonballs',           coalesce(v_row.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb),
    'dragons',               coalesce(v_row.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb),
    'rainbow_dragon_count',  coalesce(v_row.rainbow_dragon_count, 0),
    'candy_tickets',         coalesce(v_row.candy_tickets, 0),
    'point_1000_tickets',    coalesce(v_row.point_1000_tickets, 0),
    'point_10000_tickets',   coalesce(v_row.point_10000_tickets, 0),
    -- 예전 화면과의 호환용 (지금은 쓰지 않는다)
    'rainbow_ball_count',    coalesce(v_row.rainbow_ball_count, 0)
  );
end;
$$;

-- 내 드래곤볼 도감 — 성구·일반용·교환권과 지금 할 수 있는 것
create or replace function public.student_dragonballs(p_student_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with s as (
    select * from public.students where id = p_student_id
  )
  select jsonb_build_object(
           'dragonballs',          coalesce(s.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb),
           'total',                coalesce(s.dragonball_count, 0),
           'collected',            (select count(*) from jsonb_each_text(coalesce(s.dragonballs, '{}'::jsonb)) as e(key, value)
                                      where e.value::int > 0),
           'dragons',              coalesce(s.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb),
           'dragon_total',         (select coalesce(sum(value::int), 0) from jsonb_each_text(
                                      coalesce(s.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb))),
           'rainbow_dragon_count', coalesce(s.rainbow_dragon_count, 0),
           'rainbow_dragon_ready', not exists (
                                     select 1 from jsonb_each_text(
                                       coalesce(s.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb)) as e(key, value)
                                      where e.value::int < 1
                                   ),
           'color_dragon_ready',   not exists (
                                     select 1 from jsonb_each_text(coalesce(s.dragonballs, '{}'::jsonb)) as e(key, value)
                                      where e.value::int < 1
                                   )
                                   and (select count(*) from jsonb_each_text(coalesce(s.dragonballs, '{}'::jsonb))) = 7,
           'candy_ready',          coalesce(s.dragonball_count, 0) >= 2,
           'candy_tickets',        coalesce(s.candy_tickets, 0),
           'point_1000_tickets',   coalesce(s.point_1000_tickets, 0),
           'point_10000_tickets',  coalesce(s.point_10000_tickets, 0),
           'rainbow_ball_count',   coalesce(s.rainbow_ball_count, 0)
         )
    from s;
$$;

-- ---------------------------------------------------------------------
-- 4. 성구 2개 → 사탕교환권 1장
--    학생이 고른 성구 2개(p_stars)를 그대로 차감한다. 같은 성구 2개도 된다.
--    p_stars 가 없으면(예전 화면) 가장 많이 가진 성구부터 차감한다 (같으면 낮은 성구 먼저).
--    반환: {exchanged, used:[성구,성구], candy_tickets, dragonballs, total, collected}
-- ---------------------------------------------------------------------
drop function if exists public.exchange_candy_ticket(uuid);

create or replace function public.exchange_candy_ticket(p_student_id uuid, p_stars integer[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    public.students;
  v_map    jsonb;
  v_total  integer;
  v_pick   integer[] := '{}'::integer[];
  v_star   integer;
  v_have   integer;
  step     integer;
begin
  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_map   := coalesce(v_row.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb);
  v_total := coalesce(v_row.dragonball_count, 0);

  if p_stars is null then
    /* 예전 화면 — 가장 많이 가진 성구부터 (같으면 낮은 성구) */
    if v_total < 2 then
      raise exception 'dragonballs_shortage' using errcode = '22023';
    end if;

    for step in 1 .. 2 loop
      select t.star into v_star
        from generate_series(1, 7) as t(star)
       where coalesce((v_map ->> t.star::text)::int, 0) > 0
       order by coalesce((v_map ->> t.star::text)::int, 0) desc, t.star asc
       limit 1;

      if v_star is null then
        raise exception 'dragonballs_shortage' using errcode = '22023';
      end if;

      v_pick := v_pick || v_star;
      v_map  := jsonb_set(
        v_map,
        array[v_star::text],
        to_jsonb(coalesce((v_map ->> v_star::text)::int, 0) - 1)
      );
    end loop;
  else
    /* 학생이 고른 성구 — 정확히 2개, 1~7성구, 가진 만큼만 */
    if coalesce(array_length(p_stars, 1), 0) <> 2 then
      raise exception 'invalid_stars' using errcode = '22023';
    end if;

    foreach v_star in array p_stars loop
      if v_star is null or v_star < 1 or v_star > 7 then
        raise exception 'invalid_stars' using errcode = '22023';
      end if;

      v_have := coalesce((v_map ->> v_star::text)::int, 0);
      if v_have < 1 then
        raise exception 'dragonballs_shortage' using errcode = '22023';
      end if;

      v_pick := v_pick || v_star;
      v_map  := jsonb_set(v_map, array[v_star::text], to_jsonb(v_have - 1));
    end loop;
  end if;

  v_total := greatest(0, v_total - 2);

  update public.students
     set dragonballs      = v_map,
         dragonball_count = v_total,
         candy_tickets    = coalesce(candy_tickets, 0) + 1
   where id = p_student_id;

  return jsonb_build_object(
    'exchanged',     true,
    'used',          to_jsonb(v_pick),
    'candy_tickets', coalesce(v_row.candy_tickets, 0) + 1,
    'dragonballs',   v_map,
    'total',         v_total,
    'collected',     (select count(*) from jsonb_each_text(v_map) as e(key, value)
                        where e.value::int > 0)
  );
end;
$$;

comment on function public.exchange_candy_ticket(uuid, integer[]) is
  '성구 2개 → 사탕교환권 1장. p_stars 로 쓸 성구를 직접 지정(같은 성구 2개 허용), 없으면 가장 많은 성구부터';

-- ---------------------------------------------------------------------
-- 5. 1~7성구 하나씩 → 일반용 랜덤 1마리
--    반환: {crafted, color, dragons, dragon_total, rainbow_dragon_count,
--           dragonballs, total, collected, rainbow_dragon_ready}
-- ---------------------------------------------------------------------
create or replace function public.craft_color_dragon(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.students;
  v_colors  text[] := array['red', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple'];
  v_map     jsonb;
  v_dragons jsonb;
  v_total   integer;
  v_need    integer := 0;
  v_color   text;
  star      integer;
begin
  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_map     := coalesce(v_row.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb);
  v_total   := coalesce(v_row.dragonball_count, 0);
  v_dragons := coalesce(v_row.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb);

  for star in 1 .. 7 loop
    if coalesce((v_map ->> star::text)::int, 0) < 1 then
      v_need := v_need + 1;
    end if;
  end loop;

  if v_need > 0 then
    raise exception 'dragonballs_incomplete' using errcode = '22023';
  end if;

  v_color := v_colors[1 + floor(random() * 7)::int];

  for star in 1 .. 7 loop
    v_map := jsonb_set(
      v_map,
      array[star::text],
      to_jsonb(greatest(0, coalesce((v_map ->> star::text)::int, 0) - 1))
    );
  end loop;

  v_dragons := jsonb_set(
    v_dragons,
    array[v_color],
    to_jsonb(coalesce((v_dragons ->> v_color)::int, 0) + 1)
  );
  v_total := greatest(0, v_total - 7);

  update public.students
     set dragonballs        = v_map,
         dragonball_count   = v_total,
         dragons            = v_dragons
   where id = p_student_id;

  return jsonb_build_object(
    'crafted',              true,
    'color',                v_color,
    'dragons',              v_dragons,
    'dragon_total',         (select coalesce(sum(value::int), 0) from jsonb_each_text(v_dragons)),
    'rainbow_dragon_count', coalesce(v_row.rainbow_dragon_count, 0),
    'rainbow_dragon_ready', not exists (
                              select 1 from jsonb_each_text(v_dragons) as e(key, value)
                               where e.value::int < 1
                            ),
    'dragonballs',          v_map,
    'total',                v_total,
    'collected',            (select count(*) from jsonb_each_text(v_map) as e(key, value)
                               where e.value::int > 0)
  );
end;
$$;

-- 예전 이름(craft_rainbow_ball)으로 부르는 화면도 그대로 동작하게 남겨 둔다
create or replace function public.craft_rainbow_ball(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  v := public.craft_color_dragon(p_student_id);
  return v || jsonb_build_object('rainbow_ball_count', 0);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. 일반용 하나씩 → 무지개용 1마리
--    반환: {crafted, rainbow_dragon_count, dragons, dragon_total, rainbow_dragon_ready}
-- ---------------------------------------------------------------------
create or replace function public.craft_rainbow_dragon(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.students;
  v_colors  text[] := array['red', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple'];
  v_dragons jsonb;
  v_need    integer := 0;
  v_color   text;
begin
  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_dragons := coalesce(v_row.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb);

  foreach v_color in array v_colors loop
    if coalesce((v_dragons ->> v_color)::int, 0) < 1 then
      v_need := v_need + 1;
    end if;
  end loop;

  if v_need > 0 then
    raise exception 'dragons_incomplete' using errcode = '22023';
  end if;

  foreach v_color in array v_colors loop
    v_dragons := jsonb_set(
      v_dragons,
      array[v_color],
      to_jsonb(greatest(0, coalesce((v_dragons ->> v_color)::int, 0) - 1))
    );
  end loop;

  update public.students
     set dragons               = v_dragons,
         rainbow_dragon_count  = coalesce(rainbow_dragon_count, 0) + 1
   where id = p_student_id;

  return jsonb_build_object(
    'crafted',              true,
    'rainbow_dragon_count', coalesce(v_row.rainbow_dragon_count, 0) + 1,
    'dragons',              v_dragons,
    'dragon_total',         (select coalesce(sum(value::int), 0) from jsonb_each_text(v_dragons)),
    'rainbow_dragon_ready', false
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 7. 일반용 · 무지개용 → 포인트 교환권
--    · p_kind = 'dragon'  : 일반용 1마리 → 1,000포인트 교환권 1장
--                           (가장 많이 모은 색부터, 같으면 색 순서대로)
--    · p_kind = 'rainbow' : 무지개용 1마리 → 10,000포인트 교환권 1장
-- ---------------------------------------------------------------------
create or replace function public.exchange_point_ticket(p_student_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.students;
  v_kind    text := case when p_kind = 'rainbow' then 'rainbow' else 'dragon' end;
  v_colors  text[] := array['red', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple'];
  v_dragons jsonb;
  v_color   text;
  v_rainbow integer;
begin
  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_dragons := coalesce(v_row.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb);
  v_rainbow := coalesce(v_row.rainbow_dragon_count, 0);

  if v_kind = 'rainbow' then
    if v_rainbow < 1 then
      raise exception 'rainbow_dragon_shortage' using errcode = '22023';
    end if;
    update public.students
       set rainbow_dragon_count = v_rainbow - 1,
           point_10000_tickets  = coalesce(point_10000_tickets, 0) + 1
     where id = p_student_id;
    return jsonb_build_object(
      'exchanged',            true,
      'kind',                 'rainbow',
      'dragons',              v_dragons,
      'dragon_total',         (select coalesce(sum(value::int), 0) from jsonb_each_text(v_dragons)),
      'rainbow_dragon_count', v_rainbow - 1,
      'point_1000_tickets',   coalesce(v_row.point_1000_tickets, 0),
      'point_10000_tickets',  coalesce(v_row.point_10000_tickets, 0) + 1
    );
  end if;

  if (select coalesce(sum(value::int), 0) from jsonb_each_text(v_dragons)) < 1 then
    raise exception 'dragons_shortage' using errcode = '22023';
  end if;

  select c into v_color
    from unnest(v_colors) with ordinality as t(c, ord)
   where coalesce((v_dragons ->> t.c)::int, 0) > 0
   order by coalesce((v_dragons ->> t.c)::int, 0) desc, t.ord asc
   limit 1;

  v_dragons := jsonb_set(
    v_dragons,
    array[v_color],
    to_jsonb(greatest(0, coalesce((v_dragons ->> v_color)::int, 0) - 1))
  );

  update public.students
     set dragons             = v_dragons,
         point_1000_tickets  = coalesce(point_1000_tickets, 0) + 1
   where id = p_student_id;

  return jsonb_build_object(
    'exchanged',            true,
    'kind',                 'dragon',
    'color',                v_color,
    'dragons',              v_dragons,
    'dragon_total',         (select coalesce(sum(value::int), 0) from jsonb_each_text(v_dragons)),
    'rainbow_dragon_count', v_rainbow,
    'point_1000_tickets',   coalesce(v_row.point_1000_tickets, 0) + 1,
    'point_10000_tickets',  coalesce(v_row.point_10000_tickets, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 8. 관리자 — 실제로 지급한 교환권을 사용 처리(차감)
--    p_ticket: 'candy' | 'point1000' | 'point10000'
-- ---------------------------------------------------------------------
create or replace function public.use_ticket(
  p_student_id uuid,
  p_ticket     text,
  p_amount     integer default 1,
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    public.students;
  v_ticket text := case
                     when p_ticket in ('candy', 'point1000', 'point10000') then p_ticket
                     else null
                   end;
  v_amount integer := floor(coalesce(p_amount, 1))::integer;
  v_have   integer;
begin
  if v_ticket is null then
    raise exception 'invalid_ticket' using errcode = '22023';
  end if;
  if v_amount < 1 or v_amount > 50 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_have := case v_ticket
              when 'candy'      then coalesce(v_row.candy_tickets, 0)
              when 'point1000'  then coalesce(v_row.point_1000_tickets, 0)
              else                   coalesce(v_row.point_10000_tickets, 0)
            end;

  if v_have < v_amount then
    raise exception 'ticket_shortage' using errcode = '22023';
  end if;

  if v_ticket = 'candy' then
    update public.students set candy_tickets = candy_tickets - v_amount where id = p_student_id;
  elsif v_ticket = 'point1000' then
    update public.students set point_1000_tickets = point_1000_tickets - v_amount where id = p_student_id;
  else
    update public.students set point_10000_tickets = point_10000_tickets - v_amount where id = p_student_id;
  end if;

  insert into public.ticket_uses (student_id, ticket, amount, note)
  values (p_student_id, v_ticket, v_amount, nullif(btrim(coalesce(p_note, '')), ''));

  select * into v_row from public.students where id = p_student_id;
  return jsonb_build_object(
    'used',                true,
    'student_id',          p_student_id,
    'ticket',              v_ticket,
    'amount',              v_amount,
    'candy_tickets',       coalesce(v_row.candy_tickets, 0),
    'point_1000_tickets',  coalesce(v_row.point_1000_tickets, 0),
    'point_10000_tickets', coalesce(v_row.point_10000_tickets, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 9. 근두운 — 친구 줄에 일반용·무지개용도 함께
-- ---------------------------------------------------------------------
create or replace function public.live_study_board(p_student_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r         record;
  v_rows    jsonb := '[]'::jsonb;
  v_running integer := 0;
  v_now     timestamptz := now();
  v_secs    integer;
  v_empty   jsonb := '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb;
  v_nodragon jsonb := '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb;
begin
  -- 지난 날짜에 시작한 미종료 세션이 남아 있으면 먼저 정리한다
  perform public.maybe_cleanup_stale_study_sessions();

  -- 숙제 공부는 하트비트가 30초 끊기면 일시정지로 본다 (reconcile_session 과 같은 규칙)
  update public.study_sessions s
     set status           = 'paused',
         paused_at        = s.last_heartbeat_at,
         auto_pause_count = s.auto_pause_count + 1,
         last_pause_auto  = true
   where s.status = 'running'
     and s.kind = 'homework'
     and s.date = public.kst_today()
     and v_now - s.last_heartbeat_at > interval '30 seconds';

  for r in
    select s.student_id, s.status, s.started_at, s.paused_at, s.ended_at, s.paused_seconds,
           coalesce(st.dragonballs, v_empty) as dragonballs,
           coalesce(st.dragons, v_nodragon) as dragons,
           coalesce(st.rainbow_dragon_count, 0) as rainbow_dragon_count,
           coalesce(nullif(btrim(st.nickname), ''), '수련생') as nickname
      from public.study_sessions s
      join public.students st on st.id = s.student_id
     where s.status <> 'finished'
       and s.date = public.kst_today()
     order by s.started_at asc
  loop
    v_secs := public.session_elapsed_seconds(
      r.started_at, r.paused_at, r.ended_at, r.status, r.paused_seconds
    );

    continue when v_secs >= 18000;

    if r.status = 'running' then
      v_running := v_running + 1;
    end if;

    v_rows := v_rows || jsonb_build_array(
      jsonb_build_object(
        'nickname',             r.nickname,
        'status',               r.status,
        'started_at',           r.started_at,
        'seconds',              v_secs,
        'is_me',                (p_student_id is not null and r.student_id = p_student_id),
        'dragonballs',          r.dragonballs,
        'dragons',              r.dragons,
        'rainbow_dragon_count', r.rainbow_dragon_count
      )
    );
  end loop;

  return jsonb_build_object(
    'server_now',    v_now,
    'running_count', v_running,
    'students',      v_rows
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 10. 권한 · RLS
-- ---------------------------------------------------------------------
alter table public.ticket_uses enable row level security;

drop policy if exists ticket_uses_anon_all on public.ticket_uses;
create policy ticket_uses_anon_all on public.ticket_uses
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.ticket_uses to anon, authenticated;

grant execute on function public.student_profile(uuid) to anon, authenticated;
grant execute on function public.student_dragonballs(uuid) to anon, authenticated;
grant execute on function public.exchange_candy_ticket(uuid, integer[]) to anon, authenticated;
grant execute on function public.craft_color_dragon(uuid) to anon, authenticated;
grant execute on function public.craft_rainbow_ball(uuid) to anon, authenticated;
grant execute on function public.craft_rainbow_dragon(uuid) to anon, authenticated;
grant execute on function public.exchange_point_ticket(uuid, text) to anon, authenticated;
grant execute on function public.use_ticket(uuid, text, integer, text) to anon, authenticated;
grant execute on function public.live_study_board(uuid) to anon, authenticated;

-- 앱(PostgREST)이 새 표·함수를 바로 알게 한다
notify pgrst, 'reload schema';


-- =====================================================================
-- 2026-11-22 추가: 히든 검은용 · 시크릿쿠폰 (migrate-2026-11-22-secret-black-dragon.sql)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. students — 검은용 · 시크릿쿠폰
-- ---------------------------------------------------------------------
alter table public.students add column if not exists black_dragon_count integer not null default 0;
alter table public.students add column if not exists secret_tickets     integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'students_black_dragon_count_check') then
    alter table public.students
      add constraint students_black_dragon_count_check check (black_dragon_count >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'students_secret_tickets_check') then
    alter table public.students
      add constraint students_secret_tickets_check check (secret_tickets >= 0);
  end if;
end $$;

comment on column public.students.black_dragon_count is '히든 검은용 마리 수 (가진 학생에게만 화면에 보인다)';
comment on column public.students.secret_tickets is '검은용 1마리를 바꾼 시크릿쿠폰 장 수';

-- ticket_uses 의 교환권 종류에 secret 추가
alter table public.ticket_uses drop constraint if exists ticket_uses_ticket_check;
alter table public.ticket_uses
  add constraint ticket_uses_ticket_check
  check (ticket in ('candy', 'point1000', 'point10000', 'secret'));

-- ---------------------------------------------------------------------
-- 2. 검은용이 함께 나올지 — 1/1,000 (보너스)
--    · 앱(anon)에는 실행 권한을 주지 않는다 (함수 안에서만 쓴다)
--    · 검증할 때는 set_config('sunogong.force_black','on'/'off',true) 로 결과를 고정한다
-- ---------------------------------------------------------------------
create or replace function public.roll_black_dragon()
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_force text := coalesce(current_setting('sunogong.force_black', true), '');
begin
  if v_force = 'on' then
    return true;
  end if;
  if v_force = 'off' then
    return false;
  end if;
  return random() < 0.001;
end;
$$;

revoke execute on function public.roll_black_dragon() from public;
revoke execute on function public.roll_black_dragon() from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. 일반용 뽑기 — 원래 나온 용은 그대로, 가끔 검은용이 함께
-- ---------------------------------------------------------------------
create or replace function public.craft_color_dragon(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.students;
  v_colors  text[] := array['red', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple'];
  v_map     jsonb;
  v_dragons jsonb;
  v_total   integer;
  v_need    integer := 0;
  v_color   text;
  v_black   boolean := false;
  v_blacks  integer;
  star      integer;
begin
  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_map     := coalesce(v_row.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb);
  v_total   := coalesce(v_row.dragonball_count, 0);
  v_dragons := coalesce(v_row.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb);
  v_blacks  := coalesce(v_row.black_dragon_count, 0);

  for star in 1 .. 7 loop
    if coalesce((v_map ->> star::text)::int, 0) < 1 then
      v_need := v_need + 1;
    end if;
  end loop;

  if v_need > 0 then
    raise exception 'dragonballs_incomplete' using errcode = '22023';
  end if;

  v_color := v_colors[1 + floor(random() * 7)::int];
  v_black := public.roll_black_dragon();

  for star in 1 .. 7 loop
    v_map := jsonb_set(
      v_map,
      array[star::text],
      to_jsonb(greatest(0, coalesce((v_map ->> star::text)::int, 0) - 1))
    );
  end loop;

  v_dragons := jsonb_set(
    v_dragons,
    array[v_color],
    to_jsonb(coalesce((v_dragons ->> v_color)::int, 0) + 1)
  );
  v_total := greatest(0, v_total - 7);

  update public.students
     set dragonballs         = v_map,
         dragonball_count    = v_total,
         dragons             = v_dragons,
         black_dragon_count  = v_blacks + case when v_black then 1 else 0 end
   where id = p_student_id;

  return jsonb_build_object(
    'crafted',              true,
    'color',                v_color,
    'dragons',              v_dragons,
    'dragon_total',         (select coalesce(sum(value::int), 0) from jsonb_each_text(v_dragons)),
    'rainbow_dragon_count', coalesce(v_row.rainbow_dragon_count, 0),
    'rainbow_dragon_ready', not exists (
                              select 1 from jsonb_each_text(v_dragons) as e(key, value)
                               where e.value::int < 1
                            ),
    'bonus_black',          v_black,
    'black_dragon_count',   v_blacks + case when v_black then 1 else 0 end,
    'dragonballs',          v_map,
    'total',                v_total,
    'collected',            (select count(*) from jsonb_each_text(v_map) as e(key, value)
                               where e.value::int > 0)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. 무지개용 — 원래 만들어지는 무지개용은 그대로, 가끔 검은용이 함께
-- ---------------------------------------------------------------------
create or replace function public.craft_rainbow_dragon(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.students;
  v_colors  text[] := array['red', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple'];
  v_dragons jsonb;
  v_need    integer := 0;
  v_color   text;
  v_black   boolean := false;
  v_blacks  integer;
begin
  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_dragons := coalesce(v_row.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb);
  v_blacks  := coalesce(v_row.black_dragon_count, 0);

  foreach v_color in array v_colors loop
    if coalesce((v_dragons ->> v_color)::int, 0) < 1 then
      v_need := v_need + 1;
    end if;
  end loop;

  if v_need > 0 then
    raise exception 'dragons_incomplete' using errcode = '22023';
  end if;

  foreach v_color in array v_colors loop
    v_dragons := jsonb_set(
      v_dragons,
      array[v_color],
      to_jsonb(greatest(0, coalesce((v_dragons ->> v_color)::int, 0) - 1))
    );
  end loop;

  v_black := public.roll_black_dragon();

  update public.students
     set dragons               = v_dragons,
         rainbow_dragon_count  = coalesce(rainbow_dragon_count, 0) + 1,
         black_dragon_count    = v_blacks + case when v_black then 1 else 0 end
   where id = p_student_id;

  return jsonb_build_object(
    'crafted',              true,
    'rainbow_dragon_count', coalesce(v_row.rainbow_dragon_count, 0) + 1,
    'dragons',              v_dragons,
    'dragon_total',         (select coalesce(sum(value::int), 0) from jsonb_each_text(v_dragons)),
    'rainbow_dragon_ready', false,
    'bonus_black',          v_black,
    'black_dragon_count',   v_blacks + case when v_black then 1 else 0 end
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. 검은용 1마리 → 시크릿쿠폰 1장
-- ---------------------------------------------------------------------
create or replace function public.exchange_secret_ticket(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.students;
begin
  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;
  if coalesce(v_row.black_dragon_count, 0) < 1 then
    raise exception 'black_dragon_shortage' using errcode = '22023';
  end if;

  update public.students
     set black_dragon_count = black_dragon_count - 1,
         secret_tickets     = coalesce(secret_tickets, 0) + 1
   where id = p_student_id;

  return jsonb_build_object(
    'exchanged',          true,
    'black_dragon_count', coalesce(v_row.black_dragon_count, 0) - 1,
    'secret_tickets',     coalesce(v_row.secret_tickets, 0) + 1
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 6. 관리자 — 시크릿쿠폰 사용 처리
-- ---------------------------------------------------------------------
create or replace function public.use_ticket(
  p_student_id uuid,
  p_ticket     text,
  p_amount     integer default 1,
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    public.students;
  v_ticket text := case
                     when p_ticket in ('candy', 'point1000', 'point10000', 'secret') then p_ticket
                     else null
                   end;
  v_amount integer := floor(coalesce(p_amount, 1))::integer;
  v_have   integer;
begin
  if v_ticket is null then
    raise exception 'invalid_ticket' using errcode = '22023';
  end if;
  if v_amount < 1 or v_amount > 50 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_have := case v_ticket
              when 'candy'      then coalesce(v_row.candy_tickets, 0)
              when 'point1000'  then coalesce(v_row.point_1000_tickets, 0)
              when 'point10000' then coalesce(v_row.point_10000_tickets, 0)
              else                   coalesce(v_row.secret_tickets, 0)
            end;

  if v_have < v_amount then
    raise exception 'ticket_shortage' using errcode = '22023';
  end if;

  if v_ticket = 'candy' then
    update public.students set candy_tickets = candy_tickets - v_amount where id = p_student_id;
  elsif v_ticket = 'point1000' then
    update public.students set point_1000_tickets = point_1000_tickets - v_amount where id = p_student_id;
  elsif v_ticket = 'point10000' then
    update public.students set point_10000_tickets = point_10000_tickets - v_amount where id = p_student_id;
  else
    update public.students set secret_tickets = secret_tickets - v_amount where id = p_student_id;
  end if;

  insert into public.ticket_uses (student_id, ticket, amount, note)
  values (p_student_id, v_ticket, v_amount, nullif(btrim(coalesce(p_note, '')), ''));

  select * into v_row from public.students where id = p_student_id;
  return jsonb_build_object(
    'used',                true,
    'student_id',          p_student_id,
    'ticket',              v_ticket,
    'amount',              v_amount,
    'candy_tickets',       coalesce(v_row.candy_tickets, 0),
    'point_1000_tickets',  coalesce(v_row.point_1000_tickets, 0),
    'point_10000_tickets', coalesce(v_row.point_10000_tickets, 0),
    'secret_tickets',      coalesce(v_row.secret_tickets, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 7. 학생 화면이 읽는 값 — 검은용·시크릿쿠폰 (가진 학생만 숫자가 오른다)
-- ---------------------------------------------------------------------
create or replace function public.student_profile(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.students;
begin
  select * into v_row from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'nickname',              v_row.nickname,
    'dragonball_count',      coalesce(v_row.dragonball_count, 0),
    'dragonballs',           coalesce(v_row.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb),
    'dragons',               coalesce(v_row.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb),
    'rainbow_dragon_count',  coalesce(v_row.rainbow_dragon_count, 0),
    'black_dragon_count',    coalesce(v_row.black_dragon_count, 0),
    'candy_tickets',         coalesce(v_row.candy_tickets, 0),
    'point_1000_tickets',    coalesce(v_row.point_1000_tickets, 0),
    'point_10000_tickets',   coalesce(v_row.point_10000_tickets, 0),
    'secret_tickets',        coalesce(v_row.secret_tickets, 0),
    'rainbow_ball_count',    coalesce(v_row.rainbow_ball_count, 0)
  );
end;
$$;

create or replace function public.student_dragonballs(p_student_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with s as (
    select * from public.students where id = p_student_id
  )
  select jsonb_build_object(
           'dragonballs',          coalesce(s.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb),
           'total',                coalesce(s.dragonball_count, 0),
           'collected',            (select count(*) from jsonb_each_text(coalesce(s.dragonballs, '{}'::jsonb)) as e(key, value)
                                      where e.value::int > 0),
           'dragons',              coalesce(s.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb),
           'dragon_total',         (select coalesce(sum(value::int), 0) from jsonb_each_text(
                                      coalesce(s.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb))),
           'rainbow_dragon_count', coalesce(s.rainbow_dragon_count, 0),
           'rainbow_dragon_ready', not exists (
                                     select 1 from jsonb_each_text(
                                       coalesce(s.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb)) as e(key, value)
                                      where e.value::int < 1
                                   ),
           'color_dragon_ready',   not exists (
                                     select 1 from jsonb_each_text(coalesce(s.dragonballs, '{}'::jsonb)) as e(key, value)
                                      where e.value::int < 1
                                   )
                                   and (select count(*) from jsonb_each_text(coalesce(s.dragonballs, '{}'::jsonb))) = 7,
           'candy_ready',          coalesce(s.dragonball_count, 0) >= 2,
           'black_dragon_count',   coalesce(s.black_dragon_count, 0),
           'candy_tickets',        coalesce(s.candy_tickets, 0),
           'point_1000_tickets',   coalesce(s.point_1000_tickets, 0),
           'point_10000_tickets',  coalesce(s.point_10000_tickets, 0),
           'secret_tickets',       coalesce(s.secret_tickets, 0),
           'rainbow_ball_count',   coalesce(s.rainbow_ball_count, 0)
         )
    from s;
$$;

grant execute on function public.exchange_secret_ticket(uuid) to anon, authenticated;
grant execute on function public.use_ticket(uuid, text, integer, text) to anon, authenticated;
grant execute on function public.student_profile(uuid) to anon, authenticated;
grant execute on function public.student_dragonballs(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. 숙제 제출 권한 · RLS (2026-11-23)
-- ---------------------------------------------------------------------
alter table public.homework_submissions enable row level security;

drop policy if exists homework_submissions_anon_all on public.homework_submissions;
create policy homework_submissions_anon_all on public.homework_submissions
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.homework_submissions to anon, authenticated;

grant execute on function public.close_homework_session(uuid, integer, text[]) to anon, authenticated;
grant execute on function public.submit_homework(uuid, integer, text[]) to anon, authenticated;
grant execute on function public.submit_pending_homework(uuid, integer, text[]) to anon, authenticated;
grant execute on function public.review_homework_submission(uuid, boolean, boolean, text, text) to anon, authenticated;
grant execute on function public.pending_homework_submissions(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 10. 숙제 사진 초안 (2026-11-23) — 카메라 전환으로 탭이 튕겨도 이어서 제출
--     사진을 고르는 즉시 1장씩 올리고 그 경로·문제 수를 초안으로 남겨,
--     다시 접속하면 「숙제 공부 제출」 창을 그대로 다시 연다.
--     (supabase/migrate-2026-11-23-homework-photo-resume.sql 과 같은 내용 · 여러 번 실행해도 안전)
-- ---------------------------------------------------------------------
alter table public.homework_submissions
  add column if not exists draft_active   boolean not null default false,
  add column if not exists draft_problems integer,
  add column if not exists draft_open     boolean not null default false;

comment on column public.homework_submissions.draft_active is
  '아직 제출 전인 초안 줄 (사진·문제 수만 저장). 관리자·학생 제출 목록에서는 뺀다';
comment on column public.homework_submissions.draft_problems is
  '초안에 입력 중인 문제 수 (제출하면 submitted_problems 로 옮긴다)';
comment on column public.homework_submissions.draft_open is
  '숙제 공부 제출 창이 열려 있었는지 — 탭이 튕겨 다시 접속하면 이 창을 그대로 다시 연다';

create index if not exists homework_submissions_draft_session_idx
  on public.homework_submissions (session_id)
  where draft_active;

-- ---------------------------------------------------------------------
-- 2. 초안 저장 — 사진 1장을 올릴 때마다 / 문제 수를 누를 때마다 / 창을 열고 닫을 때
--    · p_session_id   : 타이머 화면에서 마칠 때 (아직 안 끝난 세션)
--    · p_submission_id: 다음 접속 때 「지난 숙제 공부 제출」 창에서 (자동 종료된 제출)
--    · p_photo_paths  : 지금까지 담은 사진 경로 전체(빼면 목록에서도 빠진다)
--    · p_problems     : 지금까지 누른 문제 수 (아직 안 눌렀으면 null)
--    · p_open         : 제출 창이 열려 있는지
-- ---------------------------------------------------------------------
create or replace function public.save_homework_draft(
  p_session_id    uuid default null,
  p_submission_id uuid default null,
  p_problems      integer default null,
  p_photo_paths   text[] default '{}',
  p_open          boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s         public.study_sessions;
  v_sub     public.homework_submissions;
  v_paths   text[];
  v_minutes integer;
  v_problems integer;
begin
  -- 사진 경로 정리: 빈 값·중복을 빼고 5장까지만
  v_paths := array(
    select p from (
      select distinct btrim(p) as p from unnest(coalesce(p_photo_paths, '{}'::text[])) as p
    ) t
    where coalesce(t.p, '') <> ''
    limit 5
  );
  v_paths := coalesce(v_paths, '{}'::text[]);

  v_problems := case
    when p_problems is null then null
    else greatest(0, least(9999, p_problems))
  end;

  /* ── (가) 자동 종료된 제출에 이어서 담기 ─────────────────────────── */
  if p_submission_id is not null then
    select * into v_sub from public.homework_submissions where id = p_submission_id for update;
    if not found then
      raise exception 'submission_not_found' using errcode = 'P0002';
    end if;
    if v_sub.status <> 'pending' then
      raise exception 'already_reviewed' using errcode = '22023';
    end if;

    update public.homework_submissions
       set photo_paths    = v_paths,
           draft_problems = v_problems,
           draft_open     = coalesce(p_open, true),
           updated_at     = now()
     where id = v_sub.id
     returning * into v_sub;

    return jsonb_build_object(
      'submission',  to_jsonb(v_sub),
      'photo_paths', v_sub.photo_paths,
      'problems',    v_sub.draft_problems,
      'open',        v_sub.draft_open
    );
  end if;

  /* ── (나) 아직 마치지 않은 숙제 세션의 초안 ───────────────────────── */
  if p_session_id is null then
    raise exception 'draft_target_required' using errcode = '22023';
  end if;

  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if coalesce(s.kind, 'academy') <> 'homework' then
    raise exception 'not_homework_session' using errcode = '22023';
  end if;
  if s.status = 'finished' then
    raise exception 'session_finished' using errcode = '22023';
  end if;

  -- 지금까지의 공부 시간(분) — 제출 전 미리 보여 주기용 (마칠 때 다시 계산한다)
  v_minutes := greatest(
    0,
    least(
      300,
      floor(
        greatest(
          0,
          extract(epoch from (
            coalesce(case when s.status = 'paused' then s.paused_at end, now()) - s.started_at
          )) - coalesce(s.paused_seconds, 0)
        ) / 60
      )::integer
    )
  );

  select * into v_sub from public.homework_submissions where session_id = s.id for update;

  if found then
    if not v_sub.draft_active then
      -- 이미 진짜 제출로 마무리된 세션 — 초안으로 되돌리지 않는다
      raise exception 'already_submitted' using errcode = '22023';
    end if;

    update public.homework_submissions
       set photo_paths       = v_paths,
           draft_problems    = v_problems,
           draft_open        = coalesce(p_open, true),
           submitted_minutes = v_minutes,
           started_at        = coalesce(started_at, s.started_at),
           date              = s.date,
           updated_at        = now()
     where id = v_sub.id
     returning * into v_sub;
  else
    insert into public.homework_submissions (
      student_id, session_id, date, started_at, ended_at,
      submitted_minutes, submitted_problems, photo_paths, status,
      draft_active, draft_problems, draft_open, submitted_at
    )
    values (
      s.student_id, s.id, s.date, s.started_at, null,
      v_minutes, null, v_paths, 'pending',
      true, v_problems, coalesce(p_open, true), now()
    )
    returning * into v_sub;
  end if;

  return jsonb_build_object(
    'submission',  to_jsonb(v_sub),
    'photo_paths', v_sub.photo_paths,
    'problems',    v_sub.draft_problems,
    'open',        v_sub.draft_open
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. 초안 지우기 — 학생이 그만두거나, 1분도 공부하지 않아 남길 것이 없을 때
--    (진짜 제출 줄은 draft_active = false 라 지워지지 않는다)
-- ---------------------------------------------------------------------
create or replace function public.clear_homework_draft(
  p_session_id    uuid default null,
  p_submission_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_session_id is null and p_submission_id is null then
    raise exception 'draft_target_required' using errcode = '22023';
  end if;

  delete from public.homework_submissions
   where draft_active
     and (
       (p_submission_id is not null and id = p_submission_id)
       or (p_session_id is not null and session_id = p_session_id)
     );
  get diagnostics v_count = row_count;

  return jsonb_build_object('deleted', v_count);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. 숙제 세션 마무리 — 초안 줄이 있어도 세션을 제대로 마무리한다
--    finish_session(학생이 직접 종료) · auto_end_paused_session(60분 자동 종료) ·
--    submit_homework(사진과 함께 제출) 이 모두 이 함수를 거친다.
--    같은 세션으로 두 번 불러도 제출 줄은 한 번만 생긴다.
-- ---------------------------------------------------------------------
create or replace function public.close_homework_session(
  p_session_id  uuid,
  p_problems    integer,
  p_photo_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s           public.study_sessions;
  v_end       timestamptz;
  v_cap       timestamptz;
  v_secs      integer;
  v_mins      integer;
  v_problems  integer;
  v_paths     text[];
  v_sub       public.homework_submissions;
  v_existing  uuid;
  v_draft     integer;
  v_log       public.study_logs;
begin
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if coalesce(s.kind, 'academy') <> 'homework' then
    raise exception 'not_homework_session' using errcode = '22023';
  end if;

  if coalesce(array_length(p_photo_paths, 1), 0) > 5 then
    raise exception 'too_many_photos' using errcode = '22023';
  end if;

  -- 사진 경로 정리: 빈 값·중복을 빼고 5장까지만
  v_paths := array(
    select p from (
      select distinct btrim(p) as p from unnest(coalesce(p_photo_paths, '{}'::text[])) as p
    ) t
    where coalesce(t.p, '') <> ''
    limit 5
  );
  v_paths := coalesce(v_paths, '{}'::text[]);

  -- 이 세션의 제출 줄(초안 포함)이 이미 있는지
  select id into v_existing from public.homework_submissions where session_id = s.id;
  select draft_problems into v_draft from public.homework_submissions where session_id = s.id;

  /* ── 이미 마무리된 세션 ──────────────────────────────────────────── */
  if s.status = 'finished' then
    if v_existing is not null then
      select * into v_sub from public.homework_submissions where id = v_existing for update;

      if v_sub.status = 'pending' then
        update public.homework_submissions
           set submitted_problems = coalesce(
                 case when coalesce(p_problems, 0) > 0 then greatest(0, least(9999, p_problems)) end,
                 submitted_problems
               ),
               photo_paths = case
                 when coalesce(array_length(v_paths, 1), 0) > 0
                      and coalesce(array_length(photo_paths, 1), 0) = 0
                   then v_paths
                 else photo_paths
               end,
               draft_active = false,
               draft_open   = false,
               updated_at   = now()
         where id = v_sub.id
         returning * into v_sub;
      end if;

      select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;

      return jsonb_build_object(
        'session',            to_jsonb(s),
        'submission',         to_jsonb(v_sub),
        'submission_id',      v_sub.id,
        'log',                to_jsonb(v_log),
        'seconds',            coalesce(s.minutes, 0) * 60,
        'minutes',            coalesce(s.minutes, 0),
        'problems',           coalesce(v_sub.submitted_problems, 0),
        'submitted_minutes',  v_sub.submitted_minutes,
        'submitted_problems', v_sub.submitted_problems,
        'total_minutes',      coalesce(v_log.minutes, 0),
        'total_problems',     coalesce(v_log.problems, 0),
        'date',               s.date,
        'kind',               'homework',
        'pending_approval',   true,
        'already',            true
      );
    end if;

    -- 서버가 5시간 초과로 먼저 마무리해 둔 세션 — 시간은 그대로 쓰고 기록만 승인 대기로 남긴다
    v_mins := coalesce(s.minutes, 0);
    if coalesce(p_problems, 0) > 0 then
      v_problems := greatest(0, least(9999, p_problems));
    else
      v_problems := coalesce(s.problems, v_draft);   -- 비어 있으면 그대로 비워 둔다(다음 접속 때 받는다)
    end if;
  else
    /* ── 아직 안 끝난 세션 — 지금 마무리한다 (초안 줄이 있어도 OK) ──── */
    v_end := case when s.status = 'paused' then coalesce(s.paused_at, now()) else now() end;

    -- 그 날 자정을 넘긴 공부는 기록하지 않고 세션만 버린다 (예전 규칙과 같다)
    v_cap := ((s.date + 1)::timestamp at time zone 'Asia/Seoul') - interval '1 second';
    if v_end > v_cap then
      delete from public.homework_submissions where session_id = s.id and draft_active;
      delete from public.study_sessions where id = s.id;

      select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;

      return jsonb_build_object(
        'session',          null,
        'submission',       null,
        'log',              null,
        'seconds',          0,
        'minutes',          0,
        'problems',         0,
        'total_minutes',    coalesce(v_log.minutes, 0),
        'total_problems',   coalesce(v_log.problems, 0),
        'date',             s.date,
        'kind',             'homework',
        'pending_approval', false,
        'discarded',        true
      );
    end if;

    v_secs := greatest(0, floor(extract(epoch from (v_end - s.started_at)))::integer - s.paused_seconds);
    if v_secs > 18000 then
      v_secs := 18000;
    end if;
    v_mins := (v_secs / 60)::integer;

    -- 문제 수: 이번에 온 값 → 세션 값 → 초안에 입력해 둔 값 순서로 쓴다.
    -- (60분 자동 종료는 값을 보내지 않는다 — 그때는 초안의 문제 수를 살린다)
    if p_problems is null and coalesce(s.problems, v_draft) is null then
      v_problems := null;
    else
      v_problems := greatest(0, least(9999, coalesce(p_problems, s.problems, v_draft, 0)));
    end if;

    update public.study_sessions
       set status           = 'finished',
           ended_at         = v_end,
           paused_at        = null,
           last_pause_auto  = false,
           minutes          = v_mins,
           problems         = v_problems,
           problems_pending = false
     where id = s.id
     returning * into s;

    select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;

    -- 1분도 공부하지 않았고 문제 수도 없으면 승인할 것이 없다 (기록 줄을 만들지 않는다)
    if v_mins <= 0 and coalesce(v_problems, 0) <= 0 then
      -- 그때 남아 있던 초안 줄(사진만)은 지운다 — 화면에서도 사진을 지운다
      delete from public.homework_submissions where session_id = s.id and draft_active;

      return jsonb_build_object(
        'session',          to_jsonb(s),
        'submission',       null,
        'log',              to_jsonb(v_log),
        'seconds',          v_secs,
        'minutes',          v_mins,
        'problems',         v_problems,
        'total_minutes',    coalesce(v_log.minutes, 0),
        'total_problems',   coalesce(v_log.problems, 0),
        'date',             s.date,
        'kind',             'homework',
        'pending_approval', false,
        'nothing',          true
      );
    end if;
  end if;

  /* ── 제출 줄: 초안이 있으면 그 줄을 채우고, 없으면 새로 만든다 ──────── */
  if v_existing is not null then
    select * into v_sub from public.homework_submissions where id = v_existing for update;

    if v_sub.status = 'pending' then
      -- 초안에 있던 사진 + 이번에 보낸 사진 (5장까지)
      update public.homework_submissions
         set date               = s.date,
             started_at         = coalesce(started_at, s.started_at),
             ended_at           = coalesce(s.ended_at, v_end),
             submitted_minutes  = v_mins,
             submitted_problems = v_problems,
             photo_paths        = (
               select coalesce(array_agg(p), '{}'::text[]) from (
                 select distinct p from unnest(
                   coalesce(photo_paths, '{}'::text[]) || coalesce(v_paths, '{}'::text[])
                 ) as p
                 where coalesce(p, '') <> ''
                 limit 5
               ) t
             ),
             status             = 'pending',
             draft_active       = false,
             draft_problems     = null,
             draft_open         = false,
             submitted_at       = coalesce(submitted_at, now()),
             updated_at         = now()
       where id = v_sub.id
       returning * into v_sub;
    end if;
  else
    insert into public.homework_submissions (
      student_id, session_id, date, started_at, ended_at,
      submitted_minutes, submitted_problems, photo_paths, status, submitted_at
    )
    values (
      s.student_id, s.id, s.date, s.started_at, coalesce(s.ended_at, v_end),
      v_mins, v_problems, v_paths, 'pending', now()
    )
    returning * into v_sub;
  end if;

  select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;

  return jsonb_build_object(
    'session',            to_jsonb(s),
    'submission',         to_jsonb(v_sub),
    'submission_id',      v_sub.id,
    'log',                to_jsonb(v_log),
    'seconds',            v_secs,
    'minutes',            v_mins,
    'problems',           v_problems,
    'submitted_minutes',  v_sub.submitted_minutes,
    'submitted_problems', v_sub.submitted_problems,
    'total_minutes',      coalesce(v_log.minutes, 0),
    'total_problems',     coalesce(v_log.problems, 0),
    'date',               s.date,
    'kind',               'homework',
    'pending_approval',   true
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. 자동 종료된 숙제 공부 중 문제 수를 아직 받지 못한 제출 (학생 다음 접속)
--    초안 줄(draft_active)은 빼고 진짜 제출만 물어본다.
-- ---------------------------------------------------------------------
create or replace function public.pending_homework_submissions(p_student_id uuid)
returns setof public.homework_submissions
language sql
stable
security definer
set search_path = public
as $$
  select *
    from public.homework_submissions
   where student_id = p_student_id
     and status = 'pending'
     and not draft_active
     and submitted_problems is null
     and date >= (public.kst_today() - 30)
   order by coalesce(ended_at, created_at) asc, created_at asc;
$$;

-- ---------------------------------------------------------------------
-- 6. 세션이 지워지면(자정 넘김 등) 그 세션의 초안 줄도 함께 정리
-- ---------------------------------------------------------------------
create or replace function public.drop_session_homework_draft()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.homework_submissions where session_id = old.id and draft_active;
  return old;
end;
$$;

drop trigger if exists study_sessions_drop_homework_draft on public.study_sessions;
create trigger study_sessions_drop_homework_draft
  before delete on public.study_sessions
  for each row execute function public.drop_session_homework_draft();

-- ---------------------------------------------------------------------
-- 7. 권한
-- ---------------------------------------------------------------------
grant execute on function public.save_homework_draft(uuid, uuid, integer, text[], boolean) to anon, authenticated;
grant execute on function public.clear_homework_draft(uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';

notify pgrst, 'reload schema';

-- =====================================================================
-- 2026-11-23 추가: 관리자 「수업 종료」 · 학생 기기의 종료 확인 (migrate-2026-11-23-admin-end-study.sql)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 세션에 '선생님이 마무리함' 표시
-- ---------------------------------------------------------------------
alter table public.study_sessions add column if not exists ended_by_admin boolean not null default false;

comment on column public.study_sessions.ended_by_admin is '관리자 실시간 탭의 「수업 종료」로 마무리한 세션 (학생 화면에 안내를 띄운다)';

-- ---------------------------------------------------------------------
-- 2. 관리자 「수업 종료」
--    p_problems 를 비우면(0) 0문제로 마무리한다. 9999 를 넘으면 9999.
-- ---------------------------------------------------------------------
create or replace function public.admin_end_study_session(p_session_id uuid, p_problems integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.study_sessions;
  v_problems integer;
  v_kind     text;
  v_res      jsonb;
  v_log      public.study_logs;
  v_sub      public.homework_submissions;
begin
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  v_problems := greatest(0, least(9999, coalesce(p_problems, 0)));
  v_kind     := case when s.kind = 'homework' then 'homework' else 'academy' end;

  -- 이미 끝난 세션 — 기록을 건드리지 않고 지금 상태만 돌려준다
  if s.status = 'finished' then
    select * into v_log
      from public.study_logs
     where student_id = s.student_id and date = s.date;

    if v_kind = 'homework' then
      select * into v_sub from public.homework_submissions where session_id = s.id;
    end if;

    return jsonb_build_object(
      'session',            to_jsonb(s),
      'log',                to_jsonb(v_log),
      'submission',         to_jsonb(v_sub),
      'submission_id',      v_sub.id,
      'seconds',            coalesce(s.minutes, 0) * 60,
      'minutes',            coalesce(s.minutes, 0),
      'problems',           coalesce(v_sub.submitted_problems, s.problems, 0),
      'submitted_minutes',  v_sub.submitted_minutes,
      'submitted_problems', v_sub.submitted_problems,
      'total_minutes',      coalesce(v_log.minutes, 0),
      'total_problems',     coalesce(v_log.problems, 0),
      'date',               s.date,
      'kind',               v_kind,
      'problems_pending',   coalesce(s.problems_pending, false),
      'auto_ended',         coalesce(s.auto_ended, false),
      'pending_approval',   (v_kind = 'homework' and v_sub.id is not null),
      'discarded',          false,
      'already_finished',   true,
      'ended_by_admin',     s.ended_by_admin
    );
  end if;

  -- 숙제 공부 — 기존 규칙대로 승인 대기 제출로 넘긴다 (사진은 세션의 초안이 있으면 살린다)
  if v_kind = 'homework' then
    v_res := public.close_homework_session(s.id, v_problems, '{}'::text[]);

    update public.study_sessions
       set ended_by_admin = true
     where id = s.id and status = 'finished'
     returning * into s;

    if found then
      v_res := v_res || jsonb_build_object('session', to_jsonb(s));
    end if;

    return v_res || jsonb_build_object(
      'already_finished', false,
      'ended_by_admin',   true
    );
  end if;

  -- 학원 공부 — finish_session 이 일시정지/진행·자정 넘김·5시간 상한을 그대로 처리한다
  v_res := public.finish_session(s.id, v_problems);

  if coalesce((v_res ->> 'discarded')::boolean, false) then
    return v_res || jsonb_build_object(
      'already_finished', false,
      'ended_by_admin',   false
    );
  end if;

  update public.study_sessions
     set ended_by_admin = true
   where id = s.id
   returning * into s;

  if found then
    v_res := v_res || jsonb_build_object('session', to_jsonb(s));
  end if;

  return v_res || jsonb_build_object(
    'already_finished', false,
    'ended_by_admin',   true
  );
end;
$$;

comment on function public.admin_end_study_session(uuid, integer) is
  '관리자 실시간 탭의 「수업 종료」 — 진행 중(공부 중·일시정지)인 세션을 지금까지의 시간으로 마무리한다 (숙제는 승인 대기로)';

-- ---------------------------------------------------------------------
-- 3. 학생 기기에서 '선생님이 끝냈는지' 확인 (읽기 전용)
--    끝나 있으면 finish_session 과 같은 모양의 결과를 돌려준다.
-- ---------------------------------------------------------------------
create or replace function public.study_session_state(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s      public.study_sessions;
  v_log  public.study_logs;
  v_sub  public.homework_submissions;
  v_kind text;
begin
  select * into s from public.study_sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('status', 'missing', 'result', null);
  end if;

  if s.status <> 'finished' then
    return jsonb_build_object('status', s.status, 'result', null);
  end if;

  v_kind := case when s.kind = 'homework' then 'homework' else 'academy' end;

  select * into v_log
    from public.study_logs
   where student_id = s.student_id and date = s.date;

  if v_kind = 'homework' then
    select * into v_sub from public.homework_submissions where session_id = s.id;

    return jsonb_build_object(
      'status', 'finished',
      'result', jsonb_build_object(
        'session',            to_jsonb(s),
        'log',                to_jsonb(v_log),
        'submission',         to_jsonb(v_sub),
        'submission_id',      v_sub.id,
        'seconds',            coalesce(s.minutes, 0) * 60,
        'minutes',            coalesce(s.minutes, 0),
        'problems',           coalesce(v_sub.submitted_problems, s.problems, 0),
        'submitted_minutes',  v_sub.submitted_minutes,
        'submitted_problems', v_sub.submitted_problems,
        'total_minutes',      coalesce(v_log.minutes, 0),
        'total_problems',     coalesce(v_log.problems, 0),
        'date',               s.date,
        'kind',               v_kind,
        'pending_approval',   (v_sub.id is not null),
        'nothing',            (v_sub.id is null),
        'auto_ended',         coalesce(s.auto_ended, false),
        'ended_by_admin',     coalesce(s.ended_by_admin, false)
      )
    );
  end if;

  return jsonb_build_object(
    'status', 'finished',
    'result', jsonb_build_object(
      'session',          to_jsonb(s),
      'log',              to_jsonb(v_log),
      'seconds',          coalesce(s.minutes, 0) * 60,
      'minutes',          coalesce(s.minutes, 0),
      'problems',         coalesce(s.problems, 0),
      'total_minutes',    coalesce(v_log.minutes, 0),
      'total_problems',   coalesce(v_log.problems, 0),
      'date',             s.date,
      'kind',             v_kind,
      'problems_pending', coalesce(s.problems_pending, false),
      'auto_ended',       coalesce(s.auto_ended, false),
      'ended_by_admin',   coalesce(s.ended_by_admin, false)
    )
  );
end;
$$;

comment on function public.study_session_state(uuid) is
  '학생 타이머가 선생님의 「수업 종료」를 알아채는 읽기 전용 확인 (끝났으면 결과를 함께 돌려준다)';

-- ---------------------------------------------------------------------
-- 4. 권한 — 나머지 관리자 함수처럼 앱(anon)에서 부를 수 있게 한다
-- ---------------------------------------------------------------------
grant execute on function public.admin_end_study_session(uuid, integer) to anon, authenticated;
grant execute on function public.study_session_state(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- 11. 지난 날짜 미종료 세션 자동 정리 (2026-11-23)
--   · cleanup_stale_study_sessions(dry_run) — 한국 시간 오늘 00:00 이전에 시작한
--     미종료 세션을 기존 자정·일시정지 규칙대로 마무리한다.
--       일시정지된 공부 = 멈춘 시각까지 그 날 기록으로 정산(숙제는 승인 대기),
--       일시정지 없이 자정을 넘긴 공부 = 기록 없이 폐기, 0분·0문제 숙제 = 세션만 마무리
--   · maybe_cleanup_stale_study_sessions() — 지난 세션이 있을 때만 정리 (안전장치).
--     start_session · active_session · live_study_board 가 맨 앞에서 부른다.
--   · pg_cron 이 있으면 매일 00:05 KST(UTC 15:05)에 자동 실행한다.
-- =====================================================================

create index if not exists study_sessions_unfinished_started_idx
  on public.study_sessions (started_at)
  where ended_at is null;

create or replace function public.cleanup_stale_study_sessions(p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today       date        := public.kst_today();
  v_cut         timestamptz := v_today::timestamp at time zone 'Asia/Seoul';
  r             record;
  v_res         jsonb;
  v_plan        text;
  v_items       jsonb := '[]'::jsonb;
  v_found       integer := 0;
  v_settled     integer := 0;
  v_pending     integer := 0;
  v_discarded   integer := 0;
  v_nothing     integer := 0;
  v_failed      integer := 0;
  v_kind        text;
  v_problems_in integer;
begin
  for r in
    select s.id, s.student_id, s.date, s.kind, s.status, s.started_at, s.paused_at,
           s.problems,
           (select hs.draft_problems from public.homework_submissions hs where hs.session_id = s.id) as draft_problems,
           st.name as student_name
      from public.study_sessions s
      left join public.students st on st.id = s.student_id
     where s.ended_at is null
       and s.started_at < v_cut
     order by s.started_at
  loop
    v_found := v_found + 1;
    v_kind  := case when r.kind = 'homework' then 'homework' else 'academy' end;

    -- 계획: 멈춘 공부는 그 날 기록으로 정산, 일시정지 없이 자정을 넘긴 공부는 폐기
    v_plan := case
      when r.paused_at is not null and r.paused_at < v_cut then 'settle'
      else 'discard'
    end;

    if coalesce(p_dry_run, false) then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'session_id', r.id, 'student', r.student_name, 'student_id', r.student_id,
        'date', r.date, 'kind', v_kind, 'status', r.status,
        'started_at', r.started_at, 'paused_at', r.paused_at, 'plan', v_plan));
      continue;
    end if;

    begin
      -- 문제 수는 이미 적혀 있으면 그대로, 모르면 0 (관리자 「수업 종료」와 같은 기준)
      v_problems_in := coalesce(r.problems, r.draft_problems, 0);

      -- finish_session 이 일시정지·자정 넘김·5시간 상한·숙제 승인 대기 규칙을 그대로 처리한다
      v_res := public.finish_session(r.id, v_problems_in);

      if coalesce((v_res ->> 'discarded')::boolean, false) then
        v_discarded := v_discarded + 1;
        v_plan := 'discarded';
      elsif coalesce((v_res ->> 'nothing')::boolean, false) then
        v_nothing := v_nothing + 1;
        v_plan := 'nothing';
      elsif coalesce((v_res ->> 'pending_approval')::boolean, false) then
        v_pending := v_pending + 1;
        v_plan := 'pending_approval';
      else
        v_settled := v_settled + 1;
        v_plan := 'settled';
      end if;

      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'session_id', r.id, 'student', r.student_name, 'student_id', r.student_id,
        'date', r.date, 'kind', v_kind, 'status', r.status,
        'started_at', r.started_at, 'paused_at', r.paused_at, 'plan', v_plan,
        'minutes', coalesce((v_res ->> 'minutes')::integer, 0),
        'problems', coalesce((v_res ->> 'problems')::integer, 0),
        'total_minutes', coalesce((v_res ->> 'total_minutes')::integer, 0)));
    exception when others then
      -- 한 세션이 잘못돼도 나머지는 계속 정리한다
      v_failed := v_failed + 1;
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'session_id', r.id, 'student', r.student_name, 'student_id', r.student_id,
        'date', r.date, 'kind', v_kind, 'status', r.status,
        'plan', 'failed', 'error', sqlerrm));
    end;
  end loop;

  return jsonb_build_object(
    'today',            v_today,
    'cutoff',           v_cut,
    'dry_run',          coalesce(p_dry_run, false),
    'found',            v_found,
    'settled',          v_settled,
    'pending_approval', v_pending,
    'discarded',        v_discarded,
    'nothing',          v_nothing,
    'failed',           v_failed,
    'items',            v_items
  );
end;
$$;

comment on function public.cleanup_stale_study_sessions(boolean) is
  '한국 시간 오늘 00:00 이전에 시작한 미종료 세션을 기존 자정·일시정지 규칙대로 정리한다 (일시정지=정산, 자정 넘김=폐기)';

create or replace function public.maybe_cleanup_stale_study_sessions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cut timestamptz := public.kst_today()::timestamp at time zone 'Asia/Seoul';
begin
  if not exists (
    select 1
      from public.study_sessions
     where ended_at is null
       and started_at < v_cut
  ) then
    return null;
  end if;

  return public.cleanup_stale_study_sessions();
end;
$$;

comment on function public.maybe_cleanup_stale_study_sessions() is
  '지난 날짜 미종료 세션이 남아 있을 때만 cleanup_stale_study_sessions() 를 부른다 (앱 진입 시 안전장치)';

do $cron$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron 을 켤 수 없어 예약 실행은 건너뜁니다: %', sqlerrm;
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      if exists (select 1 from cron.job where jobname = 'sunogong-stale-session-cleanup') then
        perform cron.unschedule('sunogong-stale-session-cleanup');
      end if;

      perform cron.schedule(
        'sunogong-stale-session-cleanup',
        '5 15 * * *',
        'select public.cleanup_stale_study_sessions()'
      );
    exception when others then
      raise notice 'pg_cron 예약을 걸지 못했습니다(안전장치는 그대로 동작): %', sqlerrm;
    end;
  end if;
end
$cron$;

revoke all on function public.cleanup_stale_study_sessions(boolean) from public;
revoke all on function public.cleanup_stale_study_sessions(boolean) from anon, authenticated;
grant execute on function public.cleanup_stale_study_sessions(boolean) to service_role;

revoke all on function public.maybe_cleanup_stale_study_sessions() from public;
revoke all on function public.maybe_cleanup_stale_study_sessions() from anon, authenticated;
grant execute on function public.maybe_cleanup_stale_study_sessions() to service_role;

notify pgrst, 'reload schema';

-- =====================================================================
-- 2026-11-23 추가: 문제 수 0~999 상한 · 학생이 오늘 학원 공부 문제 수 수정
--   · 학생 입력 경로(finish_session · set_session_problems · close_homework_session
--     · submit_homework · submit_pending_homework)는 999 초과를 거부한다
--   · 관리자 「수업 종료」도 세션 단위 문제 수는 999 까지 (하루 합산은 LogEditorModal 에서 그대로)
--   · student_update_today_academy_problems — 오늘 학원 공부 문제 수만 0~999 로 수정
-- =====================================================================

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
  -- 문제 수는 학생이 입력할 수 있는 0~999 만 받는다 (2026-11-23)
  if p_problems is not null and (p_problems < 0 or p_problems > 999) then
    raise exception 'problems_out_of_range' using errcode = '22023';
  end if;

  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  -- 숙제 공부는 사진·문제 수와 함께 승인 대기로 넘긴다 (study_logs 에 바로 넣지 않는다)
  if coalesce(s.kind, 'academy') = 'homework' then
    return public.close_homework_session(s.id, p_problems, '{}'::text[]);
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

create or replace function public.set_session_problems(p_session_id uuid, p_problems integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.study_sessions;
  v_problems integer := greatest(0, least(999, coalesce(p_problems, 0)));
  v_kind     text;
  v_log      public.study_logs;
begin
  -- 문제 수는 학생이 입력할 수 있는 0~999 만 받는다 (2026-11-23)
  if p_problems is not null and (p_problems < 0 or p_problems > 999) then
    raise exception 'problems_out_of_range' using errcode = '22023';
  end if;

  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if s.status <> 'finished' then
    raise exception 'session_not_finished' using errcode = 'P0002';
  end if;

  if not s.problems_pending then
    raise exception 'problems_not_pending' using errcode = 'P0002';
  end if;

  v_kind := case when s.kind = 'homework' then 'homework' else 'academy' end;

  update public.study_sessions
     set problems         = v_problems,
         problems_pending = false
   where id = s.id
   returning * into s;

  update public.study_logs
     set problems          = problems + v_problems,
         academy_problems  = academy_problems  + case when v_kind = 'academy'  then v_problems else 0 end,
         homework_problems = homework_problems + case when v_kind = 'homework' then v_problems else 0 end,
         updated_at        = now()
   where student_id = s.student_id and date = s.date
   returning * into v_log;

  -- 그 날 기록이 지워졌으면 세션 시간으로 다시 만들어 둔다
  if v_log.id is null then
    insert into public.study_logs as l (
      student_id, date, minutes, problems,
      academy_minutes, academy_problems, homework_minutes, homework_problems, updated_at
    )
    values (
      s.student_id, s.date, coalesce(s.minutes, 0), v_problems,
      case when v_kind = 'academy'  then coalesce(s.minutes, 0) else 0 end,
      case when v_kind = 'academy'  then v_problems else 0 end,
      case when v_kind = 'homework' then coalesce(s.minutes, 0) else 0 end,
      case when v_kind = 'homework' then v_problems else 0 end,
      now()
    )
    on conflict (student_id, date) do update
      set problems          = l.problems + excluded.problems,
          academy_problems  = l.academy_problems  + excluded.academy_problems,
          homework_problems = l.homework_problems + excluded.homework_problems,
          updated_at        = now()
    returning * into v_log;
  end if;

  return jsonb_build_object(
    'session',          to_jsonb(s),
    'log',              to_jsonb(v_log),
    'problems',         v_problems,
    'minutes',          coalesce(s.minutes, 0),
    'total_minutes',    coalesce(v_log.minutes, 0),
    'total_problems',   coalesce(v_log.problems, 0),
    'date',             s.date,
    'kind',             v_kind,
    'problems_pending', false
  );
end;
$$;

create or replace function public.close_homework_session(
  p_session_id  uuid,
  p_problems    integer,
  p_photo_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s           public.study_sessions;
  v_end       timestamptz;
  v_cap       timestamptz;
  v_secs      integer;
  v_mins      integer;
  v_problems  integer;
  v_paths     text[];
  v_sub       public.homework_submissions;
  v_existing  uuid;
  v_draft     integer;
  v_log       public.study_logs;
begin
  -- 문제 수는 학생이 입력할 수 있는 0~999 만 받는다 (2026-11-23)
  if p_problems is not null and (p_problems < 0 or p_problems > 999) then
    raise exception 'problems_out_of_range' using errcode = '22023';
  end if;

  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if coalesce(s.kind, 'academy') <> 'homework' then
    raise exception 'not_homework_session' using errcode = '22023';
  end if;

  if coalesce(array_length(p_photo_paths, 1), 0) > 5 then
    raise exception 'too_many_photos' using errcode = '22023';
  end if;

  -- 사진 경로 정리: 빈 값·중복을 빼고 5장까지만
  v_paths := array(
    select p from (
      select distinct btrim(p) as p from unnest(coalesce(p_photo_paths, '{}'::text[])) as p
    ) t
    where coalesce(t.p, '') <> ''
    limit 5
  );
  v_paths := coalesce(v_paths, '{}'::text[]);

  -- 이 세션의 제출 줄(초안 포함)이 이미 있는지
  select id into v_existing from public.homework_submissions where session_id = s.id;
  select draft_problems into v_draft from public.homework_submissions where session_id = s.id;

  /* ── 이미 마무리된 세션 ──────────────────────────────────────────── */
  if s.status = 'finished' then
    if v_existing is not null then
      select * into v_sub from public.homework_submissions where id = v_existing for update;

      if v_sub.status = 'pending' then
        update public.homework_submissions
           set submitted_problems = coalesce(
                 case when coalesce(p_problems, 0) > 0 then greatest(0, least(999, p_problems)) end,
                 submitted_problems
               ),
               photo_paths = case
                 when coalesce(array_length(v_paths, 1), 0) > 0
                      and coalesce(array_length(photo_paths, 1), 0) = 0
                   then v_paths
                 else photo_paths
               end,
               draft_active = false,
               draft_open   = false,
               updated_at   = now()
         where id = v_sub.id
         returning * into v_sub;
      end if;

      select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;

      return jsonb_build_object(
        'session',            to_jsonb(s),
        'submission',         to_jsonb(v_sub),
        'submission_id',      v_sub.id,
        'log',                to_jsonb(v_log),
        'seconds',            coalesce(s.minutes, 0) * 60,
        'minutes',            coalesce(s.minutes, 0),
        'problems',           coalesce(v_sub.submitted_problems, 0),
        'submitted_minutes',  v_sub.submitted_minutes,
        'submitted_problems', v_sub.submitted_problems,
        'total_minutes',      coalesce(v_log.minutes, 0),
        'total_problems',     coalesce(v_log.problems, 0),
        'date',               s.date,
        'kind',               'homework',
        'pending_approval',   true,
        'already',            true
      );
    end if;

    -- 서버가 5시간 초과로 먼저 마무리해 둔 세션 — 시간은 그대로 쓰고 기록만 승인 대기로 남긴다
    v_mins := coalesce(s.minutes, 0);
    if coalesce(p_problems, 0) > 0 then
      v_problems := greatest(0, least(999, p_problems));
    else
      v_problems := coalesce(s.problems, v_draft);   -- 비어 있으면 그대로 비워 둔다(다음 접속 때 받는다)
    end if;
  else
    /* ── 아직 안 끝난 세션 — 지금 마무리한다 (초안 줄이 있어도 OK) ──── */
    v_end := case when s.status = 'paused' then coalesce(s.paused_at, now()) else now() end;

    -- 그 날 자정을 넘긴 공부는 기록하지 않고 세션만 버린다 (예전 규칙과 같다)
    v_cap := ((s.date + 1)::timestamp at time zone 'Asia/Seoul') - interval '1 second';
    if v_end > v_cap then
      delete from public.homework_submissions where session_id = s.id and draft_active;
      delete from public.study_sessions where id = s.id;

      select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;

      return jsonb_build_object(
        'session',          null,
        'submission',       null,
        'log',              null,
        'seconds',          0,
        'minutes',          0,
        'problems',         0,
        'total_minutes',    coalesce(v_log.minutes, 0),
        'total_problems',   coalesce(v_log.problems, 0),
        'date',             s.date,
        'kind',             'homework',
        'pending_approval', false,
        'discarded',        true
      );
    end if;

    v_secs := greatest(0, floor(extract(epoch from (v_end - s.started_at)))::integer - s.paused_seconds);
    if v_secs > 18000 then
      v_secs := 18000;
    end if;
    v_mins := (v_secs / 60)::integer;

    -- 문제 수: 이번에 온 값 → 세션 값 → 초안에 입력해 둔 값 순서로 쓴다.
    -- (60분 자동 종료는 값을 보내지 않는다 — 그때는 초안의 문제 수를 살린다)
    if p_problems is null and coalesce(s.problems, v_draft) is null then
      v_problems := null;
    else
      v_problems := greatest(0, least(999, coalesce(p_problems, s.problems, v_draft, 0)));
    end if;

    update public.study_sessions
       set status           = 'finished',
           ended_at         = v_end,
           paused_at        = null,
           last_pause_auto  = false,
           minutes          = v_mins,
           problems         = v_problems,
           problems_pending = false
     where id = s.id
     returning * into s;

    select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;

    -- 1분도 공부하지 않았고 문제 수도 없으면 승인할 것이 없다 (기록 줄을 만들지 않는다)
    if v_mins <= 0 and coalesce(v_problems, 0) <= 0 then
      -- 그때 남아 있던 초안 줄(사진만)은 지운다 — 화면에서도 사진을 지운다
      delete from public.homework_submissions where session_id = s.id and draft_active;

      return jsonb_build_object(
        'session',          to_jsonb(s),
        'submission',       null,
        'log',              to_jsonb(v_log),
        'seconds',          v_secs,
        'minutes',          v_mins,
        'problems',         v_problems,
        'total_minutes',    coalesce(v_log.minutes, 0),
        'total_problems',   coalesce(v_log.problems, 0),
        'date',             s.date,
        'kind',             'homework',
        'pending_approval', false,
        'nothing',          true
      );
    end if;
  end if;

  /* ── 제출 줄: 초안이 있으면 그 줄을 채우고, 없으면 새로 만든다 ──────── */
  if v_existing is not null then
    select * into v_sub from public.homework_submissions where id = v_existing for update;

    if v_sub.status = 'pending' then
      -- 초안에 있던 사진 + 이번에 보낸 사진 (5장까지)
      update public.homework_submissions
         set date               = s.date,
             started_at         = coalesce(started_at, s.started_at),
             ended_at           = coalesce(s.ended_at, v_end),
             submitted_minutes  = v_mins,
             submitted_problems = v_problems,
             photo_paths        = (
               select coalesce(array_agg(p), '{}'::text[]) from (
                 select distinct p from unnest(
                   coalesce(photo_paths, '{}'::text[]) || coalesce(v_paths, '{}'::text[])
                 ) as p
                 where coalesce(p, '') <> ''
                 limit 5
               ) t
             ),
             status             = 'pending',
             draft_active       = false,
             draft_problems     = null,
             draft_open         = false,
             submitted_at       = coalesce(submitted_at, now()),
             updated_at         = now()
       where id = v_sub.id
       returning * into v_sub;
    end if;
  else
    insert into public.homework_submissions (
      student_id, session_id, date, started_at, ended_at,
      submitted_minutes, submitted_problems, photo_paths, status, submitted_at
    )
    values (
      s.student_id, s.id, s.date, s.started_at, coalesce(s.ended_at, v_end),
      v_mins, v_problems, v_paths, 'pending', now()
    )
    returning * into v_sub;
  end if;

  select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;

  return jsonb_build_object(
    'session',            to_jsonb(s),
    'submission',         to_jsonb(v_sub),
    'submission_id',      v_sub.id,
    'log',                to_jsonb(v_log),
    'seconds',            v_secs,
    'minutes',            v_mins,
    'problems',           v_problems,
    'submitted_minutes',  v_sub.submitted_minutes,
    'submitted_problems', v_sub.submitted_problems,
    'total_minutes',      coalesce(v_log.minutes, 0),
    'total_problems',     coalesce(v_log.problems, 0),
    'date',               s.date,
    'kind',               'homework',
    'pending_approval',   true
  );
end;
$$;

create or replace function public.submit_homework(
  p_session_id  uuid,
  p_problems    integer,
  p_photo_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s       public.study_sessions;
  v_paths text[];
  v_problems integer := greatest(0, least(999, coalesce(p_problems, 0)));
begin
  -- 문제 수는 학생이 입력할 수 있는 0~999 만 받는다 (2026-11-23)
  if p_problems is not null and (p_problems < 0 or p_problems > 999) then
    raise exception 'problems_out_of_range' using errcode = '22023';
  end if;

  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if coalesce(s.kind, 'academy') <> 'homework' then
    raise exception 'not_homework_session' using errcode = '22023';
  end if;

  v_paths := array(
    select p from (
      select distinct btrim(p) as p from unnest(coalesce(p_photo_paths, '{}'::text[])) as p
    ) t
    where coalesce(t.p, '') <> ''
  );

  if coalesce(array_length(v_paths, 1), 0) > 5 then
    raise exception 'too_many_photos' using errcode = '22023';
  end if;

  -- 사진은 필수가 아니다 (2026-11-23). 0장이면 화면이 확인을 받고 그대로 제출한다.
  return public.close_homework_session(s.id, v_problems, v_paths);
end;
$$;

create or replace function public.submit_pending_homework(
  p_submission_id uuid,
  p_problems      integer,
  p_photo_paths   text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s        public.homework_submissions;
  v_paths  text[];
  v_all    text[];
  v_problems integer := greatest(0, least(999, coalesce(p_problems, 0)));
begin
  -- 문제 수는 학생이 입력할 수 있는 0~999 만 받는다 (2026-11-23)
  if p_problems is not null and (p_problems < 0 or p_problems > 999) then
    raise exception 'problems_out_of_range' using errcode = '22023';
  end if;

  select * into s from public.homework_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'submission_not_found' using errcode = 'P0002';
  end if;

  if s.status <> 'pending' then
    raise exception 'already_reviewed' using errcode = '22023';
  end if;

  v_paths := array(
    select p from (
      select distinct btrim(p) as p from unnest(coalesce(p_photo_paths, '{}'::text[])) as p
    ) t
    where coalesce(t.p, '') <> ''
  );

  -- 이미 올린 사진 + 이번에 올린 사진 (5장까지)
  v_all := array(
    select p from (
      select distinct p from unnest(coalesce(s.photo_paths, '{}'::text[]) || coalesce(v_paths, '{}'::text[])) as p
    ) t
    where coalesce(t.p, '') <> ''
  );
  v_all := coalesce(v_all, '{}'::text[]);

  if coalesce(array_length(v_all, 1), 0) > 5 then
    raise exception 'too_many_photos' using errcode = '22023';
  end if;

  -- 사진은 필수가 아니다 (2026-11-23). 0장이면 화면이 확인을 받고 그대로 제출한다.
  update public.homework_submissions
     set submitted_problems = v_problems,
         photo_paths        = v_all,
         updated_at         = now()
   where id = s.id
   returning * into s;

  return to_jsonb(s);
end;
$$;

create or replace function public.save_homework_draft(
  p_session_id    uuid default null,
  p_submission_id uuid default null,
  p_problems      integer default null,
  p_photo_paths   text[] default '{}',
  p_open          boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s         public.study_sessions;
  v_sub     public.homework_submissions;
  v_paths   text[];
  v_minutes integer;
  v_problems integer;
begin
  -- 사진 경로 정리: 빈 값·중복을 빼고 5장까지만
  v_paths := array(
    select p from (
      select distinct btrim(p) as p from unnest(coalesce(p_photo_paths, '{}'::text[])) as p
    ) t
    where coalesce(t.p, '') <> ''
    limit 5
  );
  v_paths := coalesce(v_paths, '{}'::text[]);

  v_problems := case
    when p_problems is null then null
    else greatest(0, least(999, p_problems))
  end;

  /* ── (가) 자동 종료된 제출에 이어서 담기 ─────────────────────────── */
  if p_submission_id is not null then
    select * into v_sub from public.homework_submissions where id = p_submission_id for update;
    if not found then
      raise exception 'submission_not_found' using errcode = 'P0002';
    end if;
    if v_sub.status <> 'pending' then
      raise exception 'already_reviewed' using errcode = '22023';
    end if;

    update public.homework_submissions
       set photo_paths    = v_paths,
           draft_problems = v_problems,
           draft_open     = coalesce(p_open, true),
           updated_at     = now()
     where id = v_sub.id
     returning * into v_sub;

    return jsonb_build_object(
      'submission',  to_jsonb(v_sub),
      'photo_paths', v_sub.photo_paths,
      'problems',    v_sub.draft_problems,
      'open',        v_sub.draft_open
    );
  end if;

  /* ── (나) 아직 마치지 않은 숙제 세션의 초안 ───────────────────────── */
  if p_session_id is null then
    raise exception 'draft_target_required' using errcode = '22023';
  end if;

  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if coalesce(s.kind, 'academy') <> 'homework' then
    raise exception 'not_homework_session' using errcode = '22023';
  end if;
  if s.status = 'finished' then
    raise exception 'session_finished' using errcode = '22023';
  end if;

  -- 지금까지의 공부 시간(분) — 제출 전 미리 보여 주기용 (마칠 때 다시 계산한다)
  v_minutes := greatest(
    0,
    least(
      300,
      floor(
        greatest(
          0,
          extract(epoch from (
            coalesce(case when s.status = 'paused' then s.paused_at end, now()) - s.started_at
          )) - coalesce(s.paused_seconds, 0)
        ) / 60
      )::integer
    )
  );

  select * into v_sub from public.homework_submissions where session_id = s.id for update;

  if found then
    if not v_sub.draft_active then
      -- 이미 진짜 제출로 마무리된 세션 — 초안으로 되돌리지 않는다
      raise exception 'already_submitted' using errcode = '22023';
    end if;

    update public.homework_submissions
       set photo_paths       = v_paths,
           draft_problems    = v_problems,
           draft_open        = coalesce(p_open, true),
           submitted_minutes = v_minutes,
           started_at        = coalesce(started_at, s.started_at),
           date              = s.date,
           updated_at        = now()
     where id = v_sub.id
     returning * into v_sub;
  else
    insert into public.homework_submissions (
      student_id, session_id, date, started_at, ended_at,
      submitted_minutes, submitted_problems, photo_paths, status,
      draft_active, draft_problems, draft_open, submitted_at
    )
    values (
      s.student_id, s.id, s.date, s.started_at, null,
      v_minutes, null, v_paths, 'pending',
      true, v_problems, coalesce(p_open, true), now()
    )
    returning * into v_sub;
  end if;

  return jsonb_build_object(
    'submission',  to_jsonb(v_sub),
    'photo_paths', v_sub.photo_paths,
    'problems',    v_sub.draft_problems,
    'open',        v_sub.draft_open
  );
end;
$$;

create or replace function public.admin_end_study_session(p_session_id uuid, p_problems integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.study_sessions;
  v_problems integer;
  v_kind     text;
  v_res      jsonb;
  v_log      public.study_logs;
  v_sub      public.homework_submissions;
begin
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  v_problems := greatest(0, least(999, coalesce(p_problems, 0)));
  v_kind     := case when s.kind = 'homework' then 'homework' else 'academy' end;

  -- 이미 끝난 세션 — 기록을 건드리지 않고 지금 상태만 돌려준다
  if s.status = 'finished' then
    select * into v_log
      from public.study_logs
     where student_id = s.student_id and date = s.date;

    if v_kind = 'homework' then
      select * into v_sub from public.homework_submissions where session_id = s.id;
    end if;

    return jsonb_build_object(
      'session',            to_jsonb(s),
      'log',                to_jsonb(v_log),
      'submission',         to_jsonb(v_sub),
      'submission_id',      v_sub.id,
      'seconds',            coalesce(s.minutes, 0) * 60,
      'minutes',            coalesce(s.minutes, 0),
      'problems',           coalesce(v_sub.submitted_problems, s.problems, 0),
      'submitted_minutes',  v_sub.submitted_minutes,
      'submitted_problems', v_sub.submitted_problems,
      'total_minutes',      coalesce(v_log.minutes, 0),
      'total_problems',     coalesce(v_log.problems, 0),
      'date',               s.date,
      'kind',               v_kind,
      'problems_pending',   coalesce(s.problems_pending, false),
      'auto_ended',         coalesce(s.auto_ended, false),
      'pending_approval',   (v_kind = 'homework' and v_sub.id is not null),
      'discarded',          false,
      'already_finished',   true,
      'ended_by_admin',     s.ended_by_admin
    );
  end if;

  -- 숙제 공부 — 기존 규칙대로 승인 대기 제출로 넘긴다 (사진은 세션의 초안이 있으면 살린다)
  if v_kind = 'homework' then
    v_res := public.close_homework_session(s.id, v_problems, '{}'::text[]);

    update public.study_sessions
       set ended_by_admin = true
     where id = s.id and status = 'finished'
     returning * into s;

    if found then
      v_res := v_res || jsonb_build_object('session', to_jsonb(s));
    end if;

    return v_res || jsonb_build_object(
      'already_finished', false,
      'ended_by_admin',   true
    );
  end if;

  -- 학원 공부 — finish_session 이 일시정지/진행·자정 넘김·5시간 상한을 그대로 처리한다
  v_res := public.finish_session(s.id, v_problems);

  if coalesce((v_res ->> 'discarded')::boolean, false) then
    return v_res || jsonb_build_object(
      'already_finished', false,
      'ended_by_admin',   false
    );
  end if;

  update public.study_sessions
     set ended_by_admin = true
   where id = s.id
   returning * into s;

  if found then
    v_res := v_res || jsonb_build_object('session', to_jsonb(s));
  end if;

  return v_res || jsonb_build_object(
    'already_finished', false,
    'ended_by_admin',   true
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 학생이 오늘(KST) 학원 공부 문제 수를 직접 고친다 (0~999)
--   · 오늘 study_logs 한 줄을 잠그고(for update) academy_problems 만 바꾼다
--   · 합계 problems = academy_problems + homework_problems 로 다시 계산한다
--   · 숙제 공부 문제 수는 선생님 승인 대상이라 건드리지 않는다
--   · 오늘 학원 공부 기록이 없으면 no_academy_today, 오늘 기록이 없으면 log_not_found
-- ---------------------------------------------------------------------
create or replace function public.student_update_today_academy_problems(
  p_student_id uuid,
  p_problems   integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today    date := public.kst_today();
  v_problems integer;
  v_student  public.students;
  v_log      public.study_logs;
begin
  if p_student_id is null then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  -- 0~999 밖의 값은 거부한다 (화면에서도 막지만 서버가 마지막으로 확인한다)
  if p_problems is null or p_problems < 0 or p_problems > 999 then
    raise exception 'problems_out_of_range' using errcode = '22023';
  end if;
  v_problems := p_problems;

  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  select * into v_log
    from public.study_logs
   where student_id = p_student_id and date = v_today
   for update;
  if not found then
    raise exception 'log_not_found' using errcode = 'P0002';
  end if;

  -- 오늘 학원 공부를 하지 않았으면(숙제만 했거나 기록만 남았으면) 고칠 것이 없다
  if coalesce(v_log.academy_minutes, 0) <= 0 and coalesce(v_log.academy_problems, 0) <= 0 then
    raise exception 'no_academy_today' using errcode = 'P0002';
  end if;

  update public.study_logs
     set academy_problems = v_problems,
         problems         = v_problems + coalesce(homework_problems, 0),
         updated_at       = now()
   where id = v_log.id
   returning * into v_log;

  return jsonb_build_object(
    'log',               to_jsonb(v_log),
    'date',              v_log.date,
    'minutes',           coalesce(v_log.minutes, 0),
    'academy_minutes',   coalesce(v_log.academy_minutes, 0),
    'homework_minutes',  coalesce(v_log.homework_minutes, 0),
    'academy_problems',  coalesce(v_log.academy_problems, 0),
    'homework_problems', coalesce(v_log.homework_problems, 0),
    'problems',          coalesce(v_log.problems, 0)
  );
end;
$$;

grant execute on function public.student_update_today_academy_problems(uuid, integer) to anon, authenticated;

comment on function public.student_update_today_academy_problems(uuid, integer) is
  '학생이 오늘(KST) 학원 공부 문제 수(0~999)를 직접 고친다 — 합계는 학원+숙제로 다시 계산한다';

notify pgrst, 'reload schema';
