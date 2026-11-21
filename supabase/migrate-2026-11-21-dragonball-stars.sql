-- =====================================================================
-- 선오공 · 1성구~7성구 랜덤 획득 & 도감 (2026-11-21)
--
--  · students.dragonballs     : 성구별 보유 개수 맵 {"1":0,...,"7":0}
--                               (합계는 기존 dragonball_count 와 항상 같다)
--  · dragonball_grants.stars  : 그때 지급한 성구 목록 (예: {4,7})
--  · grant_dragonballs()      : 개수만큼 1~7성구를 랜덤으로 뽑아 누적
--  · student_profile()        : 닉네임·총 개수와 함께 성구 맵을 돌려준다
--  · student_dragonballs()    : 성구 맵·총 개수·모은 종류 수만 가볍게 돌려준다
--  · live_study_board()       : 공부 중인 친구 줄에 성구 맵을 함께 싣는다
--
--  Supabase SQL Editor 에 그대로 붙여 넣어 실행하면 됩니다.
--  (여러 번 실행해도 안전합니다)
--
--  확인용 (주석을 풀어 실행):
--    select name, nickname, dragonball_count, dragonballs from public.students order by name limit 20;
--    select * from public.dragonball_grants order by created_at desc limit 10;
--    select * from public.live_study_board();
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. students.dragonballs — 성구별 보유 개수
-- ---------------------------------------------------------------------
alter table public.students
  add column if not exists dragonballs jsonb not null
  default '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb;

-- 예전에 받은 드래곤볼(개수만 있던 것)을 1~7성구로 무작위로 나눠 담는다.
-- 합계는 그대로 유지한다. (이미 성구가 담긴 학생은 건드리지 않는다)
do $$
declare
  r         record;
  remaining integer;
  star      integer;
  parts     jsonb;
begin
  for r in
    select s.id, coalesce(s.dragonball_count, 0) as total
      from public.students s
     where coalesce(s.dragonball_count, 0) > 0
       and coalesce(
             (select sum(value::int) from jsonb_each_text(s.dragonballs)),
             0
           ) = 0
  loop
    remaining := r.total;
    parts := '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb;
    while remaining > 0 loop
      star := 1 + floor(random() * 7)::int;
      parts := jsonb_set(parts, array[star::text], to_jsonb((parts ->> star::text)::int + 1));
      remaining := remaining - 1;
    end loop;
    update public.students set dragonballs = parts where id = r.id;
  end loop;
end $$;

-- 성구 맵은 1~7 키를 모두 갖고, 각 값은 0 이상이며, 합계는 dragonball_count 와 같다
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'students_dragonballs_check') then
    alter table public.students
      add constraint students_dragonballs_check
      check (
        jsonb_typeof(dragonballs) = 'object'
        and dragonballs ? '1' and dragonballs ? '2' and dragonballs ? '3'
        and dragonballs ? '4' and dragonballs ? '5' and dragonballs ? '6'
        and dragonballs ? '7'
        and (dragonballs ->> '1')::int >= 0
        and (dragonballs ->> '2')::int >= 0
        and (dragonballs ->> '3')::int >= 0
        and (dragonballs ->> '4')::int >= 0
        and (dragonballs ->> '5')::int >= 0
        and (dragonballs ->> '6')::int >= 0
        and (dragonballs ->> '7')::int >= 0
        and ((dragonballs ->> '1')::int + (dragonballs ->> '2')::int + (dragonballs ->> '3')::int
           + (dragonballs ->> '4')::int + (dragonballs ->> '5')::int + (dragonballs ->> '6')::int
           + (dragonballs ->> '7')::int) = coalesce(dragonball_count, 0)
      );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. dragonball_grants.stars — 그때 나온 성구 (예: {4,7})
-- ---------------------------------------------------------------------
alter table public.dragonball_grants
  add column if not exists stars integer[] not null default '{}'::integer[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dragonball_grants_stars_check') then
    alter table public.dragonball_grants
      add constraint dragonball_grants_stars_check
      check (stars <@ array[1, 2, 3, 4, 5, 6, 7]::integer[]);
  end if;
end $$;

create index if not exists dragonball_grants_created_idx
  on public.dragonball_grants (created_at desc);

-- ---------------------------------------------------------------------
-- 3. 내 닉네임 · 드래곤볼 (성구 맵 포함)
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
    'nickname',         v_row.nickname,
    'dragonball_count', coalesce(v_row.dragonball_count, 0),
    'dragonballs',      coalesce(v_row.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb)
  );
