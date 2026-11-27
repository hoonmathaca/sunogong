-- =====================================================================
--  선오공 — 60분 자동 종료된 「숙제 공부」를 승인 대기로 되돌린다 (2026-11-28)
--  Supabase Dashboard > SQL Editor 에서 한 번 실행하세요.
--
--  ■ 왜 필요한가
--    2026-11-23 숙제 공부는 「사진 + 시간/문항수 → 선생님 승인 → 기록」 규칙이 됐고,
--    auto_end_paused_session(60분 쉬면 자동 종료)도 승인 대기 제출을 만들도록 고쳤었다.
--    2026-11-27 migrate-2026-11-27-academy-zero-end-guard.sql 이 이 함수를 다시 만들 때
--    그 갈래가 빠져, 쉬는 시간이 길어 자동 종료된 숙제 공부가
--    선생님 확인 없이 바로 study_logs(기록·랭킹)에 들어가고 있었다. (2026-11-28 확인)
--
--  ■ 무엇을 하나
--    지금 함수(11/27 가드: 재원 중이면 자동 종료하지 않음 · 60초 미만 자동 종료 금지)에
--    숙제 갈래만 되살린다 — 숙제는 close_homework_session 으로 넘겨 승인 대기 제출을 만든다.
--    학원 공부 갈래는 손대지 않는다.
-- =====================================================================

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
  v_att_open boolean := false;
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

  -- (2026-11-27) 출훈이 연 학원 세션은 좌석에 앉아 있는 동안 끝내지 않는다.
  --   키오스크 등원 중에 선오공이 자동 종료하면 그 뒤 하원이 정산할 세션이 없어져
  --   실제로 앉아 있던 시간이 기록되지 않는다(2026-11-27 김도혁 132분 → 0분).
  --   finish_session 의 academy_managed_by_kiosk 가드와 같은 규칙이고,
  --   여기서는 오류 대신 '아직 끝내지 않았다(blocked)'로 답해 선오공 화면이 그대로 이어 간다.
  if s.attendance_id is not null then
    select exists (
      select 1 from public.attendance_sessions a
       where a.id = s.attendance_id and a.check_out_at is null
    ) into v_att_open;

    if v_att_open then
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
        'problems_pending', s.problems_pending,
        'blocked',          true,
        'reason',           'academy_managed_by_kiosk'
      );
    end if;
  end if;

  -- 숙제 공부는 승인 대기 제출로 넘긴다 (문제 수는 다음 접속 때 제출 표에서 받는다)
  --   ※ 2026-11-23 숙제 사진 인증·승인 규칙. 2026-11-27 가드가 이 함수를 다시 만들면서
  --     이 갈래가 빠져, 60분 자동 종료된 숙제가 선생님 확인 없이 바로 기록에 들어가던 문제를 되돌린다.
  if coalesce(s.kind, 'homework') = 'homework' then
    v_res := public.close_homework_session(s.id, null, '{}'::text[]);
    return v_res || jsonb_build_object(
      'problems_pending', coalesce((v_res ->> 'pending_approval')::boolean, false),
      'auto_ended',       true
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

revoke all on function public.auto_end_paused_session(uuid) from public;
grant execute on function public.auto_end_paused_session(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
