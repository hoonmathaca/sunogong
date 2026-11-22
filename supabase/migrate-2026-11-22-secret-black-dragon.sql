-- =====================================================================
-- 선오공 · 히든 검은용 · 시크릿쿠폰 (2026-11-22)
--
--  · students.black_dragon_count : 검은용 마리 수 (화면에는 가진 학생에게만 보인다)
--  · students.secret_tickets     : 시크릿쿠폰 장 수
--  · roll_black_dragon()         : 일반용·무지개용이 나타날 때 1/10,000 로 검은용이 함께 나온다
--                                  (보너스라서 원래 나온 용은 그대로 남는다)
--  · exchange_secret_ticket()    : 검은용 1마리 → 시크릿쿠폰 1장
--  · use_ticket('secret')        : 관리자가 실제로 지급한 시크릿쿠폰 사용 처리
--
--  ※ 확률·존재는 학생 화면 어디에도 적지 않는다. 검은용을 가진 학생에게만 보인다.
--
--  Supabase SQL Editor 에 그대로 붙여 넣어 실행하면 됩니다. (여러 번 실행해도 안전)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. students — 검은용 · 시크릿쿠폰
-- ---------------------------------------------------------------------
alter table public.students add column if not exists black_dragon_count integer not null default 0;
alter table public.students add column if not exists secret_tickets     integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'students_black_dragon_count_check') then
    alter table public.students
      add constraint students_black_dragon_count_check check (black_dragon_count >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'students_secret_tickets_check') then
    alter table public.students
      add constraint students_secret_tickets_check check (secret_tickets >= 0);
  end if;
end $$;

comment on column public.students.black_dragon_count is '히든 검은용 마리 수 (가진 학생에게만 화면에 보인다)';
comment on column public.students.secret_tickets is '검은용 1마리를 바꾼 시크릿쿠폰 장 수';

-- ticket_uses 의 교환권 종류에 secret 추가
alter table public.ticket_uses drop constraint if exists ticket_uses_ticket_check;
alter table public.ticket_uses
  add constraint ticket_uses_ticket_check
  check (ticket in ('candy', 'point1000', 'point10000', 'secret'));

-- ---------------------------------------------------------------------
-- 2. 검은용이 함께 나올지 — 1/10,000 (보너스)
--    · 앱(anon)에는 실행 권한을 주지 않는다 (함수 안에서만 쓴다)
--    · 검증할 때는 set_config('sunogong.force_black','on'/'off',true) 로 결과를 고정한다
-- ---------------------------------------------------------------------
create or replace function public.roll_black_dragon()
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_force text := coalesce(current_setting('sunogong.force_black', true), '');
begin
  if v_force = 'on' then
    return true;
  end if;
  if v_force = 'off' then
    return false;
  end if;
  return random() < 0.0001;
end;
$$;

