-- =====================================================================
--  선오공 — 일시정지 30분 알림 / 60분 자동 종료 / 다음 접속 때 문제 수 입력
--  Supabase Dashboard > SQL Editor 에서 이 파일을 한 번 실행하세요.
--  여러 번 실행해도 안전합니다(if not exists / create or replace).
--
--  · 일시정지(쉬는 중) 30분이 지나면 앱이 "아직 공부 중인가요?" 알림창을 띄운다. (앱 화면)
--  · 그 뒤 30분(일시정지 총 60분)이 더 지나면 세션을 자동 종료한다 (auto_end_paused_session).
--    공부 시간은 쉬기 전까지 실제로 공부한 시간(시작~일시정지 - 일시정지 누적)으로 저장하고,
--    문제 수는 아직 모르므로 problems_pending = true 로 표시해 둔다. (study_logs 문제 수는 0)
--  · 자동 종료된 세션은 학생이 다음에 접속하면 문제 수를 물어보고, 입력하면
--    set_session_problems() 가 그 날 기록(study_logs)에 문제 수를 더한다 → 통계·랭킹에 반영.
--
--  세션 상태(status)는 기존 그대로 'finished' 를 쓰고, 문제 수 미입력은
--  problems_pending 열로 구분한다. (status 에 값을 더하면
--   "학생 한 명은 동시에 하나의 세션만" 부분 유일 인덱스와 부딪혀
--   문제 수를 넣기 전에 새 공부를 시작할 수 없게 된다)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 세션에 표시 열 추가
-- ---------------------------------------------------------------------
alter table public.study_sessions add column if not exists problems_pending boolean not null default false;
alter table public.study_sessions add column if not exists auto_ended       boolean not null default false;

comment on column public.study_sessions.problems_pending is '쉬는 시간이 60분을 넘어 자동 종료됐고, 문제 수를 아직 입력받지 못한 세션';
comment on column public.study_sessions.auto_ended       is '일시정지 60분 경과로 자동 종료된 세션';

-- 문제 수 입력을 기다리는 세션만 빨리 찾기
create index if not exists study_sessions_pending_problems_idx
  on public.study_sessions (student_id, ended_at)
  where problems_pending;

-- ---------------------------------------------------------------------
-- 2. 일시정지 60분 경과 → 자동 종료
--    이미 끝난 세션이면 그대로 돌려준다(같은 요청이 두 번 와도 기록이 두 번 쌓이지 않음).
--    쉬는 중(paused)인 세션만 대상이다. 공부 중(running)인 세션은 건드리지 않는다.
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
         problems         = null,          -- 아직 모른다 (problems_pending 으로 표시)
         problems_pending = true,
         auto_ended       = true
   where id = s.id
   returning * into s;

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
    'problems_pending', true,
    'auto_ended',       true
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. 자동 종료된 세션의 문제 수 입력 → 그 날 기록에 더한다
--    (한 세션에 한 번만. 이미 입력한 세션은 problems_not_pending 오류)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 4. 문제 수 입력을 기다리는 세션 목록 (오래된 것부터)
--    공부한 시간이 0분인 세션은 물어볼 것이 없으니 뺀다.
--    최근 30일 것만 돌려준다.
-- ---------------------------------------------------------------------
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
     and problems_pending
     and coalesce(minutes, 0) > 0
     and date >= (public.kst_today() - 30)
   order by coalesce(ended_at, created_at) asc, created_at asc;
$$;

-- ---------------------------------------------------------------------
-- 5. 권한
-- ---------------------------------------------------------------------
grant execute on function public.auto_end_paused_session(uuid) to anon, authenticated;
grant execute on function public.set_session_problems(uuid, integer) to anon, authenticated;
grant execute on function public.pending_problem_sessions(uuid) to anon, authenticated;
