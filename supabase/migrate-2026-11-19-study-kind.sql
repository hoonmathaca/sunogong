-- =====================================================================
--  선오공 — 2026-11-19 추가 마이그레이션
--  1) 공부 종류(학원/숙제) 구분 저장
--  2) 자정을 넘긴 세션은 기록하지 않고 버리기
--  3) 화면이 꺼져도 타이머가 멈추지 않도록 서버 자동 일시정지 규칙 정리
--
--  Supabase Dashboard > SQL Editor 에 이 파일을 그대로 붙여넣고 실행하세요.
--  여러 번 실행해도 안전하며, 기존 학생·공부 기록은 지우지 않습니다
--  (열을 추가만 하고, 기존 기록은 '학원 공부'로 한 번만 채워 넣습니다).
--  전체 스키마는 supabase/schema.sql 이며, 그 파일을 실행해도 결과는 같습니다.
-- =====================================================================

-- 1) 열 추가
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

-- 2) 세션 정리 함수 — 자정을 넘기면 기록 없이 버린다 (하트비트 끊김 자동 일시정지는 없앤다)
-- 진행 중 세션 정리: 자정 초과 / 5시간 초과
create or replace function public.reconcile_session(p_session_id uuid)
returns public.study_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s     public.study_sessions;
  v_now timestamptz := now();
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

  -- (2) 하트비트가 끊겨도 임의로 일시정지하지 않는다.
  --     화면을 끄고 공부를 계속하는 경우(페이지가 잠들어 하트비트가 끊김)를 공부 시간으로 인정한다.
  --     앱을 닫았다가 다시 연 경우는 클라이언트가 마지막 신호 시각까지로 일시정지시킨다.

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

-- 3) 공부 시작 RPC — 종류(academy/homework)를 함께 받는다
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

-- 4) 종료 RPC — 종류별로 나눠서 study_logs 에 누적한다
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

-- 5) 세션 버리기 RPC
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

-- 6) 권한 (함수를 다시 만들었으므로 필요)
grant execute on function public.reconcile_session(uuid) to anon, authenticated;
grant execute on function public.start_session(uuid, text) to anon, authenticated;
grant execute on function public.finish_session(uuid, integer) to anon, authenticated;
grant execute on function public.discard_session(uuid) to anon, authenticated;

-- 7) 확인용 (주석을 풀어 실행해 보세요)
--   select kind, count(*) from public.study_sessions group by kind;
--   select date, minutes, academy_minutes, homework_minutes from public.study_logs order by date desc limit 5;
