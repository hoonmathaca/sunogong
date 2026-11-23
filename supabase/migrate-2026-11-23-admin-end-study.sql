-- =====================================================================
-- 2026-11-23  관리자 「수업 종료」 — 실시간 탭에서 진행 중인 공부를 선생님이 직접 마무리
--   · admin_end_study_session(session, problems) — 학원·숙제 모두
--       - 이미 끝난 세션이면 아무것도 건드리지 않고 지금 상태만 돌려준다(두 번 눌러도 안전)
--       - 일시정지 중이면 paused_at, 공부 중이면 now() 기준으로 시간을 정산한다
--         (finish_session · close_homework_session 과 같은 규칙을 그대로 쓴다)
--       - 숙제 공부는 기존 규칙대로 승인 대기 제출(submit)로 넘긴다
--       - 자정을 넘긴 공부는 기록하지 않고 세션만 버린다(기존 규칙)
--   · study_session_state(session) — 학생 기기가 타이머에 머물러 있어도
--       선생님이 끝냈는지 알 수 있게 지금 상태(와 끝났을 때의 결과)를 돌려준다
--   · study_sessions.ended_by_admin — 선생님이 마무리했다는 표시(학생 화면 안내에 쓴다)
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
