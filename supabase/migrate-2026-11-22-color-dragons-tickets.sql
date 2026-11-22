-- =====================================================================
-- 선오공 · 일반용 · 무지개용 · 교환권 (2026-11-22)
--
--  · students.dragons              : 일반용 보유 맵
--                                    {"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}
--  · students.rainbow_dragon_count : 무지개용 마리 수
--  · students.candy_tickets        : 사탕교환권 장 수
--  · students.point_1000_tickets   : 1,000포인트 교환권 장 수
--  · students.point_10000_tickets  : 10,000포인트 교환권 장 수
--  · ticket_uses                   : 관리자가 교환권을 사용 처리한 이력
--
--  바뀌는 규칙 (예전: 1~7성구 하나씩 → 무지개 볼 1개)
--   1) 성구 2개          → 사탕교환권 1장   (exchange_candy_ticket)
--   2) 1~7성구 하나씩    → 일반용 중 랜덤 1마리 (craft_color_dragon)
--   3) 일반용 하나씩 → 무지개용 1마리 (craft_rainbow_dragon)
--   4) 일반용 1마리     → 1,000포인트 교환권 1장 (exchange_point_ticket 'dragon')
--      무지개용 1마리 → 10,000포인트 교환권 1장 (exchange_point_ticket 'rainbow')
--   5) 관리자가 실제로 지급한 뒤 교환권 사용 처리 → use_ticket
--
--  예전 데이터 호환: 이미 만들어 둔 무지개 볼(rainbow_ball_count)은
--  같은 값(성구 7개)을 써서 만든 일반용 1마리로 바꿔 준다.
--  (색은 학생 id 로 정해져서 다시 실행해도 같은 색이 되고, rainbow_ball_count 는 0 이 된다)
--
--  Supabase SQL Editor 에 그대로 붙여 넣어 실행하면 됩니다. (여러 번 실행해도 안전)
--
--  확인용 (주석을 풀어 실행):
--    select name, dragonball_count, dragonballs, dragons, rainbow_dragon_count,
--           candy_tickets, point_1000_tickets, point_10000_tickets
--      from public.students order by name;
--    select * from public.ticket_uses order by created_at desc limit 20;
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. students — 일반용 · 교환권
-- ---------------------------------------------------------------------
alter table public.students
  add column if not exists dragons jsonb not null
  default '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb;

alter table public.students add column if not exists rainbow_dragon_count integer not null default 0;
alter table public.students add column if not exists candy_tickets        integer not null default 0;
alter table public.students add column if not exists point_1000_tickets   integer not null default 0;
alter table public.students add column if not exists point_10000_tickets  integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'students_dragons_check') then
    alter table public.students
      add constraint students_dragons_check
      check (
        jsonb_typeof(dragons) = 'object'
        and dragons ? 'red' and dragons ? 'orange' and dragons ? 'yellow'
        and dragons ? 'green' and dragons ? 'blue' and dragons ? 'navy'
        and dragons ? 'purple'
        and (dragons ->> 'red')::int    >= 0
        and (dragons ->> 'orange')::int >= 0
        and (dragons ->> 'yellow')::int >= 0
        and (dragons ->> 'green')::int  >= 0
        and (dragons ->> 'blue')::int   >= 0
        and (dragons ->> 'navy')::int   >= 0
        and (dragons ->> 'purple')::int >= 0
      );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'students_rainbow_dragon_count_check') then
    alter table public.students
      add constraint students_rainbow_dragon_count_check check (rainbow_dragon_count >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'students_tickets_check') then
    alter table public.students
      add constraint students_tickets_check
      check (candy_tickets >= 0 and point_1000_tickets >= 0 and point_10000_tickets >= 0);
  end if;
end $$;

