-- =====================================================================
--  선오공 — 2026-11-19 숙제 공부 자동 일시정지 (화면 꺼짐·앱 이탈)
--  Supabase Dashboard > SQL Editor 에서 이 파일만 한 번 실행하면 됩니다.
--  (schema.sql 을 실행해도 같은 내용이 들어갑니다)
--
--  · 숙제 공부(homework): 하트비트가 30초 이상 끊기면 서버도 자동 일시정지
--  · 학원 공부(academy): 화면을 꺼도 계속 흐름 (그대로)
--  · pause_session: 벗어나 있던 시간을 두 번 빼던 계산을 바로잡음
--    (멈춘 시각을 마지막 신호 시각으로 잡으면 그 뒤 시간은 이미 세지 않으므로
--     paused_seconds 에 또 더하지 않는다)
--  · 기존 학생·공부 기록은 건드리지 않습니다. 여러 번 실행해도 안전합니다.
-- =====================================================================

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
