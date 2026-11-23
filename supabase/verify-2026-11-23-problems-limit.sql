-- =====================================================================
-- 선오공 · 문제 수 0~999 상한 · 학생이 오늘 학원 공부 문제 수 수정 검증 (2026-11-23)
--
--   · student_update_today_academy_problems — 오늘 학원 공부 문제 수만 0~999 로 수정
--       · 합계 problems = 학원 + 숙제 로 다시 계산, 숙제 문제 수는 그대로
--       · 어제 기록은 그대로 (오늘 KST 한 줄만 바뀐다)
--       · 999 는 되고 1000·-1·null 은 problems_out_of_range
--       · 오늘 학원 공부가 없으면 no_academy_today, 오늘 기록이 없으면 log_not_found
--   · 학생 입력 경로의 999 초과 거부 — finish_session · set_session_problems ·
--     submit_homework · close_homework_session
--   · 숙제 초안(save_homework_draft)은 999 로 다듬기만 한다 (사진 올리기가 막히지 않게)
--   · 검증용 학생·세션·제출·기록은 끝나고 지운다 (실패하면 통째로 되돌아간다)
--
--  Supabase SQL Editor 에 그대로 붙여 넣어 실행하거나,
--  Management API 로 실행합니다.
-- =====================================================================

do $$
declare
  v_id      uuid;
  v_hw_id   uuid;
  v_sess    uuid;
  v_sub     uuid;
  v_res     jsonb;
  v_log     public.study_logs;
  v_row     public.homework_submissions;
  v_today   date := public.kst_today();
  v_count   integer;
  v_pending boolean;
  v_status  text;