revoke execute on function public.roll_black_dragon() from public;
revoke execute on function public.roll_black_dragon() from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. 일반용 뽑기 — 원래 나온 용은 그대로, 가끔 검은용이 함께
-- ---------------------------------------------------------------------
create or replace function public.craft_color_dragon(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.students;
  v_colors  text[] := array['red', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple'];
  v_map     jsonb;
  v_dragons jsonb;
  v_total   integer;
  v_need    integer := 0;
  v_color   text;
  v_black   boolean := false;
  v_blacks  integer;
  star      integer;
begin
  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_map     := coalesce(v_row.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb);
  v_total   := coalesce(v_row.dragonball_count, 0);
  v_dragons := coalesce(v_row.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb);
  v_blacks  := coalesce(v_row.black_dragon_count, 0);

  for star in 1 .. 7 loop
    if coalesce((v_map ->> star::text)::int, 0) < 1 then
      v_need := v_need + 1;
    end if;
  end loop;

  if v_need > 0 then
    raise exception 'dragonballs_incomplete' using errcode = '22023';
  end if;

  v_color := v_colors[1 + floor(random() * 7)::int];
  v_black := public.roll_black_dragon();

  for star in 1 .. 7 loop
    v_map := jsonb_set(
      v_map,
      array[star::text],
      to_jsonb(greatest(0, coalesce((v_map ->> star::text)::int, 0) - 1))
    );
  end loop;

  v_dragons := jsonb_set(
    v_dragons,
    array[v_color],
    to_jsonb(coalesce((v_dragons ->> v_color)::int, 0) + 1)
  );
  v_total := greatest(0, v_total - 7);

  update public.students
     set dragonballs         = v_map,
         dragonball_count    = v_total,
         dragons             = v_dragons,
         black_dragon_count  = v_blacks + case when v_black then 1 else 0 end
   where id = p_student_id;

  return jsonb_build_object(
    'crafted',              true,
    'color',                v_color,
    'dragons',              v_dragons,
    'dragon_total',         (select coalesce(sum(value::int), 0) from jsonb_each_text(v_dragons)),
    'rainbow_dragon_count', coalesce(v_row.rainbow_dragon_count, 0),
    'rainbow_dragon_ready', not exists (
                              select 1 from jsonb_each_text(v_dragons) as e(key, value)
                               where e.value::int < 1
                            ),
    'bonus_black',          v_black,
    'black_dragon_count',   v_blacks + case when v_black then 1 else 0 end,
    'dragonballs',          v_map,
    'total',                v_total,
    'collected',            (select count(*) from jsonb_each_text(v_map) as e(key, value)
                               where e.value::int > 0)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. 무지개용 — 원래 만들어지는 무지개용은 그대로, 가끔 검은용이 함께
-- ---------------------------------------------------------------------
create or replace function public.craft_rainbow_dragon(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.students;
  v_colors  text[] := array['red', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple'];
  v_dragons jsonb;
  v_need    integer := 0;
  v_color   text;
  v_black   boolean := false;
  v_blacks  integer;
begin
  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_dragons := coalesce(v_row.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb);
  v_blacks  := coalesce(v_row.black_dragon_count, 0);

  foreach v_color in array v_colors loop
    if coalesce((v_dragons ->> v_color)::int, 0) < 1 then
      v_need := v_need + 1;
    end if;
  end loop;

  if v_need > 0 then
    raise exception 'dragons_incomplete' using errcode = '22023';
  end if;

  foreach v_color in array v_colors loop
    v_dragons := jsonb_set(
      v_dragons,
      array[v_color],
      to_jsonb(greatest(0, coalesce((v_dragons ->> v_color)::int, 0) - 1))
    );
  end loop;

  v_black := public.roll_black_dragon();

  update public.students
     set dragons               = v_dragons,
         rainbow_dragon_count  = coalesce(rainbow_dragon_count, 0) + 1,
         black_dragon_count    = v_blacks + case when v_black then 1 else 0 end
   where id = p_student_id;

  return jsonb_build_object(
    'crafted',              true,
    'rainbow_dragon_count', coalesce(v_row.rainbow_dragon_count, 0) + 1,
    'dragons',              v_dragons,
    'dragon_total',         (select coalesce(sum(value::int), 0) from jsonb_each_text(v_dragons)),
    'rainbow_dragon_ready', false,
    'bonus_black',          v_black,
    'black_dragon_count',   v_blacks + case when v_black then 1 else 0 end
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. 검은용 1마리 → 시크릿쿠폰 1장
-- ---------------------------------------------------------------------
create or replace function public.exchange_secret_ticket(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.students;
begin
  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;
  if coalesce(v_row.black_dragon_count, 0) < 1 then
    raise exception 'black_dragon_shortage' using errcode = '22023';
  end if;

  update public.students
     set black_dragon_count = black_dragon_count - 1,
         secret_tickets     = coalesce(secret_tickets, 0) + 1
   where id = p_student_id;

  return jsonb_build_object(
    'exchanged',          true,
    'black_dragon_count', coalesce(v_row.black_dragon_count, 0) - 1,
    'secret_tickets',     coalesce(v_row.secret_tickets, 0) + 1
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 6. 관리자 — 시크릿쿠폰 사용 처리
-- ---------------------------------------------------------------------
create or replace function public.use_ticket(
  p_student_id uuid,
  p_ticket     text,
  p_amount     integer default 1,
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    public.students;
  v_ticket text := case
                     when p_ticket in ('candy', 'point1000', 'point10000', 'secret') then p_ticket
                     else null
                   end;
  v_amount integer := floor(coalesce(p_amount, 1))::integer;
  v_have   integer;
begin
  if v_ticket is null then
    raise exception 'invalid_ticket' using errcode = '22023';
  end if;
  if v_amount < 1 or v_amount > 50 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_have := case v_ticket
              when 'candy'      then coalesce(v_row.candy_tickets, 0)
              when 'point1000'  then coalesce(v_row.point_1000_tickets, 0)
              when 'point10000' then coalesce(v_row.point_10000_tickets, 0)
              else                   coalesce(v_row.secret_tickets, 0)
            end;

  if v_have < v_amount then
    raise exception 'ticket_shortage' using errcode = '22023';
  end if;

  if v_ticket = 'candy' then
    update public.students set candy_tickets = candy_tickets - v_amount where id = p_student_id;
  elsif v_ticket = 'point1000' then
    update public.students set point_1000_tickets = point_1000_tickets - v_amount where id = p_student_id;
  elsif v_ticket = 'point10000' then
    update public.students set point_10000_tickets = point_10000_tickets - v_amount where id = p_student_id;
  else
    update public.students set secret_tickets = secret_tickets - v_amount where id = p_student_id;
  end if;

  insert into public.ticket_uses (student_id, ticket, amount, note)
  values (p_student_id, v_ticket, v_amount, nullif(btrim(coalesce(p_note, '')), ''));

  select * into v_row from public.students where id = p_student_id;
  return jsonb_build_object(
    'used',                true,
    'student_id',          p_student_id,
    'ticket',              v_ticket,
    'amount',              v_amount,
    'candy_tickets',       coalesce(v_row.candy_tickets, 0),
    'point_1000_tickets',  coalesce(v_row.point_1000_tickets, 0),
    'point_10000_tickets', coalesce(v_row.point_10000_tickets, 0),
    'secret_tickets',      coalesce(v_row.secret_tickets, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 7. 학생 화면이 읽는 값 — 검은용·시크릿쿠폰 (가진 학생만 숫자가 오른다)
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
    'nickname',              v_row.nickname,
    'dragonball_count',      coalesce(v_row.dragonball_count, 0),
    'dragonballs',           coalesce(v_row.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb),
    'dragons',               coalesce(v_row.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb),
    'rainbow_dragon_count',  coalesce(v_row.rainbow_dragon_count, 0),
    'black_dragon_count',    coalesce(v_row.black_dragon_count, 0),
    'candy_tickets',         coalesce(v_row.candy_tickets, 0),
    'point_1000_tickets',    coalesce(v_row.point_1000_tickets, 0),
    'point_10000_tickets',   coalesce(v_row.point_10000_tickets, 0),
    'secret_tickets',        coalesce(v_row.secret_tickets, 0),
    'rainbow_ball_count',    coalesce(v_row.rainbow_ball_count, 0)
  );
end;
$$;

create or replace function public.student_dragonballs(p_student_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with s as (
    select * from public.students where id = p_student_id
  )
  select jsonb_build_object(
           'dragonballs',          coalesce(s.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb),
           'total',                coalesce(s.dragonball_count, 0),
           'collected',            (select count(*) from jsonb_each_text(coalesce(s.dragonballs, '{}'::jsonb)) as e(key, value)
                                      where e.value::int > 0),
           'dragons',              coalesce(s.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb),
           'dragon_total',         (select coalesce(sum(value::int), 0) from jsonb_each_text(
                                      coalesce(s.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb))),
           'rainbow_dragon_count', coalesce(s.rainbow_dragon_count, 0),
           'rainbow_dragon_ready', not exists (
                                     select 1 from jsonb_each_text(
                                       coalesce(s.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb)) as e(key, value)
                                      where e.value::int < 1
                                   ),
           'color_dragon_ready',   not exists (
                                     select 1 from jsonb_each_text(coalesce(s.dragonballs, '{}'::jsonb)) as e(key, value)
                                      where e.value::int < 1
                                   )
                                   and (select count(*) from jsonb_each_text(coalesce(s.dragonballs, '{}'::jsonb))) = 7,
           'candy_ready',          coalesce(s.dragonball_count, 0) >= 2,
           'black_dragon_count',   coalesce(s.black_dragon_count, 0),
           'candy_tickets',        coalesce(s.candy_tickets, 0),
           'point_1000_tickets',   coalesce(s.point_1000_tickets, 0),
           'point_10000_tickets',  coalesce(s.point_10000_tickets, 0),
           'secret_tickets',       coalesce(s.secret_tickets, 0),
           'rainbow_ball_count',   coalesce(s.rainbow_ball_count, 0)
         )
    from s;
$$;

grant execute on function public.exchange_secret_ticket(uuid) to anon, authenticated;
grant execute on function public.use_ticket(uuid, text, integer, text) to anon, authenticated;
grant execute on function public.student_profile(uuid) to anon, authenticated;
grant execute on function public.student_dragonballs(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
