-- =====================================================================
--  선오공 (훈수학학원 공부 기록) — Supabase 스키마
--  Supabase Dashboard > SQL Editor 에서 이 파일을 그대로 실행하세요.
--  여러 번 실행해도 안전하도록 작성했습니다.
--
--  · 모든 날짜·시간은 한국 시간(Asia/Seoul) 기준으로 계산합니다.
--  · 타이머의 시작/일시정지/계속/종료 시각은 모두 서버 now() 로 저장하고,
--    공부 시간 계산도 서버 함수가 합니다.
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
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  date       date not null,
  minutes    integer not null default 0 check (minutes >= 0),
  problems   integer not null default 0 check (problems >= 0),
  updated_at timestamptz not null default now(),
  unique (student_id, date)
);

create index if not exists study_logs_date_idx on public.study_logs (date);

-- 이전 버전 테이블이 이미 있어도 빠진 열을 채워 넣는다
 alter table public.study_sessions add column if not exists ended_at timestamptz;
alter table public.study_sessions add column if not exists last_pause_auto boolean not null default false;
alter table public.study_sessions add column if not exists minutes integer;
alter table public.study_sessions add column if not exists problems integer;
alter table public.study_logs add column if not exists updated_at timestamptz not null default now();

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

-- 진행 중 세션 정리: 자정 초과 / 하트비트 30초 끊김 / 5시간 초과
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

  -- (1) 한국 시간 자정을 넘겼으면 그 날 23:59 에 종료 처리
  if (v_now at time zone 'Asia/Seoul')::date > s.date then
    perform public.finish_session(s.id, coalesce(s.problems, 0));
    select * into s from public.study_sessions where id = p_session_id;
    return s;
  end if;

  -- (2) 하트비트가 30초 이상 끊겼으면 마지막 신호 시각부터 일시정지
  if s.status = 'running' and v_now - s.last_heartbeat_at > interval '30 seconds' then
    v_gap := greatest(0, floor(extract(epoch from (v_now - s.last_heartbeat_at)))::integer);
    update public.study_sessions
       set status              = 'paused',
           paused_at           = s.last_heartbeat_at,
           paused_seconds      = s.paused_seconds + v_gap,
           auto_pause_count    = s.auto_pause_count + 1,
           auto_paused_seconds = s.auto_paused_seconds + v_gap,
           last_pause_auto     = true
     where id = s.id
     returning * into s;
  end if;

  -- (3) 5시간(300분)을 넘겼으면 자동 종료
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
create or replace function public.start_session(p_student_id uuid)
returns public.study_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.study_sessions;
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
    return public.reconcile_session(s.id);
  end if;

  insert into public.study_sessions (student_id, status, started_at, last_heartbeat_at, date)
  values (p_student_id, 'running', now(), now(), public.kst_today())
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

  -- 하트비트가 30초 이상 끊긴 채로 멈추면 마지막 신호 시각부터 일시정지로 본다
  v_gap := greatest(0, floor(extract(epoch from (now() - s.last_heartbeat_at)))::integer);

  update public.study_sessions
     set status              = 'paused',
         paused_at           = case when v_gap > 30 then s.last_heartbeat_at else now() end,
         paused_seconds      = s.paused_seconds + case when v_gap > 30 then v_gap else 0 end,
         auto_pause_count    = s.auto_pause_count + case when p_auto or v_gap > 30 then 1 else 0 end,
         auto_paused_seconds = s.auto_paused_seconds + case when v_gap > 30 then v_gap else 0 end,
         last_pause_auto     = (p_auto or v_gap > 30)
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
  v_crossed  boolean := false;
  v_secs     integer;
  v_mins     integer;
  v_problems integer;
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
      'date',           s.date
    );
  end if;

  v_end := case when s.status = 'paused' then coalesce(s.paused_at, v_now) else v_now end;

  -- 그 날 23:59:59 를 넘는 부분은 잘라낸다 (자정 넘김은 0문제로 저장)
  v_cap := ((s.date + 1)::timestamp at time zone 'Asia/Seoul') - interval '1 second';
  if v_end > v_cap then
    v_crossed := true;
    v_end := v_cap;
  end if;

  v_secs := greatest(0, floor(extract(epoch from (v_end - s.started_at)))::integer - s.paused_seconds);
  if v_secs > 18000 then
    v_secs := 18000;
  end if;
  v_mins := (v_secs / 60)::integer;

  v_problems := case
                  when v_crossed then 0
                  else greatest(0, coalesce(p_problems, s.problems, 0))
                end;

  update public.study_sessions
     set status          = 'finished',
         ended_at        = v_end,
         paused_at       = null,
         last_pause_auto = false,
         minutes         = v_mins,
         problems        = v_problems
   where id = s.id
   returning * into s;

  insert into public.study_logs as l (student_id, date, minutes, problems, updated_at)
  values (s.student_id, s.date, v_mins, v_problems, now())
  on conflict (student_id, date) do update
    set minutes    = l.minutes + excluded.minutes,
        problems   = l.problems + excluded.problems,
        updated_at = now()
  returning * into v_log;

  return jsonb_build_object(
    'session',        to_jsonb(s),
    'log',            to_jsonb(v_log),
    'seconds',        v_secs,
    'minutes',        v_mins,
    'problems',       v_problems,
    'total_minutes',  coalesce(v_log.minutes, 0),
    'total_problems', coalesce(v_log.problems, 0),
    'date',           s.date
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. 권한 · RLS
--    앱은 익명 키(anon)로 동작합니다. 관리자 화면은 앱 안의 비밀번호로 입장합니다.
-- ---------------------------------------------------------------------

alter table public.students       enable row level security;
alter table public.study_sessions enable row level security;
alter table public.study_logs     enable row level security;

drop policy if exists students_anon_all on public.students;
create policy students_anon_all on public.students
  for all to anon, authenticated using (true) with check (true);

drop policy if exists study_sessions_anon_all on public.study_sessions;
create policy study_sessions_anon_all on public.study_sessions
  for all to anon, authenticated using (true) with check (true);

drop policy if exists study_logs_anon_all on public.study_logs;
create policy study_logs_anon_all on public.study_logs
  for all to anon, authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.students, public.study_sessions, public.study_logs to anon, authenticated;

grant execute on function public.server_now() to anon, authenticated;
grant execute on function public.kst_today() to anon, authenticated;
grant execute on function public.session_elapsed_seconds(timestamptz, timestamptz, timestamptz, text, integer) to anon, authenticated;
grant execute on function public.find_students_by_code(text) to anon, authenticated;
grant execute on function public.reconcile_session(uuid) to anon, authenticated;
grant execute on function public.active_session(uuid) to anon, authenticated;
grant execute on function public.start_session(uuid) to anon, authenticated;
grant execute on function public.pause_session(uuid, boolean) to anon, authenticated;
grant execute on function public.resume_session(uuid) to anon, authenticated;
grant execute on function public.heartbeat(uuid) to anon, authenticated;
grant execute on function public.finish_session(uuid, integer) to anon, authenticated;