-- 예전 무지개 볼 → 일반용 1마리 (색은 학생 id 로 정해져 다시 실행해도 그대로)
do $$
declare
  v_colors text[] := array['red', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple'];
  r        record;
  v_map    jsonb;
  v_color  text;
  i        integer;
begin
  for r in
    select s.id,
           coalesce(s.rainbow_ball_count, 0) as rb,
           coalesce(s.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb) as map
      from public.students s
     where coalesce(s.rainbow_ball_count, 0) > 0
  loop
    v_map := r.map;
    for i in 1 .. r.rb loop
      v_color := v_colors[1 + (abs(hashtext(r.id::text || ':' || i::text)) % 7)];
      v_map := jsonb_set(
        v_map,
        array[v_color],
        to_jsonb(coalesce((v_map ->> v_color)::int, 0) + 1)
      );
    end loop;
    update public.students
       set dragons            = v_map,
           rainbow_ball_count = 0
     where id = r.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. ticket_uses — 관리자가 교환권을 사용 처리한 이력
-- ---------------------------------------------------------------------
create table if not exists public.ticket_uses (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete cascade,
  ticket      text not null check (ticket in ('candy', 'point1000', 'point10000')),
  amount      integer not null default 1 check (amount > 0),
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists ticket_uses_created_idx on public.ticket_uses (created_at desc);
create index if not exists ticket_uses_student_idx on public.ticket_uses (student_id, created_at desc);

comment on column public.students.dragons is '일반용 보유 맵 (red·orange·yellow·green·blue·navy·purple)';
comment on column public.students.rainbow_dragon_count is '무지개용 마리 수';
comment on column public.students.candy_tickets is '성구 2개로 바꾼 사탕교환권 장 수 (관리자가 사용 처리)';
comment on column public.students.point_1000_tickets is '일반용 1마리로 바꾼 1,000포인트 교환권 장 수';
comment on column public.students.point_10000_tickets is '무지개용 1마리로 바꾼 10,000포인트 교환권 장 수';

-- ---------------------------------------------------------------------
-- 3. 내 닉네임 · 드래곤볼 · 일반용 · 교환권
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
    'candy_tickets',         coalesce(v_row.candy_tickets, 0),
    'point_1000_tickets',    coalesce(v_row.point_1000_tickets, 0),
    'point_10000_tickets',   coalesce(v_row.point_10000_tickets, 0),
    -- 예전 화면과의 호환용 (지금은 쓰지 않는다)
    'rainbow_ball_count',    coalesce(v_row.rainbow_ball_count, 0)
  );
end;
$$;

-- 내 드래곤볼 도감 — 성구·일반용·교환권과 지금 할 수 있는 것
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
           'candy_tickets',        coalesce(s.candy_tickets, 0),
           'point_1000_tickets',   coalesce(s.point_1000_tickets, 0),
           'point_10000_tickets',  coalesce(s.point_10000_tickets, 0),
           'rainbow_ball_count',   coalesce(s.rainbow_ball_count, 0)
         )
    from s;
$$;