end;
$$;

-- 내 드래곤볼 도감 — 성구 맵·총 개수·모은 종류 수
create or replace function public.student_dragonballs(p_student_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
           'dragonballs',   coalesce(s.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb),
           'total',         coalesce(s.dragonball_count, 0),
           'collected',     (select count(*) from jsonb_each_text(coalesce(s.dragonballs, '{}'::jsonb)) as e(key, value)
                              where e.value::int > 0)
         )
    from public.students s
   where s.id = p_student_id;
$$;

-- ---------------------------------------------------------------------
-- 4. 근두운 — 공부 중인 친구 줄에 성구 맵을 함께 (실명·학생 id 는 그대로 감춘다)
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
        'nickname',    r.nickname,
        'status',      r.status,
        'started_at',  r.started_at,
        'seconds',     v_secs,
        'is_me',       (p_student_id is not null and r.student_id = p_student_id),
        'dragonballs', r.dragonballs
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
-- 5. 선오공이 드래곤볼 쏘기 — 개수만큼 1~7성구 랜덤
--    반환: {granted, amount, mode, last_total, stars, awards:[{student_id, stars, total, dragonballs}]}
-- ---------------------------------------------------------------------
create or replace function public.grant_dragonballs(
  p_student_ids uuid[],
  p_amount      integer,
  p_mode        text default 'single',
  p_note        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount  integer := floor(coalesce(p_amount, 0))::integer;
  v_mode    text := case when p_mode = 'all' then 'all' else 'single' end;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_id      uuid;
  i         integer;
  v_count   integer := 0;
  v_total   integer := 0;
  v_stars   integer[] := '{}'::integer[];
  v_last    integer[] := '{}'::integer[];
  v_map     jsonb;
  v_awards  jsonb := '[]'::jsonb;
begin
  if v_amount < 1 or v_amount > 99 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if coalesce(array_length(p_student_ids, 1), 0) = 0 then
    raise exception 'no_students' using errcode = '22023';
  end if;

  for v_id in select distinct s.id from public.students s where s.id = any(p_student_ids) loop
    -- 1~7성구를 개수만큼 랜덤으로 뽑는다
    select array_agg(1 + floor(random() * 7)::int) into v_stars
      from generate_series(1, v_amount);
    v_stars := coalesce(v_stars, '{}'::integer[]);

    select coalesce(s.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb),
           coalesce(s.dragonball_count, 0)
      into v_map, v_total
      from public.students s
     where s.id = v_id;

    for i in 1 .. array_length(v_stars, 1) loop
      v_map := jsonb_set(
        v_map,
        array[v_stars[i]::text],
        to_jsonb(coalesce((v_map ->> v_stars[i]::text)::int, 0) + 1)
      );
    end loop;

    update public.students
       set dragonballs      = v_map,
           dragonball_count = v_total + v_amount
     where id = v_id;

    insert into public.dragonball_grants (student_id, amount, mode, note, stars)
    values (v_id, v_amount, v_mode, v_note, v_stars);

    v_count := v_count + 1;
    v_last := v_stars;
    v_total := v_total + v_amount;
    v_awards := v_awards || jsonb_build_array(
      jsonb_build_object(
        'student_id',  v_id,
        'stars',       to_jsonb(v_stars),
        'total',       v_total,
        'dragonballs', v_map
      )
    );
  end loop;

  if v_count = 0 then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'granted',    v_count,
    'amount',     v_amount,
    'mode',       v_mode,
    'last_total', v_total,
    'stars',      to_jsonb(v_last),
    'awards',     v_awards
  );
end;
$$;

grant execute on function public.student_profile(uuid) to anon, authenticated;
grant execute on function public.student_dragonballs(uuid) to anon, authenticated;
grant execute on function public.live_study_board(uuid) to anon, authenticated;
grant execute on function public.grant_dragonballs(uuid[], integer, text, text) to anon, authenticated;
