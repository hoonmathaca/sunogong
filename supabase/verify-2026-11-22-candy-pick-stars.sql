-- =====================================================================
-- 선오공 · 사탕교환권 성구 직접 고르기 검증 (2026-11-22)
--
--   · 같은 성구 2개(3성구 2개) · 서로 다른 성구 2개(1성구 + 5성구) 모두 정확히 차감
--   · p_stars 를 주지 않는 예전 호출은 가장 많이 가진 성구부터 2개
--   · 2개가 아니거나 1~7성구가 아니면 invalid_stars
--   · 가진 개수보다 많이 고르면 dragonballs_shortage
--   · 검증용 학생은 끝나고 지운다 (실패해도 지운다)
--
--  Supabase SQL Editor 에 그대로 붙여 넣어 실행하거나,
--  Management API 로 실행합니다. 실패하면 예외가 나고 검증용 학생은 남지 않습니다.
-- =====================================================================

do $$
declare
  v_id   uuid;
  v_res  jsonb;
begin
  /* 검증용 학생 — 1성구 1개 · 3성구 2개 · 5성구 3개 (총 6개) */
  insert into public.students (name, code, grade, dragonballs, dragonball_count)
  values (
    '검증사탕',
    lpad((floor(random() * 9000) + 1000)::int::text, 4, '0'),
    '검증',
    '{"1":1,"2":0,"3":2,"4":0,"5":3,"6":0,"7":0}'::jsonb,
    6
  )
  returning id into v_id;

  /* 1) 잘못된 고르기 — 하나도 차감되지 않아야 한다 */
  begin
    v_res := public.exchange_candy_ticket(v_id, array[5]::int[]);
    raise exception 'verify_failed: 1개만 골랐는데 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%invalid_stars%' then raise; end if;
  end;

  begin
    v_res := public.exchange_candy_ticket(v_id, array[5, 5, 5]::int[]);
    raise exception 'verify_failed: 3개를 골랐는데 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%invalid_stars%' then raise; end if;
  end;

  begin
    v_res := public.exchange_candy_ticket(v_id, array[0, 5]::int[]);
    raise exception 'verify_failed: 0성구가 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%invalid_stars%' then raise; end if;
  end;

  begin
    v_res := public.exchange_candy_ticket(v_id, array[8, 5]::int[]);
    raise exception 'verify_failed: 8성구가 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%invalid_stars%' then raise; end if;
  end;

  begin
    v_res := public.exchange_candy_ticket(v_id, array[null::int, 5]::int[]);
    raise exception 'verify_failed: 빈 성구가 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%invalid_stars%' then raise; end if;
  end;

  begin
    v_res := public.exchange_candy_ticket(v_id, '{}'::int[]);
    raise exception 'verify_failed: 빈 목록이 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%invalid_stars%' then raise; end if;
  end;

  /* 2성구는 0개 가지고 있다 */
  begin
    v_res := public.exchange_candy_ticket(v_id, array[2, 5]::int[]);
    raise exception 'verify_failed: 없는 2성구가 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%dragonballs_shortage%' then raise; end if;
  end;

  /* 3성구는 2개뿐 — 3개를 고르면 거부 */
  begin
    v_res := public.exchange_candy_ticket(v_id, array[3, 3]::int[]);
  exception when others then
    raise exception 'verify_failed: 3성구 2개를 못 바꿈 (%)', sqlerrm;
  end;

  /* 위에서 3성구 2개를 실제로 바꿨으니 상태를 되돌린다 */
  update public.students
     set dragonballs      = '{"1":1,"2":0,"3":2,"4":0,"5":3,"6":0,"7":0}'::jsonb,
         dragonball_count = 6,
         candy_tickets    = 0
   where id = v_id;

  /* 잘못된 요청은 상태를 바꾸지 않는다 */
  begin
    v_res := public.exchange_candy_ticket(v_id, array[3, 3, 3]::int[]);
    raise exception 'verify_failed: 3성구 3개가 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%invalid_stars%' then raise; end if;
  end;

  if (select dragonball_count from public.students where id = v_id) <> 6
     or (select candy_tickets from public.students where id = v_id) <> 0
     or (select dragonballs from public.students where id = v_id) ->> '3' <> '2' then
    raise exception 'verify_failed: 잘못된 요청이 상태를 바꿈';
  end if;

  /* 2) 같은 성구 2개 — 3성구 2개 */
  v_res := public.exchange_candy_ticket(v_id, array[3, 3]::int[]);
  if v_res -> 'used' <> '[3, 3]'::jsonb then
    raise exception 'verify_failed: 같은 성구 2개 used %', v_res -> 'used';
  end if;
  if coalesce((v_res ->> 'total')::int, -1) <> 4
     or coalesce((v_res ->> 'candy_tickets')::int, -1) <> 1
     or (v_res -> 'dragonballs') ->> '3' <> '0'
     or (v_res -> 'dragonballs') ->> '5' <> '3'
     or (v_res -> 'dragonballs') ->> '1' <> '1' then
    raise exception 'verify_failed: 같은 성구 2개 결과 %', v_res;
  end if;

  /* 3) 서로 다른 성구 2개 — 1성구 + 5성구 (고른 차례 그대로 used 에 온다) */
  v_res := public.exchange_candy_ticket(v_id, array[1, 5]::int[]);
  if v_res -> 'used' <> '[1, 5]'::jsonb then
    raise exception 'verify_failed: 서로 다른 성구 used %', v_res -> 'used';
  end if;
  if coalesce((v_res ->> 'total')::int, -1) <> 2
     or coalesce((v_res ->> 'candy_tickets')::int, -1) <> 2
     or (v_res -> 'dragonballs') ->> '1' <> '0'
     or (v_res -> 'dragonballs') ->> '5' <> '2' then
    raise exception 'verify_failed: 서로 다른 성구 결과 %', v_res;
  end if;

  /* 4) 예전 화면(p_stars 없이) — 가장 많이 가진 5성구 2개가 빠진다 */
  v_res := public.exchange_candy_ticket(v_id);
  if v_res -> 'used' <> '[5, 5]'::jsonb then
    raise exception 'verify_failed: 예전 호출 used %', v_res -> 'used';
  end if;
  if coalesce((v_res ->> 'total')::int, -1) <> 0
     or coalesce((v_res ->> 'candy_tickets')::int, -1) <> 3
     or coalesce((v_res ->> 'collected')::int, -1) <> 0 then
    raise exception 'verify_failed: 예전 호출 결과 %', v_res;
  end if;

  /* 5) 다 쓴 뒤에는 고르든 말든 거부 */
  begin
    v_res := public.exchange_candy_ticket(v_id, array[5, 5]::int[]);
    raise exception 'verify_failed: 성구가 없는데 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%dragonballs_shortage%' then raise; end if;
  end;

  begin
    v_res := public.exchange_candy_ticket(v_id);
    raise exception 'verify_failed: 예전 호출이 성구 없이 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%dragonballs_shortage%' then raise; end if;
  end;

  if (select candy_tickets from public.students where id = v_id) <> 3 then
    raise exception 'verify_failed: 실패한 요청이 교환권을 바꿈';
  end if;

  /* 6) 정리 */
  delete from public.students where id = v_id;
  raise notice '사탕교환권 성구 고르기 검증 통과';
exception
  when others then
    delete from public.students where id = v_id;
    raise;
end $$;
