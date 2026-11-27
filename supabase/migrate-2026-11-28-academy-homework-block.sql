-- =====================================================================
--  선오공 — 학원 등원 중에는 「숙제 공부」를 시작하지 않는다 (2026-11-28)
--  Supabase Dashboard > SQL Editor 에서 한 번 실행하세요.
--  여러 번 실행해도 안전합니다(create or replace).
--
--  ■ 증상
--    훈출(등·하원)이 학원 세션을 열어 둔 동안(student-app: kind='academy', status running/paused)
--    학생이 선오공 홈에서 「🏠 숙제 공부 시작」을 누르면, start_session 이 종류와 상관없이
--    그 학원 세션을 그대로 돌려줘서 학원 타이머가 켜지고 그 시간이 학원 공부로 합산됐다.
--    (2026-11-27 학원 세션 15건에 시작 이후 하트비트가 찍혀 있음 — 앱이 그 세션 타이머를 띄우고 있었다는 뜻)
--
--  ■ 고침 두 가지
--    1) start_session(p_kind = 'homework') — 그 학생에게 활성 학원 세션이 있으면
--       기존 세션을 돌려주지 않고 'academy_session_active' 로 거부한다.
--       · p_kind = 'academy' 로 부르는 길(훈출·기존 화면)과 진행 중 세션 조회는 예전 그대로다.
--    2) settle_academy_session — 0분 세션이 problems_pending=true 로 남지 않게 한다.
--       problems 를 아직 안 넣었어도 1분도 공부하지 않았으면 물어볼 것이 없다
--       (auto_end_paused_session·finish_session 과 같은 규칙).
--       ※ settle_academy_session 은 훈출 연동(supabase 프로젝트 안)에서 만든 함수라 schema.sql 에는 없다.
--          본문은 운영 DB 정의 그대로이고 아래 한 줄만 바뀌었다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. start_session — 진행 중인 학원 세션은 숙제 공부 시작을 막는다
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

  -- (2026-11-28) 학원 등원 중에는 숙제 공부를 시작하지 않는다.
  --   예전에는 종류와 상관없이 진행 중인 세션을 돌려줘서, 재실 중 「숙제 공부」를 누르면
  --   학원 타이머가 켜지고 그 시간이 학원 공부로 합산됐다.
  if v_kind = 'homework' then
    if exists (
      select 1
        from public.study_sessions
       where student_id = p_student_id
         and status in ('running', 'paused')
         and coalesce(kind, 'academy') = 'academy'
    ) then
      raise exception 'academy_session_active' using errcode = 'P0001';
    end if;
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

comment on function public.start_session(uuid, text) is
  '공부 시작 — 진행 중인 세션이 있으면 그 세션을 돌려준다. 단 학원 등원 중(kind=academy 활성)에는 숙제 공부 시작을 academy_session_active 로 거부한다 (2026-11-28)';

-- ---------------------------------------------------------------------
-- 2. settle_academy_session — 0분 세션은 문제 수를 묻지 않는다
-- ---------------------------------------------------------------------
create or replace function public.settle_academy_session(p_session uuid, p_at timestamp with time zone default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  s      public.study_sessions;
  v_cap  timestamptz;
  v_mins integer;
  v_log  public.study_logs;
begin
  select * into s from public.study_sessions where id = p_session for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'session_not_found');
  end if;

  -- 이미 끝난 세션은 그대로 (같은 요청이 두 번 와도 기록이 두 번 쌓이지 않는다)
  if s.status = 'finished' then
    select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;
    return jsonb_build_object('ok', true, 'already_finished', true,
                              'session', to_jsonb(s), 'log', to_jsonb(v_log));
  end if;

  -- 숙제 공부는 승인 대기 제출로 넘긴다 (문제 수·사진은 나중에)
  if coalesce(s.kind, 'academy') = 'homework' then
    return public.close_homework_session(s.id, null, '{}'::text[]);
  end if;

  -- 그 날 자정을 넘긴 공부는 기록하지 않고 세션만 버린다 (선오공 규칙 그대로)
  v_cap := ((s.date + 1)::timestamp at time zone 'Asia/Seoul') - interval '1 second';
  if p_at > v_cap then
    delete from public.study_sessions where id = s.id;
    return jsonb_build_object('ok', true, 'discarded', true);
  end if;

  v_mins := greatest(0, (extract(epoch from (p_at - s.started_at)) / 60)::int
                       - (coalesce(s.paused_seconds, 0) / 60));

  update public.study_sessions
     set status           = 'finished',
         ended_at         = p_at,
         paused_at        = null,
         last_pause_auto  = false,
         minutes          = v_mins,
         -- (2026-11-28) 0분 세션은 problems_pending 을 남기지 않는다.
         --   problems_pending 만 걸어 두면 pending_problem_sessions() 의 minutes > 0 필터에 걸려
         --   학생 화면에는 영원히 뜨지 않는 유령 대기가 된다(2026-11-27 이지빈 2건).
         problems_pending = (s.problems is null and v_mins > 0)
   where id = s.id
   returning * into s;

  if v_mins > 0 then
    insert into public.study_logs as l (
      student_id, date, minutes, problems,
      academy_minutes, academy_problems, homework_minutes, homework_problems, updated_at
    )
    values (
      s.student_id, s.date, v_mins, coalesce(s.problems, 0),
      v_mins, coalesce(s.problems, 0), 0, 0, now()
    )
    on conflict (student_id, date) do update
      set minutes          = l.minutes + excluded.minutes,
          problems         = l.problems + excluded.problems,
          academy_minutes  = l.academy_minutes + excluded.academy_minutes,
          academy_problems = l.academy_problems + excluded.academy_problems,
          updated_at       = now()
    returning * into v_log;
  else
    select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;
  end if;

  return jsonb_build_object(
    'ok', true,
    'session', to_jsonb(s),
    'log', to_jsonb(v_log),
    'minutes', v_mins,
    'problems_pending', s.problems_pending
  );
end $function$;

comment on function public.settle_academy_session(uuid, timestamptz) is
  '훈출 하원 정산 — 학원 세션을 그때까지의 시간으로 마무리한다. 0분 세션은 problems_pending 을 남기지 않는다 (2026-11-28)';

-- 앱(PostgREST)이 바뀐 함수를 바로 알게 한다
notify pgrst, 'reload schema';
