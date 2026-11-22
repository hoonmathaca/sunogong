-- =====================================================================
-- 선오공 — 사탕교환권: 쓸 성구 2개를 학생이 직접 고르기 (2026-11-22)
--
--   지금까지: '사탕교환권' 을 누르면 서버가 가장 많이 가진 성구부터 2개를 차감.
--   이제:     학생이 고른 성구 2개(p_stars)를 그대로 차감한다.
--             같은 성구 2개(예: 3성구 2개)도 되고, 서로 다른 성구 2개도 된다.
--
--   · p_stars 를 주지 않으면(예전 화면이 남아 있을 때) 여전히 가장 많이 가진
--     성구부터 2개를 차감한다.
--   · 검사
--       - invalid_stars        (22023) : 2개가 아니거나 1~7성구가 아님
--       - dragonballs_shortage (22023) : 그 성구를 그만큼 가지고 있지 않음
--   · 같은 학생이 동시에 두 번 눌러도 한 번만 처리되도록 students 행을 잠근다(for update).
--
--   Supabase SQL Editor 에 그대로 붙여 넣어 실행하면 됩니다. (여러 번 실행해도 안전)
--
--   확인용 (주석을 풀어 실행):
--     select name, dragonball_count, dragonballs, candy_tickets
--       from public.students order by name;
-- =====================================================================

-- 예전 1개짜리 함수가 남아 있으면 '어느 함수를 부를지' 헷갈리므로 지운다.
-- (새 함수는 p_stars 기본값이 있어서 예전처럼 p_student_id 만 넘겨도 동작한다)
drop function if exists public.exchange_candy_ticket(uuid);

create or replace function public.exchange_candy_ticket(p_student_id uuid, p_stars integer[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    public.students;
  v_map    jsonb;
  v_total  integer;
  v_pick   integer[] := '{}'::integer[];
  v_star   integer;
  v_have   integer;
  step     integer;
begin
  select * into v_row from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  v_map   := coalesce(v_row.dragonballs, '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb);
  v_total := coalesce(v_row.dragonball_count, 0);

  if p_stars is null then
    /* 예전 화면 — 가장 많이 가진 성구부터 (같으면 낮은 성구) */
    if v_total < 2 then
      raise exception 'dragonballs_shortage' using errcode = '22023';
    end if;

    for step in 1 .. 2 loop
      select t.star into v_star
        from generate_series(1, 7) as t(star)
       where coalesce((v_map ->> t.star::text)::int, 0) > 0
       order by coalesce((v_map ->> t.star::text)::int, 0) desc, t.star asc
       limit 1;

      if v_star is null then
        raise exception 'dragonballs_shortage' using errcode = '22023';
      end if;

      v_pick := v_pick || v_star;
      v_map  := jsonb_set(
        v_map,
        array[v_star::text],
        to_jsonb(coalesce((v_map ->> v_star::text)::int, 0) - 1)
      );
    end loop;
  else
    /* 학생이 고른 성구 — 정확히 2개, 1~7성구, 가진 만큼만 */
    if coalesce(array_length(p_stars, 1), 0) <> 2 then
      raise exception 'invalid_stars' using errcode = '22023';
    end if;

    foreach v_star in array p_stars loop
      if v_star is null or v_star < 1 or v_star > 7 then
        raise exception 'invalid_stars' using errcode = '22023';
      end if;

      v_have := coalesce((v_map ->> v_star::text)::int, 0);
      if v_have < 1 then
        raise exception 'dragonballs_shortage' using errcode = '22023';
      end if;

      v_pick := v_pick || v_star;
      v_map  := jsonb_set(v_map, array[v_star::text], to_jsonb(v_have - 1));
    end loop;
  end if;

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

comment on function public.exchange_candy_ticket(uuid, integer[]) is
  '성구 2개 → 사탕교환권 1장. p_stars 로 쓸 성구를 직접 지정(같은 성구 2개 허용), 없으면 가장 많은 성구부터';

grant execute on function public.exchange_candy_ticket(uuid, integer[]) to anon, authenticated;

-- 앱(PostgREST)이 새 함수 모양을 바로 알게 한다
notify pgrst, 'reload schema';
