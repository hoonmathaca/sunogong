-- =====================================================================
-- 선오공 · 히든 검은용 · 시크릿쿠폰 검증 (2026-11-22)
--
--   · 검은용이 나올 확률(1/10,000)을 표본으로 확인
--   · 강제 설정(set_config('sunogong.force_black'))으로 일반용 뽑기에
--     검은용이 '보너스'로 함께 나오는지, 원래 일반용은 그대로 남는지 확인
--   · 검은용 → 시크릿쿠폰 교환 → 관리자 사용 처리까지 확인
--   · 검증용 학생은 끝나고 지운다 (실패해도 지운다)
--
--  Supabase SQL Editor 에 그대로 붙여 넣어 실행하거나,
--  Management API 로 실행합니다. 실패하면 예외가 나고 아무것도 남지 않습니다.
-- =====================================================================

do $$
declare
  v_id      uuid;
  v_hits    integer;
  v_res     jsonb;
  v_student public.students;
begin
  /* 1) 확률 표본 — 40만 번 중 1/10,000 이면 40번 안팎 */
  select count(*) into v_hits
    from generate_series(1, 400000) as g
   where public.roll_black_dragon();
  raise notice '검은용 표본: 400000번 중 %번', v_hits;
  if v_hits < 3 or v_hits > 140 then
    raise exception 'verify_failed: 확률이 너무 다릅니다 (%)', v_hits;
  end if;

  /* 2) 검증용 학생 — 1~7성구 하나씩 */
  insert into public.students (name, code, grade, dragonballs, dragonball_count)
  values (
    '검증검은용',
    lpad((floor(random() * 9000) + 1000)::int::text, 4, '0'),
    '검증',
    '{"1":1,"2":1,"3":1,"4":1,"5":1,"6":1,"7":1}'::jsonb,
    7
  )
  returning id into v_id;

  /* 3) 강제로 검은용이 나오게 — 원래 일반용도 그대로 받아야 한다 */
  perform set_config('sunogong.force_black', 'on', true);
  v_res := public.craft_color_dragon(v_id);
  if not coalesce((v_res ->> 'bonus_black')::boolean, false) then
    raise exception 'verify_failed: 강제 설정에서 검은용이 나오지 않음';
  end if;
  if coalesce((v_res ->> 'black_dragon_count')::int, 0) <> 1 then
    raise exception 'verify_failed: 검은용 마리 수 %', v_res ->> 'black_dragon_count';
  end if;
  if coalesce((v_res ->> 'dragon_total')::int, 0) <> 1 then
    raise exception 'verify_failed: 원래 일반용이 사라짐 (%)', v_res ->> 'dragon_total';
  end if;

  /* 4) 강제 off — 검은용이 나오지 않고 마리 수도 그대로 */
  perform set_config('sunogong.force_black', 'off', true);
  update public.students
     set dragonballs = '{"1":1,"2":1,"3":1,"4":1,"5":1,"6":1,"7":1}'::jsonb,
         dragonball_count = 7
   where id = v_id;

  v_res := public.craft_color_dragon(v_id);
  if coalesce((v_res ->> 'bonus_black')::boolean, true) then
    raise exception 'verify_failed: 강제 off 에서 검은용이 나옴';
  end if;
  if coalesce((v_res ->> 'black_dragon_count')::int, 0) <> 1 then
    raise exception 'verify_failed: 강제 off 뒤 검은용 마리 수 %', v_res ->> 'black_dragon_count';
  end if;

  /* 5) 무지개용 합성에서도 같은 규칙 (원래 무지개용은 그대로) */
  update public.students
     set dragons = '{"red":1,"orange":1,"yellow":1,"green":1,"blue":1,"navy":1,"purple":1}'::jsonb
   where id = v_id;
  perform set_config('sunogong.force_black', 'off', true);
  v_res := public.craft_rainbow_dragon(v_id);
  if coalesce((v_res ->> 'rainbow_dragon_count')::int, 0) <> 1 then
    raise exception 'verify_failed: 무지개용이 만들어지지 않음';
  end if;
  if coalesce((v_res ->> 'black_dragon_count')::int, 0) <> 1 then
    raise exception 'verify_failed: 무지개용 합성에서 검은용 수가 바뀜';
  end if;

  /* 6) 검은용 1마리 → 시크릿쿠폰 1장 → 관리자 사용 처리 */
  v_res := public.exchange_secret_ticket(v_id);
  if coalesce((v_res ->> 'secret_tickets')::int, 0) <> 1
     or coalesce((v_res ->> 'black_dragon_count')::int, -1) <> 0 then
    raise exception 'verify_failed: 시크릿쿠폰 교환 %', v_res;
  end if;

  v_res := public.use_ticket(v_id, 'secret', 1);
  if coalesce((v_res ->> 'secret_tickets')::int, -1) <> 0 then
    raise exception 'verify_failed: 시크릿쿠폰 사용 처리 %', v_res;
  end if;

  if not exists (select 1 from public.ticket_uses where student_id = v_id and ticket = 'secret') then
    raise exception 'verify_failed: 시크릿쿠폰 사용 기록이 없음';
  end if;

  /* 7) 정리 */
  delete from public.students where id = v_id;
  perform set_config('sunogong.force_black', '', true);
  raise notice '검은용·시크릿쿠폰 검증 통과';
exception
  when others then
    delete from public.students where id = v_id;
    perform set_config('sunogong.force_black', '', true);
    raise;
end $$;
