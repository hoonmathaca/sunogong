-- =====================================================================
--  선오공 — 2026-11-21 추가 마이그레이션
--  학생 닉네임 · 근두운(실시간 공부 현황) · 선오공이 드래곤볼 쏘기
--
--  Supabase Dashboard > SQL Editor 에 이 파일을 그대로 붙여넣고 실행하세요.
--  여러 번 실행해도 안전하며, 기존 학생·공부 기록·질문은 건드리지 않습니다.
--
--  · students.nickname          : 실명 대신 보여 줄 별명 (비어 있으면 '수련생')
--  · students.dragonball_count  : 받은 드래곤볼 개수 (제한 없이 누적)
--  · dragonball_grants          : 누가 언제 몇 개를 받았는지 남기는 이력
--  · set_student_nickname()     : 학생이 자기 닉네임을 바꾸는 함수
--  · live_study_board()         : 지금 공부 중인 학생을 '닉네임 + 시간'만으로 보여 주는 함수
--                                 (실명 name 은 절대 내보내지 않는다)
--  · grant_dragonballs()        : 관리자가 공부 중인 학생에게 드래곤볼을 쏘는 함수
--  · student_profile()          : 내 닉네임·드래곤볼 개수
--
--  확인용 (주석을 풀어 실행):
--    select name, nickname, dragonball_count from public.students order by name;
--    select * from public.live_study_board();
--    select * from public.dragonball_grants order by created_at desc limit 20;
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. students — 닉네임 · 드래곤볼 개수
-- ---------------------------------------------------------------------
alter table public.students add column if not exists nickname text;
alter table public.students add column if not exists dragonball_count integer not null default 0;

-- 닉네임: 앞뒤 공백을 뺀 1~10자, 줄바꿈·탭 없음 (비어 있으면 null = '수련생')
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'students_nickname_check') then
    alter table public.students
      add constraint students_nickname_check
      check (
        nickname is null
        or (length(btrim(nickname)) between 1 and 10 and nickname !~ '[\r\n\t]')
      );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'students_dragonball_count_check') then
    alter table public.students
      add constraint students_dragonball_count_check check (dragonball_count >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. 드래곤볼 지급 이력
-- ---------------------------------------------------------------------
create table if not exists public.dragonball_grants (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete cascade,
  amount      integer not null check (amount > 0),           -- 한 학생에게 준 개수
  mode        text not null default 'single' check (mode in ('all', 'single')),
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists dragonball_grants_student_idx
  on public.dragonball_grants (student_id, created_at desc);

create index if not exists dragonball_grants_created_idx
  on public.dragonball_grants (created_at desc);

-- ---------------------------------------------------------------------
-- 3. 학생 닉네임 바꾸기
--    · 빈 값('' 또는 공백)을 보내면 닉네임을 지우고 '수련생' 으로 돌아간다.
-- ---------------------------------------------------------------------
create or replace function public.set_student_nickname(p_student_id uuid, p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick  text := nullif(btrim(coalesce(p_nickname, '')), '');
  v_row   public.students;
begin
  if v_nick is not null then
    if v_nick ~ '[\r\n\t]' then
      raise exception 'nickname_invalid' using errcode = '22023';
    end if;
    if length(v_nick) > 10 then
      raise exception 'nickname_too_long' using errcode = '22023';
    end if;
  end if;

  update public.students
     set nickname = v_nick
   where id = p_student_id
   returning * into v_row;

  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'nickname',         v_row.nickname,
    'dragonball_count', v_row.dragonball_count
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. 내 닉네임 · 드래곤볼 개수
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
    'dragonball_count', coalesce(v_row.dragonball_count, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. 근두운 — 지금 공부 중인 학생 (닉네임 + 진행 시간만)
--    · 실명(name)·학년·학생 id 는 내보내지 않는다.
--    · p_student_id 를 보내면 그 학생 줄에 is_me = true 만 표시한다.
--    · 숙제 공부는 하트비트가 30초 끊기면 일시정지로 본다(reconcile_session 과 같은 규칙).
--    · 5시간(18000초)을 넘긴 세션은 서버가 곧 종료하므로 여기서도 빼고 센다.
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
begin
  -- (1) 숙제 공부: 하트비트가 30초 이상 끊긴 세션은 마지막 신호 시각에 멈춘 것으로 본다
  update public.study_sessions s
     set status           = 'paused',
         paused_at        = s.last_heartbeat_at,
         auto_pause_count = s.auto_pause_count + 1,
         last_pause_auto  = true
   where s.status = 'running'
     and s.kind = 'homework'
     and s.date = public.kst_today()
     and v_now - s.last_heartbeat_at > interval '30 seconds';

  -- (2) 지금(오늘) 진행 중인 세션 → 닉네임 + 시간
  for r in
    select s.student_id,
           s.status,
           s.started_at,
           s.paused_at,
           s.ended_at,
           s.paused_seconds,
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

    -- 5시간을 넘긴 세션은 공부 중으로 세지 않는다
    continue when v_secs >= 18000;

    if r.status = 'running' then
      v_running := v_running + 1;
    end if;

    v_rows := v_rows || jsonb_build_array(
      jsonb_build_object(
        'nickname',   r.nickname,
        'status',     r.status,
        'started_at', r.started_at,
        'seconds',    v_secs,
        'is_me',      (p_student_id is not null and r.student_id = p_student_id)
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
-- 6. 선오공이 드래곤볼 쏘기
--    · p_student_ids : 받을 학생들 (전체 일괄이면 공부 중인 학생 id 를 모두 넘긴다)
--    · p_amount      : 한 학생에게 줄 개수 (1~99)
--    · p_mode        : 'all'(전체 일괄) / 'single'(개별) — 이력에 남는 표시
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
  v_count   integer := 0;
  v_total   integer := 0;
begin
  if v_amount < 1 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if v_amount > 99 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if coalesce(array_length(p_student_ids, 1), 0) = 0 then
    raise exception 'no_students' using errcode = '22023';
  end if;

  for v_id in
    select distinct s.id from public.students s where s.id = any(p_student_ids)
  loop
    update public.students
       set dragonball_count = dragonball_count + v_amount
     where id = v_id
     returning dragonball_count into v_total;

    insert into public.dragonball_grants (student_id, amount, mode, note)
    values (v_id, v_amount, v_mode, v_note);

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'granted',  v_count,
    'amount',   v_amount,
    'mode',     v_mode,
    'last_total', v_total
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 7. 권한 · RLS
--    앱이 익명 키(anon)로 동작하는 지금 방식과 같게 맞춘다.
--    (students / study_sessions 와 같은 정책)
-- ---------------------------------------------------------------------
alter table public.dragonball_grants enable row level security;

drop policy if exists dragonball_grants_anon_all on public.dragonball_grants;
create policy dragonball_grants_anon_all on public.dragonball_grants
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.dragonball_grants to anon, authenticated;

grant execute on function public.set_student_nickname(uuid, text) to anon, authenticated;
grant execute on function public.student_profile(uuid) to anon, authenticated;
grant execute on function public.live_study_board(uuid) to anon, authenticated;
grant execute on function public.grant_dragonballs(uuid[], integer, text, text) to anon, authenticated;

-- 앱(PostgREST)이 새 표·함수를 바로 알게 한다
notify pgrst, 'reload schema';
