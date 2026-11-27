-- =====================================================================
--  선오공 — 학원(academy) 세션 「0분 종료」 원천 차단 가드 (2026-11-27)
--  Supabase Dashboard > SQL Editor 에서 한 번 실행하세요.
--  여러 번 실행해도 안전합니다(create or replace / drop if exists).
--
--  ■ 무슨 일이 있었나
--    출훈(키오스크)이 등원할 때 study_sessions(kind='academy', status='running',
--    attendance_id=…) 를 INSERT 한다. 이때 last_heartbeat_at 은 INSERT 시각
--    (= started_at) 그대로이고, 출훈은 하트비트를 보내지 않는다(하트비트는 선오공 앱만).
--    30초만 지나면 선오공 앱은 그 세션을 "하트비트 끊김"으로 보고 pause_session(p_auto=true)
--    를 부른다. pause_session 은 끊김이 30초를 넘으면 paused_at = last_heartbeat_at 으로
--    저장하므로 "멈춘 시각 = 시작 시각" 이 된다(이때 auto_pause_count +1).
--    그 뒤 학생이 종료를 누르거나 60분 일시정지 자동 종료가 돌면 finish_session 이
--    ended_at = paused_at 을 쓰기 때문에
--       started_at == ended_at(같은 시각) · minutes 0 · problems 0 · auto_pause_count 1
--    인 0분짜리 기록이 남는다. (2026-11-27 04:58·06:36 실데이터에서 같은 모양 확인)
--
--  ■ 가드 4가지 (숙제 공부·출훈 하원 흐름은 건드리지 않는다)
--    1) pause_session — 학원 세션은 자동 일시정지하지 않는다. 수동 일시정지도
--       paused_at 이 started_at 보다 반드시 뒤가 되게 한다.
--    2) finish_session — 학원 세션이 ① 실제 공부 60초 미만이면 academy_too_short,
--       ② 출훈이 연 세션(attendance_id 있음)인데 아직 하원 전이면
--          academy_managed_by_kiosk 로 거부한다. 관리자 「수업 종료」는 p_force 로 통과.
--    3) auto_end_paused_session — 실제 60초 미만이면 자동 종료하지 않고 그대로 둔다.
--    4) study_sessions BEFORE UPDATE 트리거 — 학생 폰(anon/authenticated)이 표를 직접
--       고쳐서 출훈이 연 학원 세션을 끝내지 못하게 한다(하트비트만 허용).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 학원 세션 최소 인정 시간
--    0분 기록을 만들지 않기 위한 기준. 1분(60초)보다 짧으면 '방금 시작한 공부'로 본다.
-- ---------------------------------------------------------------------
create or replace function public.academy_min_study_seconds()
returns integer
language sql
immutable
as $$ select 60 $$;

comment on function public.academy_min_study_seconds() is
  '학원 공부 세션을 마무리하려면 최소 이만큼(초)은 실제로 공부해야 한다 (0분 기록 방지)';

-- ---------------------------------------------------------------------
-- 1. pause_session — 학원 공부는 자동으로 멈추지 않는다
--    · 숙제(homework): 지금과 똑같이 화면 이탈·하트비트 끊김에 일시정지
--    · 학원(academy): 자동 일시정지는 하지 않는다. 수동 일시정지일 때만 멈추되,
--      멈춘 시각이 시작 시각 이하가 되지 않게 한다(0초 일시정지 → 0분 종료 방지).
-- ---------------------------------------------------------------------
create or replace function public.pause_session(p_session_id uuid, p_auto boolean default false)
returns public.study_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s      public.study_sessions;
  v_gap  integer;
  v_want timestamptz;
  v_floor timestamptz;
begin
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if s.status <> 'running' then
    return s;
  end if;

  -- 하트비트가 30초 이상 끊긴 채로 멈추면 마지막 신호 시각을 멈춘 시각으로 본다.
  v_gap := greatest(0, floor(extract(epoch from (now() - s.last_heartbeat_at)))::integer);

  -- (2026-11-27) 학원 공부는 자동 일시정지하지 않는다.
  --   출훈이 등원으로 연 학원 세션은 하트비트가 시작 시각에 멈춰 있어 '끊김'으로 보이는데,
  --   그때 멈추면 멈춘 시각이 시작 시각이 되어 0분짜리 기록의 씨앗이 된다.
  --   학원 공부는 화면을 꺼도 시간이 흐르는 것이 원래 규칙이므로 그대로 둔다.
  if coalesce(s.kind, 'academy') <> 'homework' and (p_auto or v_gap > 30) then
    return s;
  end if;

  v_want := case when v_gap > 30 then s.last_heartbeat_at else now() end;
  v_floor := s.started_at + interval '1 second';
  if v_want < v_floor then
    v_want := greatest(now(), v_floor);
  end if;

  update public.study_sessions
     set status           = 'paused',
         paused_at        = v_want,
         auto_pause_count = s.auto_pause_count + case when p_auto or v_gap > 30 then 1 else 0 end,
         last_pause_auto  = (p_auto or v_gap > 30)
   where id = s.id
   returning * into s;

  return s;
