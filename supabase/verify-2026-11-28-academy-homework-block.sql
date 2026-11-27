-- =====================================================================
--  선오공 — 학원 등원 중 숙제 시작 차단 · 0분 대기 가드 검증 (2026-11-28)
--  Supabase Dashboard > SQL Editor 에 붙여 넣고 실행하세요.
--  · migrate-2026-11-28-academy-homework-block.sql 을 먼저 실행해야 합니다.
--  · 검증용 학생(ZZ검증등원)을 만들었다가 마지막에 지웁니다. 실제 학생 데이터는 건드리지 않습니다.
--  · 결과 표에서 ok = true 인 줄만 정상입니다.
-- =====================================================================

create temp table if not exists _verify_aHW (test text, ok boolean, detail text) on commit drop;
truncate _verify_aHW;
grant all on _verify_aHW to anon, authenticated;

do $$
declare
  v_stu   uuid;
  v_att   uuid;
  v_acad  uuid;
  v_hw    uuid;
  v_res   public.study_sessions;
  v_json  jsonb;
  v_row   public.study_sessions;
  v_rows  public.study_sessions[];
  v_msg   text;
  v_count integer;
begin
  insert into public.students (name, code, grade) values ('ZZ검증등원', '0002', '중1') returning id into v_stu;

  -- 훈출이 등원으로 연 학원 세션(진행 중)
  insert into public.attendance_sessions (student_id, seat_id, check_in_at, check_in_by, session_date)
  values (v_stu, 'Z-9', now() - interval '10 minutes', 'student', public.kst_today())
  returning id into v_att;

  insert into public.study_sessions (student_id, kind, status, started_at, last_heartbeat_at, date, attendance_id)
  values (v_stu, 'academy', 'running', now() - interval '10 minutes', now(), public.kst_today(), v_att)
  returning id into v_acad;

  ------------------------------------------------------------------
  -- T1 학원 등원 중(공부 중) 숙제 시작 → academy_session_active 로 거부
  ------------------------------------------------------------------
  begin
    v_res := public.start_session(v_stu, 'homework');
    insert into _verify_aHW values ('T1 등원 중 숙제 시작 거부', false,
      format('거부되지 않고 세션을 돌려줬습니다 (kind=%s)', v_res.kind));
  exception when others then
    v_msg := sqlerrm;
    insert into _verify_aHW values ('T1 등원 중 숙제 시작 거부', v_msg like '%academy_session_active%', v_msg);
  end;

  -- T1b 앱(anon) 경로로 불러도 같은 코드로 거부된다
  begin
    execute 'set local role anon';
    v_res := public.start_session(v_stu, 'homework');
    execute 'reset role';
    insert into _verify_aHW values ('T1b 등원 중 숙제 시작 거부(anon 경로)', false, '거부되지 않았습니다');
  exception when others then
    execute 'reset role';
    v_msg := sqlerrm;
    insert into _verify_aHW values ('T1b 등원 중 숙제 시작 거부(anon 경로)', v_msg like '%academy_session_active%', v_msg);
  end;

  -- 세션은 하나도 새로 생기지 않았다 (학원 세션 1건 그대로)
  select count(*) into v_count from public.study_sessions where student_id = v_stu;
  insert into _verify_aHW values ('T2 거부 뒤 세션은 그대로 1건', v_count = 1, format('세션 %s건', v_count));

  ------------------------------------------------------------------
  -- T3 학원 세션이 쉬는 중(paused)이어도 숙제 시작은 막는다
  ------------------------------------------------------------------
  update public.study_sessions set status = 'paused', paused_at = now() where id = v_acad;
  begin
    v_res := public.start_session(v_stu, 'homework');
    insert into _verify_aHW values ('T3 등원 중(일시정지) 숙제 시작 거부', false, '거부되지 않았습니다');
  exception when others then
    v_msg := sqlerrm;
    insert into _verify_aHW values ('T3 등원 중(일시정지) 숙제 시작 거부', v_msg like '%academy_session_active%', v_msg);
  end;
  update public.study_sessions set status = 'running', paused_at = null where id = v_acad;

  ------------------------------------------------------------------
  -- T4 p_kind='academy' 는 예전 그대로 — 진행 중 학원 세션을 돌려준다
  ------------------------------------------------------------------
  begin
    v_res := public.start_session(v_stu, 'academy');
    insert into _verify_aHW values ('T4 학원 시작은 그대로(같은 세션 반환)',
      v_res.id = v_acad and v_res.kind = 'academy',
      format('id=%s, kind=%s', v_res.id, v_res.kind));
  exception when others then
    insert into _verify_aHW values ('T4 학원 시작은 그대로(같은 세션 반환)', false, sqlerrm);
  end;

  ------------------------------------------------------------------
  -- T5 훈출 하원 정산으로 학원 세션이 끝나면 숙제 공부를 시작할 수 있다
  ------------------------------------------------------------------
  update public.attendance_sessions
     set check_out_at = now(), check_out_by = 'staff', close_reason = 'normal'
   where id = v_att;
  perform public.settle_academy_session(v_acad, now());
  select * into v_row from public.study_sessions where id = v_acad;

  begin
    v_res := public.start_session(v_stu, 'homework');
    v_hw := v_res.id;
    insert into _verify_aHW values ('T5 하원 뒤 숙제 시작', v_res.kind = 'homework' and v_res.id <> v_acad,
      format('학원 세션 status=%s · 새 세션 kind=%s', v_row.status, v_res.kind));
  exception when others then
    v_hw := null;
    insert into _verify_aHW values ('T5 하원 뒤 숙제 시작', false, sqlerrm);
  end;

  ------------------------------------------------------------------
  -- T6 숙제 세션은 종류와 상관없이 그대로 돌려준다 (예전처럼 두 번 눌러도 하나)
  ------------------------------------------------------------------
  if v_hw is not null then
    v_res := public.start_session(v_stu, 'homework');
    insert into _verify_aHW values ('T6 숙제 두 번 시작 → 같은 세션', v_res.id = v_hw, format('id=%s', v_res.id));
  else
    insert into _verify_aHW values ('T6 숙제 두 번 시작 → 같은 세션', false, 'T5 실패로 건너뜀');
  end if;

  -- T7 숙제 세션이 진행 중일 때 p_kind='academy' 는 예전처럼 그 세션을 돌려준다 (훈출은 attendance_apply 사용)
  begin
    v_res := public.start_session(v_stu, 'academy');
    insert into _verify_aHW values ('T7 숙제 진행 중 학원 시작은 그대로', v_res.id = v_hw, format('id=%s', v_res.id));
  exception when others then
    insert into _verify_aHW values ('T7 숙제 진행 중 학원 시작은 그대로', false, sqlerrm);
  end;

  delete from public.study_sessions where student_id = v_stu;

  ------------------------------------------------------------------
  -- T8 settle_academy_session — 0분 세션은 문제 수 대기를 남기지 않는다
  ------------------------------------------------------------------
  insert into public.attendance_sessions (student_id, seat_id, check_in_at, check_in_by, check_out_at, check_out_by, close_reason, session_date)
  values (v_stu, 'Z-8', now() - interval '10 seconds', 'student', now(), 'staff', 'normal', public.kst_today())
  returning id into v_att;

  insert into public.study_sessions (student_id, kind, status, started_at, last_heartbeat_at, date, attendance_id)
  values (v_stu, 'academy', 'running', now() - interval '10 seconds', now(), public.kst_today(), v_att)
  returning id into v_acad;

  v_json := public.settle_academy_session(v_acad, now());
  select * into v_row from public.study_sessions where id = v_acad;
  select count(*) into v_count from public.pending_problem_sessions(v_stu);
  insert into _verify_aHW values ('T8 0분 정산 → 대기 없음',
    v_row.status = 'finished' and coalesce(v_row.minutes, 0) = 0
      and v_row.problems_pending = false and v_count = 0,
    format('status=%s, minutes=%s, pending=%s, 대기목록=%s건', v_row.status, v_row.minutes, v_row.problems_pending, v_count));

  ------------------------------------------------------------------
  -- T9 settle_academy_session — 1분 이상이면 예전처럼 문제 수를 묻는다
  ------------------------------------------------------------------
  insert into public.attendance_sessions (student_id, seat_id, check_in_at, check_in_by, check_out_at, check_out_by, close_reason, session_date)
  values (v_stu, 'Z-7', now() - interval '5 minutes', 'student', now(), 'staff', 'normal', public.kst_today())
  returning id into v_att;

  insert into public.study_sessions (student_id, kind, status, started_at, last_heartbeat_at, date, attendance_id)
  values (v_stu, 'academy', 'running', now() - interval '5 minutes', now(), public.kst_today(), v_att)
  returning id into v_acad;

  v_json := public.settle_academy_session(v_acad, now());
  select * into v_row from public.study_sessions where id = v_acad;
  select array_agg(p) into v_rows from public.pending_problem_sessions(v_stu) p;
  insert into _verify_aHW values ('T9 5분 정산 → 문제 수 대기',
    v_row.minutes = 5 and v_row.problems_pending = true
      and coalesce(array_length(v_rows, 1), 0) = 1,
    format('minutes=%s, pending=%s, 대기목록=%s건', v_row.minutes, v_row.problems_pending, coalesce(array_length(v_rows, 1), 0)));

  ------------------------------------------------------------------
  -- T10 0분 대기 잔여 행은 전체에서도 0건
  ------------------------------------------------------------------
  select count(*) into v_count from public.study_sessions
   where problems_pending and coalesce(minutes, 0) = 0;
  insert into _verify_aHW values ('T10 0분 유령 대기 0건(전체)', v_count = 0, format('%s건', v_count));

  ------------------------------------------------------------------
  -- 정리 — 검증용 학생과 그 세션·기록·출결
  ------------------------------------------------------------------
  delete from public.study_logs           where student_id = v_stu;
  delete from public.study_sessions       where student_id = v_stu;
  delete from public.attendance_sessions  where student_id = v_stu;
  delete from public.students             where id = v_stu;
end $$;

select test, ok, detail from _verify_aHW order by test;
