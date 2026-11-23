-- =====================================================================
-- 2026-11-23  지난 날짜 미종료 세션 자동 정리 — 운영 DB 검증
--   Supabase Dashboard > SQL Editor 에 붙여넣고 실행한다(여러 번 실행해도 안전).
--   검증용 학생·세션은 끝나고 지운다. 결과 표의 ok 가 모두 true 여야 한다.
--   (study_sessions 는 학생당 진행 중 세션이 하나뿐이라 검증 학생을 넷 만든다)
-- =====================================================================
create temp table if not exists verify_stale_cleanup (
  no     integer,
  check_name text,
  ok     boolean,
  detail text
);
truncate verify_stale_cleanup;

do $$
declare
  v_today      date := public.kst_today();
  v_yday       date := public.kst_today() - 1;
  v_yday_0     timestamptz := (public.kst_today() - 1)::timestamp at time zone 'Asia/Seoul';
  v_st_settle  uuid;   -- 지난 날 학원 공부(일시정지) → 기록으로 정산
  v_st_discard uuid;   -- 지난 날 학원 공부(일시정지 없음) → 기록 없이 폐기
  v_st_home    uuid;   -- 지난 날 숙제 공부(일시정지) → 승인 대기
  v_st_today   uuid;   -- 오늘 시작한 공부 → 절대 건드리지 않음
  v_ids        uuid[];
  v_s_settle   uuid;
  v_s_discard  uuid;
  v_s_home     uuid;
  v_s_today    uuid;
  v_dry        jsonb;
  v_res        jsonb;
  v_again      jsonb;
  v_maybe      jsonb;
  v_row        record;
  v_sub        record;
  v_log        record;
  v_count      integer;