end;
$$;

comment on function public.pause_session(uuid, boolean) is
  '일시정지. 숙제 공부만 자동 일시정지하고, 학원 공부는 자동으로 멈추지 않는다 (2026-11-27 가드)';

-- ---------------------------------------------------------------------
-- 2. finish_session — 학원 세션 0분 종료 거부 (+ 관리자 강제 종료용 p_force)
--    · p_force = false(기본, 학생 앱) : 아래 두 경우를 거부한다
--        - 학원 세션이고 실제 공부가 60초 미만 → academy_too_short
--        - 출훈이 연 학원 세션(attendance_id 있음)인데 하원 처리가 아직 안 됨
--          → academy_managed_by_kiosk  (하원을 누르면 학원 공부는 자동으로 마무리된다)
--    · p_force = true : 관리자 「수업 종료」(admin_end_study_session) 전용
--    · 숙제 공부는 지금처럼 close_homework_session(사진·문제 수 승인 대기)으로 넘긴다
-- ---------------------------------------------------------------------
drop function if exists public.finish_session(uuid, integer);

create or replace function public.finish_session(
  p_session_id uuid,
  p_problems   integer default 0,
  p_force      boolean default false
)
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
  v_att_open boolean := false;
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

  -- (2026-11-27) 학원 공부 0분 종료 가드 -------------------------------------
  --   오늘 세션에만 적용한다. 지난 날 남은 세션 정리(cleanup_stale_study_sessions)와
  --   5시간 상한 자동 마무리(reconcile_session·resume_session)는 그대로 끝낼 수 있다.
  if not coalesce(p_force, false)
     and coalesce(s.kind, 'academy') <> 'homework'
     and s.date = public.kst_today()
     and v_secs < 18000 then
    -- ① 방금 시작한 공부(60초 미만)는 0분짜리 기록이 되므로 마무리하지 않는다
    if v_secs < public.academy_min_study_seconds() then
      raise exception 'academy_too_short' using errcode = 'P0002';
    end if;

    -- ② 출훈이 연 학원 세션은 하원으로 마무리된다. 하원 전에 앱에서 끝내면
    --    그 뒤 하원이 정산할 세션이 없어져 기록이 잘린다.
    if s.attendance_id is not null then
      select exists (
        select 1 from public.attendance_sessions a
         where a.id = s.attendance_id and a.check_out_at is null
      ) into v_att_open;

      if v_att_open then
        raise exception 'academy_managed_by_kiosk' using errcode = 'P0002';
      end if;
    end if;
  end if;
  ------------------------------------------------------------------------

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

comment on function public.finish_session(uuid, integer, boolean) is
  '종료. 학원 세션은 0분(60초 미만)·하원 전이면 거부한다. p_force=true 는 관리자 수업 종료 전용 (2026-11-27)';

-- ---------------------------------------------------------------------
-- 3. auto_end_paused_session — 0분 자동 종료 금지
--    일시정지 60분이 지나도 실제 공부가 60초 미만이면 마무리하지 않고 그대로 둔다.
--    (문제 수는 다음 접속 때 입력하는 기존 흐름은 그대로)
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

  v_secs := greatest(0, floor(extract(epoch from (v_end - s.started_at)))::integer - s.paused_seconds);

  -- (2026-11-27) 실제 공부가 60초 미만이면 자동 종료하지 않는다.
  --   멈춘 시각이 시작 시각인 세션(출훈 등원 직후 구버전이 멈춰 버린 경우)이 여기로 와서
  --   0분짜리 기록으로 마무리되던 문제를 막는다. 세션은 그대로 두고 화면이 다시 물어보게 한다.
  if v_secs < public.academy_min_study_seconds() then
    return jsonb_build_object(
      'session',          to_jsonb(s),
      'log',              null,
      'seconds',          v_secs,
      'minutes',          0,
      'problems',         0,
      'total_minutes',    0,
      'total_problems',   0,
      'date',             s.date,
      'kind',             s.kind,
      'problems_pending', s.problems_pending,
      'too_short',        true
    );
  end if;

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

