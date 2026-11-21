-- =====================================================================
--  선오공 — 2026-11-21 근두운 · 드래곤볼 SQL 검증
--
--  Supabase Dashboard > SQL Editor 에 붙여넣고 실행하세요.
--  · 검증용 학생 2명·공부 세션·지급 기록을 잠깐 만들었다가 모두 되돌립니다(자동 ROLLBACK).
--  · 통과하면 아무 오류 없이 끝나고, 실패하면 '검증N 실패: …' 오류가 납니다.
--
--  확인하는 것
--   1) 근두운에 닉네임(없으면 '수련생')·상태·시간만 나오고 실명·학생 id 는 나오지 않는다
--   2) 닉네임 바꾸기 (앞뒤 공백 정리, 빈 값은 '수련생'으로)
--   3) 잠깐 쉬는 세션은 'paused' 로 구분된다
--   4) 전체 일괄 지급 — 학생 수만큼 이력이 남고 보유 개수가 늘어난다
--   5) 개별 지급 · student_profile 값
--   6) 잘못된 값(11자 닉네임·대상 없음·0개)은 거부된다
-- =====================================================================

do $verify$
declare
  v_me    uuid;
  v_other uuid;
  v_board jsonb;
  v_row   jsonb;
  v_prof  jsonb;
  v_grant jsonb;
  v_n     integer;
  v_sum   integer;
begin
  begin
    insert into public.students (name, code, grade)
    values ('검증용학생', '9999', '검증') returning id into v_me;
    insert into public.students (name, code, grade)
    values ('검증용둘째', '9998', '검증') returning id into v_other;

    insert into public.study_sessions (student_id, status, kind, started_at, last_heartbeat_at, date)
    values (v_me, 'running', 'academy', now() - interval '10 minutes', now(), public.kst_today());

    insert into public.study_sessions (student_id, status, kind, started_at, paused_at, last_heartbeat_at, date)
    values (
      v_other, 'paused', 'homework',
      now() - interval '3 minutes', now() - interval '1 minute', now() - interval '1 minute',
      public.kst_today()
    );

    -- 1) 닉네임이 없으면 '수련생', 실명·id 는 나오지 않는다
    v_board := public.live_study_board(v_me);

    select value into v_row
      from jsonb_array_elements(v_board -> 'students') as value
     where (value ->> 'is_me')::boolean;

    if v_row is null then
      raise exception '검증1 실패: 내 세션이 근두운에 없음';
    end if;
    if v_row ->> 'nickname' <> '수련생' then
      raise exception '검증1 실패: 기본 닉네임이 % 임', v_row ->> 'nickname';
    end if;
    if jsonb_exists(v_row, 'name') or jsonb_exists(v_row, 'student_id')
       or jsonb_exists(v_row, 'id') or jsonb_exists(v_row, 'grade') then
      raise exception '검증1 실패: 실명·id 가 밖으로 나감 (%)', v_row::text;
    end if;
    if (v_row ->> 'seconds')::integer < 590 then
      raise exception '검증1 실패: 지난 시간이 % 초', v_row ->> 'seconds';
    end if;
    if (v_board ->> 'running_count')::integer <> 1 then
      raise exception '검증1 실패: 공부 중 인원 %', v_board ->> 'running_count';
    end if;

    -- 2) 닉네임 바꾸기 (앞뒤 공백은 지운다)
    v_prof := public.set_student_nickname(v_me, '  검증닉  ');
    if v_prof ->> 'nickname' <> '검증닉' then
      raise exception '검증2 실패: 닉네임 %', v_prof ->> 'nickname';
    end if;

    v_board := public.live_study_board(v_me);
    if not exists (
      select 1 from jsonb_array_elements(v_board -> 'students') value
       where value ->> 'nickname' = '검증닉'
    ) then
      raise exception '검증2 실패: 바꾼 닉네임이 근두운에 없음';
    end if;

    -- 3) 잠깐 쉬는 학생은 'paused' 로 보인다
    if not exists (
      select 1 from jsonb_array_elements(v_board -> 'students') value
       where value ->> 'nickname' = '수련생' and value ->> 'status' = 'paused'
    ) then
      raise exception '검증3 실패: 쉬는 중인 학생이 구분되지 않음';
    end if;

    -- 4) 전체 일괄 지급
    v_grant := public.grant_dragonballs(array[v_me, v_other], 3, 'all', '검증');
    if (v_grant ->> 'granted')::integer <> 2 then
      raise exception '검증4 실패: 지급 인원 %', v_grant ->> 'granted';
    end if;

    select count(*), coalesce(sum(amount), 0) into v_n, v_sum
      from public.dragonball_grants
     where student_id in (v_me, v_other);
    if v_n <> 2 or v_sum <> 6 then
      raise exception '검증4 실패: 이력 %건 %개', v_n, v_sum;
    end if;

    select dragonball_count into v_n from public.students where id = v_me;
    if v_n <> 3 then
      raise exception '검증4 실패: 보유 개수 %', v_n;
    end if;

    -- 5) 개별 지급 · 프로필
    v_grant := public.grant_dragonballs(array[v_me], 2, 'single');
    select dragonball_count into v_n from public.students where id = v_me;
    if v_n <> 5 then
      raise exception '검증5 실패: 보유 개수 %', v_n;
    end if;

    select count(*) into v_n
      from public.dragonball_grants
     where student_id = v_me and mode = 'single';
    if v_n <> 1 then
      raise exception '검증5 실패: 개별 이력 %건', v_n;
    end if;

    v_prof := public.student_profile(v_me);
    if (v_prof ->> 'dragonball_count')::integer <> 5 then
      raise exception '검증5 실패: 프로필 %', v_prof::text;
    end if;

    -- 6) 잘못된 값은 거부된다
    begin
      perform public.set_student_nickname(v_me, repeat('가', 11));
      raise exception '검증6 실패: 11자 닉네임이 저장됨';
    exception when sqlstate '22023' then null;
    end;

    begin
      perform public.grant_dragonballs(array[]::uuid[], 1, 'all');
      raise exception '검증6 실패: 대상 없는 지급이 통과됨';
    exception when sqlstate '22023' then null;
    end;

    begin
      perform public.grant_dragonballs(array[v_me], 0, 'single');
      raise exception '검증6 실패: 0개 지급이 통과됨';
    exception when sqlstate '22023' then null;
    end;

    -- 7) 닉네임을 지우면 다시 '수련생'
    perform public.set_student_nickname(v_me, '   ');
    v_prof := public.student_profile(v_me);
    if v_prof ->> 'nickname' is not null then
      raise exception '검증7 실패: 지운 닉네임이 남음';
    end if;

    -- 모두 통과 — 여기서 예외를 내면 위에서 만든 검증 데이터가 함께 되돌려진다
    raise exception 'VERIFY_OK' using errcode = 'P0001';

  exception
    when others then
      if sqlerrm = 'VERIFY_OK' then
        raise notice '근두운·드래곤볼 검증 통과 (검증 데이터는 되돌렸습니다)';
      else
        raise;
      end if;
  end;
end;
$verify$;
