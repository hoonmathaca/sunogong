-- =====================================================================
-- 선오공 · 칠성구 합치기 → 무지개 볼 & 무지개 신룡 소환 (2026-11-21)
--
--  · students.rainbow_ball_count : 만든 무지개 볼 개수 (0 이상)
--  · craft_rainbow_ball()        : 1~7성구를 하나씩(모두 1개 이상 있을 때) 합쳐
--                                  무지개 볼 1개로 만든다. 성구 7개가 빠지고
--                                  dragonball_count 도 7 줄어든다. (한 트랜잭션)
--  · student_profile()           : rainbow_ball_count 추가
--  · student_dragonballs()       : rainbow_ball_count · 지금 합칠 수 있는지 추가
--  · live_study_board()          : 친구 줄에 rainbow_ball_count 추가
--
--  Supabase SQL Editor 에 그대로 붙여 넣어 실행하면 됩니다.
--  (여러 번 실행해도 안전합니다)
--
--  확인용 (주석을 풀어 실행):
--    select name, dragonball_count, dragonballs, rainbow_ball_count
--      from public.students order by rainbow_ball_count desc, name limit 20;
--    select * from public.live_study_board();
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. students.rainbow_ball_count
-- ---------------------------------------------------------------------
alter table public.students
  add column if not exists rainbow_ball_count integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'students_rainbow_ball_count_check') then
    alter table public.students
      add constraint students_rainbow_ball_count_check check (rainbow_ball_count >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. 칠성구 합치기 — 무지개 볼 하나 (무지개 신룡 소환)
--    반환: {crafted, rainbow_ball_count, dragonballs, total, collected}
--    부족하면 dragonballs_incomplete 오류 (아무것도 바뀌지 않는다)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 3. 내 닉네임 · 드래곤볼 (무지개 볼 포함)
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
    'nickname',           v_row.nickname,
    'dragonball_count',   coalesce(v_row.dragonball_count, 0),
    'dragonballs',        coalesce(v_row.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb),
    'rainbow_ball_count', coalesce(v_row.rainbow_ball_count, 0)
  );
end;
$$;

-- 내 드래곤볼 도감 — 성구 맵·총 개수·모은 종류 수·무지개 볼·합칠 수 있는지
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

-- ---------------------------------------------------------------------
-- 4. 근두운 — 공부 중인 친구 줄에 무지개 볼 개수도 함께
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

grant execute on function public.craft_rainbow_ball(uuid) to anon, authenticated;
grant execute on function public.student_profile(uuid) to anon, authenticated;
grant execute on function public.student_dragonballs(uuid) to anon, authenticated;
grant execute on function public.live_study_board(uuid) to anon, authenticated;