-- ---------------------------------------------------------------------
-- 4. admin_end_study_session — 관리자 「수업 종료」는 가드를 통과한다
--    (학생 하원 직후 바로 끝내는 정상 흐름을 막지 않기 위해 p_force = true)
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

  -- 학원 공부 — finish_session 이 일시정지/진행·자정 넘김·5시간 상한을 그대로 처리한다.
  --   관리자가 직접 누른 종료이므로 0분 가드는 통과시킨다(p_force = true).
  v_res := public.finish_session(s.id, v_problems, true);

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
-- 5. study_sessions 직접 수정 가드 (학생 폰이 표를 직접 고치는 경로 차단)
--    · 선오공 RPC 는 owner(postgres)로 실행되므로 이 가드에 걸리지 않는다.
--    · anon/authenticated(학생 폰·구버전 탭)가 표를 직접 고칠 때만 검사한다.
--      ① 출훈이 연 학원 세션(attendance_id 있음)은 하트비트 외에는 바꿀 수 없다
--      ② 어떤 세션이든 60초 미만에서 'finished' 로 바꿀 수 없다
-- ---------------------------------------------------------------------
create or replace function public.study_session_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role   text;
  v_claims text;
begin
  -- '학생 폰(anon/authenticated)이 직접 고쳤는지' 판단한다.
  --   · security definer 함수 안에서는 current_user 가 함수 주인(postgres)으로 바뀌므로
  --     SET ROLE 값(current_setting('role'))과 PostgREST 의 JWT role 을 함께 본다.
  --   · 앱 RPC(security definer)는 role 이 비어 있거나 postgres 라서 이 가드를 지나간다.
  v_role := coalesce(nullif(current_setting('role', true), ''), '');
  if v_role = '' or v_role = 'none' then
    v_role := current_user;
  end if;

  if v_role <> 'anon' and v_role <> 'authenticated' then
    v_claims := nullif(current_setting('request.jwt.claims', true), '');
    if v_claims is not null then
      begin
        v_role := coalesce(v_claims::jsonb ->> 'role', v_role);
      exception when others then
        null;  -- 형식이 다르면 무시 (가드 없이 진행하지 않도록 아래에서 다시 확인)
      end;
    end if;
  end if;

  if v_role <> 'anon' and v_role <> 'authenticated' then
    return new;
  end if;

  -- ① 출훈이 연 학원 세션은 학생 폰이 하트비트만 남길 수 있다
  if coalesce(old.kind, 'academy') = 'academy' and old.attendance_id is not null then
    if new.status          is distinct from old.status
       or new.minutes        is distinct from old.minutes
       or new.problems       is distinct from old.problems
       or new.ended_at       is distinct from old.ended_at
       or new.paused_at      is distinct from old.paused_at
       or new.paused_seconds is distinct from old.paused_seconds
       or new.started_at     is distinct from old.started_at
       or new.attendance_id  is distinct from old.attendance_id
       or new.date           is distinct from old.date then
      raise exception 'session_managed_by_kiosk' using errcode = '42501';
    end if;
  end if;

  -- ② 0분 종료 금지 (직접 쓰기 경로)
  if new.status = 'finished' and coalesce(old.status, '') <> 'finished' then
    if floor(extract(epoch from (coalesce(new.ended_at, now()) - old.started_at))) < public.academy_min_study_seconds() then
      raise exception 'academy_too_short' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists study_sessions_kiosk_guard on public.study_sessions;
create trigger study_sessions_kiosk_guard
  before update on public.study_sessions
  for each row execute function public.study_session_guard();

-- ---------------------------------------------------------------------
-- 6. 권한 — 앱(anon)이 부르던 함수는 그대로 열어 둔다
-- ---------------------------------------------------------------------
revoke all on function public.finish_session(uuid, integer, boolean) from public;
grant execute on function public.finish_session(uuid, integer, boolean) to anon, authenticated, service_role;

revoke all on function public.pause_session(uuid, boolean) from public;
grant execute on function public.pause_session(uuid, boolean) to anon, authenticated, service_role;

revoke all on function public.auto_end_paused_session(uuid) from public;
grant execute on function public.auto_end_paused_session(uuid) to anon, authenticated, service_role;

revoke all on function public.admin_end_study_session(uuid, integer) from public;
grant execute on function public.admin_end_study_session(uuid, integer) to anon, authenticated, service_role;

revoke all on function public.study_session_guard() from public;

-- 앱(PostgREST)이 바뀐 함수를 바로 알게 한다
notify pgrst, 'reload schema';