-- ---------------------------------------------------------------------
-- 4. 성구 2개 → 사탕교환권 1장
--    가장 많이 가진 성구부터 차감한다 (같으면 낮은 성구 먼저).
--    반환: {exchanged, used:[성구,성구], candy_tickets, dragonballs, total, collected}
-- ---------------------------------------------------------------------
create or replace function public.exchange_candy_ticket(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    public.students;
  v_map    jsonb;
  v_total  integer;
  v_pick   integer[];
  v_star   integer;
  v_left   integer := 2;
  v_count  integer;
  step     integer;
begin
  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_map   := coalesce(v_row.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb);
  v_total := coalesce(v_row.dragonball_count, 0);
  if v_total < 2 then
    raise exception 'dragonballs_shortage' using errcode = '22023';
  end if;

  v_pick := '{}'::integer[];
  for step in 1 .. 2 loop
    -- 가장 많이 남은 성구 (같으면 낮은 성구)
    select star into v_star
      from generate_series(1, 7) as t(star)
     where coalesce((v_map ->> t.star::text)::int, 0) > 0
     order by coalesce((v_map ->> t.star::text)::int, 0) desc, t.star asc
     limit 1;

    if v_star is null then
      raise exception 'dragonballs_shortage' using errcode = '22023';
    end if;

    v_pick := v_pick || v_star;
    v_map := jsonb_set(
      v_map,
      array[v_star::text],
      to_jsonb(greatest(0, coalesce((v_map ->> v_star::text)::int, 0) - 1))
    );
  end loop;

  v_total := greatest(0, v_total - 2);

  update public.students
     set dragonballs      = v_map,
         dragonball_count = v_total,
         candy_tickets    = coalesce(candy_tickets, 0) + 1
   where id = p_student_id;

  return jsonb_build_object(
    'exchanged',     true,
    'used',          to_jsonb(v_pick),
    'candy_tickets', coalesce(v_row.candy_tickets, 0) + 1,
    'dragonballs',   v_map,
    'total',         v_total,
    'collected',     (select count(*) from jsonb_each_text(v_map) as e(key, value)
                        where e.value::int > 0)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. 1~7성구 하나씩 → 일반용 랜덤 1마리
--    반환: {crafted, color, dragons, dragon_total, rainbow_dragon_count,
--           dragonballs, total, collected, rainbow_dragon_ready}
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
  star      integer;
begin
  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_map     := coalesce(v_row.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb);
  v_total   := coalesce(v_row.dragonball_count, 0);
  v_dragons := coalesce(v_row.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb);

  for star in 1 .. 7 loop
    if coalesce((v_map ->> star::text)::int, 0) < 1 then
      v_need := v_need + 1;
    end if;
  end loop;

  if v_need > 0 then
    raise exception 'dragonballs_incomplete' using errcode = '22023';
  end if;

  v_color := v_colors[1 + floor(random() * 7)::int];

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
     set dragonballs        = v_map,
         dragonball_count   = v_total,
         dragons            = v_dragons
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
    'dragonballs',          v_map,
    'total',                v_total,
    'collected',            (select count(*) from jsonb_each_text(v_map) as e(key, value)
                               where e.value::int > 0)
  );
end;
$$;

-- 예전 이름(craft_rainbow_ball)으로 부르는 화면도 그대로 동작하게 남겨 둔다
create or replace function public.craft_rainbow_ball(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  v := public.craft_color_dragon(p_student_id);
  return v || jsonb_build_object('rainbow_ball_count', 0);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. 일반용 하나씩 → 무지개용 1마리
--    반환: {crafted, rainbow_dragon_count, dragons, dragon_total, rainbow_dragon_ready}
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
begin
  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_dragons := coalesce(v_row.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb);

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

  update public.students
     set dragons               = v_dragons,
         rainbow_dragon_count  = coalesce(rainbow_dragon_count, 0) + 1
   where id = p_student_id;

  return jsonb_build_object(
    'crafted',              true,
    'rainbow_dragon_count', coalesce(v_row.rainbow_dragon_count, 0) + 1,
    'dragons',              v_dragons,
    'dragon_total',         (select coalesce(sum(value::int), 0) from jsonb_each_text(v_dragons)),
    'rainbow_dragon_ready', false
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 7. 일반용 · 무지개용 → 포인트 교환권
--    · p_kind = 'dragon'  : 일반용 1마리 → 1,000포인트 교환권 1장
--                           (가장 많이 모은 색부터, 같으면 색 순서대로)
--    · p_kind = 'rainbow' : 무지개용 1마리 → 10,000포인트 교환권 1장
-- ---------------------------------------------------------------------
create or replace function public.exchange_point_ticket(p_student_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.students;
  v_kind    text := case when p_kind = 'rainbow' then 'rainbow' else 'dragon' end;
  v_colors  text[] := array['red', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple'];
  v_dragons jsonb;
  v_color   text;
  v_rainbow integer;
begin
  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_dragons := coalesce(v_row.dragons, '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb);
  v_rainbow := coalesce(v_row.rainbow_dragon_count, 0);

  if v_kind = 'rainbow' then
    if v_rainbow < 1 then
      raise exception 'rainbow_dragon_shortage' using errcode = '22023';
    end if;
    update public.students
       set rainbow_dragon_count = v_rainbow - 1,
           point_10000_tickets  = coalesce(point_10000_tickets, 0) + 1
     where id = p_student_id;
    return jsonb_build_object(
      'exchanged',            true,
      'kind',                 'rainbow',
      'dragons',              v_dragons,
      'dragon_total',         (select coalesce(sum(value::int), 0) from jsonb_each_text(v_dragons)),
      'rainbow_dragon_count', v_rainbow - 1,
      'point_1000_tickets',   coalesce(v_row.point_1000_tickets, 0),
      'point_10000_tickets',  coalesce(v_row.point_10000_tickets, 0) + 1
    );
  end if;

  if (select coalesce(sum(value::int), 0) from jsonb_each_text(v_dragons)) < 1 then
    raise exception 'dragons_shortage' using errcode = '22023';
  end if;

  select c into v_color
    from unnest(v_colors) with ordinality as t(c, ord)
   where coalesce((v_dragons ->> t.c)::int, 0) > 0
   order by coalesce((v_dragons ->> t.c)::int, 0) desc, t.ord asc
   limit 1;

  v_dragons := jsonb_set(
    v_dragons,
    array[v_color],
    to_jsonb(greatest(0, coalesce((v_dragons ->> v_color)::int, 0) - 1))
  );

  update public.students
     set dragons             = v_dragons,
         point_1000_tickets  = coalesce(point_1000_tickets, 0) + 1
   where id = p_student_id;

  return jsonb_build_object(
    'exchanged',            true,
    'kind',                 'dragon',
    'color',                v_color,
    'dragons',              v_dragons,
    'dragon_total',         (select coalesce(sum(value::int), 0) from jsonb_each_text(v_dragons)),
    'rainbow_dragon_count', v_rainbow,
    'point_1000_tickets',   coalesce(v_row.point_1000_tickets, 0) + 1,
    'point_10000_tickets',  coalesce(v_row.point_10000_tickets, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 8. 관리자 — 실제로 지급한 교환권을 사용 처리(차감)
--    p_ticket: 'candy' | 'point1000' | 'point10000'
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
                     when p_ticket in ('candy', 'point1000', 'point10000') then p_ticket
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
              else                   coalesce(v_row.point_10000_tickets, 0)
            end;

  if v_have < v_amount then
    raise exception 'ticket_shortage' using errcode = '22023';
  end if;

  if v_ticket = 'candy' then
    update public.students set candy_tickets = candy_tickets - v_amount where id = p_student_id;
  elsif v_ticket = 'point1000' then
    update public.students set point_1000_tickets = point_1000_tickets - v_amount where id = p_student_id;
  else
    update public.students set point_10000_tickets = point_10000_tickets - v_amount where id = p_student_id;
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
    'point_10000_tickets', coalesce(v_row.point_10000_tickets, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 9. 근두운 — 친구 줄에 일반용·무지개용도 함께
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
  v_nodragon jsonb := '{"red":0,"orange":0,"yellow":0,"green":0,"blue":0,"navy":0,"purple":0}'::jsonb;
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
-- 10. 권한 · RLS
-- ---------------------------------------------------------------------
alter table public.ticket_uses enable row level security;

drop policy if exists ticket_uses_anon_all on public.ticket_uses;
create policy ticket_uses_anon_all on public.ticket_uses
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.ticket_uses to anon, authenticated;

grant execute on function public.student_profile(uuid) to anon, authenticated;
grant execute on function public.student_dragonballs(uuid) to anon, authenticated;
grant execute on function public.exchange_candy_ticket(uuid) to anon, authenticated;
grant execute on function public.craft_color_dragon(uuid) to anon, authenticated;
grant execute on function public.craft_rainbow_ball(uuid) to anon, authenticated;
grant execute on function public.craft_rainbow_dragon(uuid) to anon, authenticated;
grant execute on function public.exchange_point_ticket(uuid, text) to anon, authenticated;
grant execute on function public.use_ticket(uuid, text, integer, text) to anon, authenticated;
grant execute on function public.live_study_board(uuid) to anon, authenticated;

-- 앱(PostgREST)이 새 표·함수를 바로 알게 한다
notify pgrst, 'reload schema';
