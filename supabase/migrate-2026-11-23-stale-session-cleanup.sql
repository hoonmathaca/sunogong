-- =====================================================================
-- 2026-11-23  지난 날짜 미종료 세션 자동 정리
--   · cleanup_stale_study_sessions(dry_run) — 한국 시간 오늘 00:00 이전에 시작한
--     미종료(ended_at is null) 세션을 기존 자정·일시정지 규칙 그대로 마무리한다.
--       - 일시정지된 공부: 멈춘 시각(paused_at)까지를 그 날 기록으로 정산
--         (학원 공부는 study_logs, 숙제 공부는 승인 대기 제출)
--       - 일시정지 없이 자정을 넘긴 공부: 기록 없이 세션만 폐기 (기존 규칙)
--       - 0분·0문제 숙제는 승인 대기 없이 세션만 마무리
--       - 오늘 시작한 세션은 절대 건드리지 않는다
--   · maybe_cleanup_stale_study_sessions() — 지난 세션이 있을 때만 정리 (안전장치)
--       학생 로그인(active_session·start_session)과 근두운 판(live_study_board)이
--       먼저 이 함수를 거치므로, 예약 작업이 한 번 실패해도 앱을 쓰는 순간 정리된다.
--   · pg_cron — 매일 00:05 KST(UTC 15:05)에 자동 실행 (pg_cron을 쓸 수 없으면
--       조용히 건너뛰고 위 안전장치만 남긴다)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 미종료 세션 조회용 부분 인덱스 (안전장치가 매번 확인해도 가볍게)
-- ---------------------------------------------------------------------
create index if not exists study_sessions_unfinished_started_idx
  on public.study_sessions (started_at)
  where ended_at is null;

-- ---------------------------------------------------------------------
-- 2. 지난 날짜 미종료 세션 정리
--    p_dry_run = true 이면 아무것도 바꾸지 않고 대상과 계획만 돌려준다.
-- ---------------------------------------------------------------------
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
        v_plan := 'nothing';          -- 0분·0문제 — 기록 없이 세션만 마무리
      elsif coalesce((v_res ->> 'pending_approval')::boolean, false) then
        v_pending := v_pending + 1;
        v_plan := 'pending_approval'; -- 숙제 공부 — 선생님 승인 대기 제출
      else
        v_settled := v_settled + 1;
        v_plan := 'settled';          -- 그 날 기록(study_logs)에 반영
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

-- ---------------------------------------------------------------------
-- 3. 안전장치 — 지난 세션이 있을 때만 정리한다 (앱 진입 RPC가 먼저 부른다)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 4. 앱 진입 RPC에서 먼저 정리 — 학생 로그인, 근두운 판
--    (start_session · active_session · live_study_board 본문은 그대로 두고
--     맨 앞에 정리 호출만 넣는다)
-- ---------------------------------------------------------------------
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
-- 5. 매일 00:05 KST 자동 실행 (pg_cron)
--    00:05 KST = 15:05 UTC. pg_cron 을 쓸 수 없는 환경이면 건너뛴다
--    (위 안전장치가 앱 진입 순간 정리하므로 기능은 그대로 동작한다).
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 6. 권한 — 정리는 서버(예약 작업·앱 진입 함수)만 한다. 앱에서 직접 부를 수는 없다.
-- ---------------------------------------------------------------------
revoke all on function public.cleanup_stale_study_sessions(boolean) from public;
revoke all on function public.cleanup_stale_study_sessions(boolean) from anon, authenticated;
grant execute on function public.cleanup_stale_study_sessions(boolean) to service_role;

revoke all on function public.maybe_cleanup_stale_study_sessions() from public;
revoke all on function public.maybe_cleanup_stale_study_sessions() from anon, authenticated;
grant execute on function public.maybe_cleanup_stale_study_sessions() to service_role;

notify pgrst, 'reload schema';