begin
  /* 검증용 학생 두 명 — (가) 오늘 학원+숙제 기록, (나) 오늘 숙제만 */
  insert into public.students (name, code, grade)
  values ('검증문제상한', lpad((floor(random() * 9000) + 1000)::int::text, 4, '0'), '검증')
  returning id into v_id;

  insert into public.students (name, code, grade)
  values ('검증문제상한숙제', lpad((floor(random() * 9000) + 1000)::int::text, 4, '0'), '검증')
  returning id into v_hw_id;

  /* 오늘 기록: 학원 30분·10문제, 숙제 20분·5문제 → 합계 50분·15문제 */
  insert into public.study_logs (
    student_id, date, minutes, problems, academy_minutes, academy_problems, homework_minutes, homework_problems
  ) values (v_id, v_today, 50, 15, 30, 10, 20, 5);

  /* 어제 기록: 학원 40분·8문제 (오늘 수정에 영향이 없어야 한다) */
  insert into public.study_logs (
    student_id, date, minutes, problems, academy_minutes, academy_problems, homework_minutes, homework_problems
  ) values (v_id, v_today - 1, 40, 8, 40, 8, 0, 0);

  /* (나) 오늘 숙제만 한 기록 */
  insert into public.study_logs (
    student_id, date, minutes, problems, academy_minutes, academy_problems, homework_minutes, homework_problems
  ) values (v_hw_id, v_today, 20, 7, 0, 0, 20, 7);

  /* ── 1) 12문제로 수정 — 학원만 바뀌고 숙제·시간은 그대로 ─────────── */
  v_res := public.student_update_today_academy_problems(v_id, 12);
  select * into v_log from public.study_logs where student_id = v_id and date = v_today;
  if v_log.academy_problems <> 12 or v_log.problems <> 17 then
    raise exception 'verify_failed: 수정 결과가 틀림 (학원 %, 합계 %)', v_log.academy_problems, v_log.problems;
  end if;
  if v_log.homework_problems <> 5 or v_log.academy_minutes <> 30 or v_log.minutes <> 50 then
    raise exception 'verify_failed: 숙제·시간이 바뀜 (% · % · %)', v_log.homework_problems, v_log.academy_minutes, v_log.minutes;
  end if;
  if (v_res->>'academy_problems')::int <> 12 or (v_res->>'homework_problems')::int <> 5 or (v_res->>'problems')::int <> 17 then
    raise exception 'verify_failed: 돌려준 결과가 틀림 (%)', v_res;
  end if;

  select * into v_log from public.study_logs where student_id = v_id and date = v_today - 1;
  if v_log.academy_problems <> 8 or v_log.problems <> 8 then
    raise exception 'verify_failed: 어제 기록이 바뀜 (%)', v_log.academy_problems;
  end if;

  /* ── 2) 0 · 999 는 되고 1000·-1·null 은 거부 ─────────────────────── */
  v_res := public.student_update_today_academy_problems(v_id, 0);
  select * into v_log from public.study_logs where student_id = v_id and date = v_today;
  if v_log.academy_problems <> 0 or v_log.problems <> 5 then
    raise exception 'verify_failed: 0문제로 수정이 안 됨 (%)', v_log.problems;
  end if;

  v_res := public.student_update_today_academy_problems(v_id, 999);
  select * into v_log from public.study_logs where student_id = v_id and date = v_today;
  if v_log.academy_problems <> 999 or v_log.problems <> 1004 then
    raise exception 'verify_failed: 999문제로 수정이 안 됨 (%)', v_log.problems;
  end if;

  begin
    v_res := public.student_update_today_academy_problems(v_id, 1000);
    raise exception 'verify_failed: 1000문제가 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%problems_out_of_range%' then raise; end if;
  end;

  begin
    v_res := public.student_update_today_academy_problems(v_id, -1);
    raise exception 'verify_failed: -1문제가 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%problems_out_of_range%' then raise; end if;
  end;

  begin
    v_res := public.student_update_today_academy_problems(v_id, null);
    raise exception 'verify_failed: null 이 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%problems_out_of_range%' then raise; end if;
  end;

  select * into v_log from public.study_logs where student_id = v_id and date = v_today;
  if v_log.academy_problems <> 999 or v_log.problems <> 1004 then
    raise exception 'verify_failed: 거부 뒤에 값이 바뀜 (%)', v_log.academy_problems;
  end if;

  /* ── 3) 오늘 학원 공부가 없으면 no_academy_today ──────────────────── */
  begin
    v_res := public.student_update_today_academy_problems(v_hw_id, 3);
    raise exception 'verify_failed: 숙제만 한 날의 학원 문제 수정이 통과함';
  exception when sqlstate 'P0002' then
    if sqlerrm not like '%no_academy_today%' then raise; end if;
  end;

  select * into v_log from public.study_logs where student_id = v_hw_id and date = v_today;
  if v_log.academy_problems <> 0 or v_log.problems <> 7 then
    raise exception 'verify_failed: 숙제 기록이 바뀜 (%)', v_log.problems;
  end if;

  /* ── 4) 오늘 기록이 없으면 log_not_found (어제 기록만 있는 학생) ───── */
  delete from public.study_logs where student_id = v_hw_id and date = v_today;
  begin
    v_res := public.student_update_today_academy_problems(v_hw_id, 3);
    raise exception 'verify_failed: 오늘 기록 없이 통과함';
  exception when sqlstate 'P0002' then
    if sqlerrm not like '%log_not_found%' then raise; end if;
  end;

  /* 없는 학생 */
  begin
    v_res := public.student_update_today_academy_problems(gen_random_uuid(), 3);
    raise exception 'verify_failed: 없는 학생이 통과함';
  exception when sqlstate 'P0002' then
    if sqlerrm not like '%student_not_found%' then raise; end if;
  end;

  /* ── 5) finish_session — 1000 은 거부, 999 는 통과 ───────────────── */
  insert into public.study_sessions (student_id, status, kind, started_at, last_heartbeat_at, date)
  values (v_id, 'running', 'academy', now() - interval '25 minutes', now(), v_today)
  returning id into v_sess;

  begin
    v_res := public.finish_session(v_sess, 1000);
    raise exception 'verify_failed: finish_session 1000 이 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%problems_out_of_range%' then raise; end if;
  end;

  select status into v_status from public.study_sessions where id = v_sess;
  if v_status <> 'running' then
    raise exception 'verify_failed: 거부됐는데 세션이 끝남 (%)', v_status;
  end if;

  v_res := public.finish_session(v_sess, 999);
  select * into v_log from public.study_logs where student_id = v_id and date = v_today;
  if v_log.academy_problems <> 1998 or v_log.problems <> 2003 then
    raise exception 'verify_failed: finish_session 999 반영이 틀림 (학원 %, 합계 %)', v_log.academy_problems, v_log.problems;
  end if;

  /* ── 6) set_session_problems — 1000 거부, 7 통과 ─────────────────── */
  insert into public.study_sessions (student_id, status, kind, started_at, ended_at, last_heartbeat_at, date, minutes, problems, problems_pending)
  values (v_id, 'finished', 'academy', now() - interval '2 hours', now() - interval '1 hour', now(), v_today, 30, 0, true)
  returning id into v_sess;

  begin
    v_res := public.set_session_problems(v_sess, 1000);
    raise exception 'verify_failed: set_session_problems 1000 이 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%problems_out_of_range%' then raise; end if;
  end;

  select problems_pending into v_pending from public.study_sessions where id = v_sess;
  if not v_pending then
    raise exception 'verify_failed: 거부됐는데 대기 표시가 지워짐';
  end if;

  v_res := public.set_session_problems(v_sess, 7);
  select * into v_log from public.study_logs where student_id = v_id and date = v_today;
  if v_log.academy_problems <> 2005 or v_log.problems <> 2010 then
    raise exception 'verify_failed: set_session_problems 7 반영이 틀림 (학원 %, 합계 %)', v_log.academy_problems, v_log.problems;
  end if;

  /* ── 7) submit_homework — 숙제 문제 수 1000 거부, 5 통과 ──────────── */
  insert into public.study_sessions (student_id, status, kind, started_at, last_heartbeat_at, date)
  values (v_id, 'paused', 'homework', now() - interval '40 minutes', now(), v_today)
  returning id into v_sess;

  begin
    v_res := public.submit_homework(v_sess, 1000, '{}'::text[]);
    raise exception 'verify_failed: submit_homework 1000 이 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%problems_out_of_range%' then raise; end if;
  end;

  select count(*) into v_count from public.homework_submissions where session_id = v_sess;
  if v_count <> 0 then
    raise exception 'verify_failed: 거부됐는데 제출 줄이 생김 (%)', v_count;
  end if;

  /* 초안은 999 로 다듬기만 한다 (사진 올리기가 막히지 않게) */
  v_res := public.save_homework_draft(p_session_id => v_sess, p_problems => 5000, p_photo_paths => '{}'::text[]);
  if (v_res->>'problems')::int <> 999 then
    raise exception 'verify_failed: 초안 문제 수가 999 로 다듬어지지 않음 (%)', v_res->>'problems';
  end if;

  v_res := public.submit_homework(v_sess, 5, '{}'::text[]);
  if coalesce((v_res->>'pending_approval')::boolean, false) is not true then
    raise exception 'verify_failed: 숙제 제출이 승인 대기가 아님 (%)', v_res;
  end if;

  select * into v_row from public.homework_submissions where session_id = v_sess;
  if v_row.submitted_problems <> 5 then
    raise exception 'verify_failed: 숙제 제출 문제 수가 틀림 (%)', v_row.submitted_problems;
  end if;

  /* 승인 대기 숙제는 기록에 아직 안 들어간다 (학원 문제 수만 그대로) */
  select * into v_log from public.study_logs where student_id = v_id and date = v_today;
  if v_log.academy_problems <> 2005 or v_log.homework_problems <> 5 then
    raise exception 'verify_failed: 숙제 승인 전인데 기록이 바뀜 (학원 %, 숙제 %)', v_log.academy_problems, v_log.homework_problems;
  end if;

  /* ── 8) 예전 호출 모양(인자 하나)도 그대로 동작 ───────────────────── */
  v_res := public.finish_session(v_sess);
  if v_res is null then
    raise exception 'verify_failed: 예전 모양 finish_session 이 빈 결과';
  end if;

  raise notice '문제 수 0~999 상한 · 오늘 학원 문제 수 수정 검증 통과 — 학원만 수정·합계 재계산·어제 그대로·999 통과/1000 거부·학원 없는 날 거부·기록 없는 날 거부·finish_session/set_session_problems/submit_homework 거부·초안 다듬기·예전 호출 호환';

  /* 정리 (실패하면 이 블록 전체가 되돌아가므로 여기까지 왔을 때만 지운다) */
  delete from public.study_logs where student_id in (v_id, v_hw_id);
  delete from public.homework_submissions where student_id in (v_id, v_hw_id);
  delete from public.study_sessions where student_id in (v_id, v_hw_id);
  delete from public.students where id in (v_id, v_hw_id);
end;
$$;

-- 남은 검증 데이터가 없어야 한다
select count(*) as left_verify_students from public.students where grade = '검증';