begin
  insert into public.students (name, code, grade) values ('검증지난정리1', '9911', '검증') returning id into v_st_settle;
  insert into public.students (name, code, grade) values ('검증지난정리2', '9912', '검증') returning id into v_st_discard;
  insert into public.students (name, code, grade) values ('검증지난정리3', '9913', '검증') returning id into v_st_home;
  insert into public.students (name, code, grade) values ('검증지난정리4', '9914', '검증') returning id into v_st_today;
  v_ids := array[v_st_settle, v_st_discard, v_st_home, v_st_today];

  -- (1) 지난 날 학원 공부 — 20:00 시작, 20:25 일시정지
  insert into public.study_sessions
    (student_id, status, kind, started_at, paused_at, last_heartbeat_at, date, paused_seconds)
  values
    (v_st_settle, 'paused', 'academy', v_yday_0 + interval '20 hours', v_yday_0 + interval '20 hours 25 minutes',
     v_yday_0 + interval '20 hours 25 minutes', v_yday, 0)
  returning id into v_s_settle;

  -- (2) 지난 날 학원 공부 — 일시정지 없이 자정을 넘김
  insert into public.study_sessions
    (student_id, status, kind, started_at, last_heartbeat_at, date, paused_seconds)
  values
    (v_st_discard, 'running', 'academy', v_yday_0 + interval '21 hours', v_yday_0 + interval '23 hours 50 minutes', v_yday, 0)
  returning id into v_s_discard;

  -- (3) 지난 날 숙제 공부 — 18:00 시작, 18:30 일시정지
  insert into public.study_sessions
    (student_id, status, kind, started_at, paused_at, last_heartbeat_at, date, paused_seconds)
  values
    (v_st_home, 'paused', 'homework', v_yday_0 + interval '18 hours', v_yday_0 + interval '18 hours 30 minutes',
     v_yday_0 + interval '18 hours 30 minutes', v_yday, 0)
  returning id into v_s_home;

  -- (4) 오늘 시작한 공부 — 그대로 있어야 한다
  insert into public.study_sessions
    (student_id, status, kind, started_at, last_heartbeat_at, date, paused_seconds)
  values
    (v_st_today, 'running', 'academy', now() - interval '10 minutes', now(), v_today, 0)
  returning id into v_s_today;

  -- ── 미리보기(dry run): 아무것도 바꾸지 않는다 ────────────────────────
  v_dry := public.cleanup_stale_study_sessions(true);
  insert into verify_stale_cleanup values (1, '미리보기가 지난 세션 3건을 찾는다', (v_dry ->> 'found')::integer >= 3, v_dry::text);
  select count(*) into v_count from public.study_sessions where id = v_s_settle and status = 'paused';
  insert into verify_stale_cleanup values (2, '미리보기는 세션을 바꾸지 않는다', v_count = 1, 'paused rows=' || v_count);
  select count(*) into v_count from public.study_logs where student_id = v_st_settle and date = v_yday;
  insert into verify_stale_cleanup values (3, '미리보기는 기록을 만들지 않는다', v_count = 0, 'logs=' || v_count);

  -- ── 실제 정리 ──────────────────────────────────────────────────────
  v_res := public.cleanup_stale_study_sessions();

  insert into verify_stale_cleanup values (4, '실제 정리에서 지난 세션 3건 처리',
    (v_res ->> 'found')::integer >= 3 and (v_res ->> 'failed')::integer = 0, v_res::text);

  -- (1) 정산 — 25분이 그 날 학원 기록으로
  select * into v_row from public.study_sessions where id = v_s_settle;
  select * into v_log from public.study_logs where student_id = v_st_settle and date = v_yday;
  insert into verify_stale_cleanup values (5, '일시정지 학원 공부는 기록으로 정산(25분)',
    v_row.status = 'finished' and v_row.minutes = 25 and v_row.paused_at is null and v_log.academy_minutes = 25,
    format('status=%s minutes=%s academy_minutes=%s', v_row.status, v_row.minutes, v_log.academy_minutes));

  -- (2) 폐기 — 세션 줄이 사라진다
  select count(*) into v_count from public.study_sessions where id = v_s_discard;
  insert into verify_stale_cleanup values (6, '일시정지 없이 자정 넘긴 공부는 기록 없이 폐기', v_count = 0, 'rows=' || v_count);

  -- (3) 숙제 승인 대기 — 30분, 문제 수 0
  select * into v_row from public.study_sessions where id = v_s_home;
  select * into v_sub from public.homework_submissions where session_id = v_s_home;
  insert into verify_stale_cleanup values (7, '지난 숙제 공부는 승인 대기 제출로(30분)',
    v_row.status = 'finished' and v_sub.id is not null and v_sub.status = 'pending'
      and v_sub.submitted_minutes = 30 and v_sub.submitted_problems = 0,
    format('status=%s pending=%s minutes=%s problems=%s', v_row.status, v_sub.status, v_sub.submitted_minutes, v_sub.submitted_problems));

  -- (4) 오늘 세션은 그대로
  select * into v_row from public.study_sessions where id = v_s_today;
  insert into verify_stale_cleanup values (8, '오늘 시작한 세션은 건드리지 않는다', v_row.status = 'running' and v_row.ended_at is null, 'status=' || v_row.status);

  -- 두 번 불러도 안전 (이미 끝난 세션은 대상이 아니다)
  v_again := public.cleanup_stale_study_sessions();
  insert into verify_stale_cleanup values (9, '두 번째 정리는 0건', (v_again ->> 'found')::integer = 0, v_again::text);

  -- 안전장치 — 지난 세션이 없으면 아무것도 하지 않는다(null)
  v_maybe := public.maybe_cleanup_stale_study_sessions();
  insert into verify_stale_cleanup values (10, '지난 세션이 없으면 안전장치는 null', v_maybe is null, coalesce(v_maybe::text, 'null'));

  -- ── 검증 데이터 삭제 ────────────────────────────────────────────────
  delete from public.homework_submissions where student_id = any(v_ids);
  delete from public.study_logs where student_id = any(v_ids);
  delete from public.study_sessions where student_id = any(v_ids);
  delete from public.students where id = any(v_ids);

  select count(*) into v_count from public.study_sessions where student_id = any(v_ids);
  insert into verify_stale_cleanup values (11, '검증 데이터 정리', v_count = 0, 'left=' || v_count);
exception when others then
  insert into verify_stale_cleanup values (900, '예외', false, sqlerrm);
  -- 예외가 나도 검증용 학생·세션은 지운다
  begin
    delete from public.homework_submissions where student_id = any(v_ids);
    delete from public.study_logs where student_id = any(v_ids);
    delete from public.study_sessions where student_id = any(v_ids);
    delete from public.students where id = any(v_ids);
  exception when others then null;
  end;
end
$$;

select no, check_name, ok, detail from verify_stale_cleanup order by no;
