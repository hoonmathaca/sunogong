-- =====================================================================
-- 선오공 · 숙제 승인 「선생님 칭찬 한마디」 검증 (2026-11-23)
--
--   · 승인할 때 남긴 한마디가 homework_submissions.teacher_comment 에 그대로 저장
--   · 앞뒤 공백은 지우고, 빈 문자열은 null
--   · 200자를 넘기면 comment_too_long 이고 아무것도 바뀌지 않음
--   · 모두 반려하면 칭찬 한마디는 저장되지 않음 (null)
--   · 예전 화면(4개 인자) 호출도 그대로 동작 (한마디 없음)
--   · 한 번 처리한 제출은 다시 처리할 수 없음(already_reviewed)
--   · 승인된 시간·문항수만 기록에 더해지고 드래곤볼은 그대로
--   · 검증용 학생·세션·제출·기록은 끝나고 지운다 (실패해도 지운다)
--
--  Supabase SQL Editor 에 그대로 붙여 넣어 실행하거나,
--  Management API 로 실행합니다. 실패하면 예외가 나고 검증용 데이터는 남지 않습니다.
-- =====================================================================

do $$
declare
  v_id    uuid;
  v_sess  uuid;
  v_sub   uuid;
  v_res   jsonb;
  v_row   public.homework_submissions;
  v_log   public.study_logs;
  v_days  integer;
begin
  /* 검증용 학생 */
  insert into public.students (name, code, grade)
  values ('검증칭찬', lpad((floor(random() * 9000) + 1000)::int::text, 4, '0'), '검증')
  returning id into v_id;

  /* 숙제 세션 (이미 끝난 것처럼) + 승인 대기 제출 */
  insert into public.study_sessions (student_id, status, kind, started_at, ended_at, last_heartbeat_at, minutes)
  values (v_id, 'finished', 'homework', now() - interval '40 minutes', now(), now(), 40)
  returning id into v_sess;

  insert into public.homework_submissions (student_id, session_id, date, started_at, ended_at, submitted_minutes, submitted_problems)
  values (v_id, v_sess, (now() at time zone 'Asia/Seoul')::date, now() - interval '40 minutes', now(), 40, 30)
  returning id into v_sub;

  /* 1) 200자를 넘으면 comment_too_long — 아무것도 바뀌지 않는다 */
  begin
    v_res := public.review_homework_submission(v_sub, true, true, null, repeat('가', 201));
    raise exception 'verify_failed: 201자 칭찬이 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%comment_too_long%' then raise; end if;
  end;

  select * into v_row from public.homework_submissions where id = v_sub;
  if v_row.status <> 'pending' or v_row.teacher_comment is not null then
    raise exception 'verify_failed: 201자 거절 뒤에도 바뀜 (status %, comment %)', v_row.status, v_row.teacher_comment;
  end if;

  /* 2) 승인 + 앞뒤 공백이 있는 칭찬 → 다듬어서 저장 */
  v_res := public.review_homework_submission(v_sub, true, true, null, '  풀이가 꼼꼼해요  ');
  select * into v_row from public.homework_submissions where id = v_sub;
  if v_row.status <> 'approved' or v_row.teacher_comment is distinct from '풀이가 꼼꼼해요' then
    raise exception 'verify_failed: 승인 칭찬이 저장되지 않음 (%, %)', v_row.status, v_row.teacher_comment;
  end if;
  if (v_res->>'status') <> 'approved' or (v_res->'submission'->>'teacher_comment') is distinct from '풀이가 꼼꼼해요' then
    raise exception 'verify_failed: 돌려준 결과에 칭찬이 없음';
  end if;

  select * into v_log from public.study_logs where student_id = v_id;
  if v_log.homework_minutes <> 40 or v_log.homework_problems <> 30 then
    raise exception 'verify_failed: 기록 반영이 틀림 (%분 · %문제)', v_log.homework_minutes, v_log.homework_problems;
  end if;

  /* 3) 한 번 처리한 제출은 다시 못 함 */
  begin
    v_res := public.review_homework_submission(v_sub, true, true, null, '다시');
    raise exception 'verify_failed: 두 번 처리가 통과함';
  exception when sqlstate '22023' then
    if sqlerrm not like '%already_reviewed%' then raise; end if;
  end;

  /* 4) 모두 반려 + 칭찬 → 반려라서 칭찬은 저장하지 않는다 */
  insert into public.homework_submissions (student_id, date, started_at, ended_at, submitted_minutes, submitted_problems)
  values (v_id, (now() at time zone 'Asia/Seoul')::date - 1, now() - interval '1 day 20 minutes', now() - interval '1 day', 20, 10)
  returning id into v_sub;

  v_res := public.review_homework_submission(v_sub, false, false, '풀이 흔적 부족', '괜찮아요');
  select * into v_row from public.homework_submissions where id = v_sub;
  if v_row.status <> 'rejected' or v_row.teacher_comment is not null then
    raise exception 'verify_failed: 모두 반려인데 칭찬이 남음 (% / %)', v_row.status, v_row.teacher_comment;
  end if;

  /* 5) 예전 화면 호출(4개 인자)도 그대로 — 칭찬 없이 승인 */
  insert into public.homework_submissions (student_id, date, started_at, ended_at, submitted_minutes, submitted_problems)
  values (v_id, (now() at time zone 'Asia/Seoul')::date - 2, now() - interval '2 days 15 minutes', now() - interval '2 days', 15, 4)
  returning id into v_sub;

  v_res := public.review_homework_submission(v_sub, true, false, null);
  select * into v_row from public.homework_submissions where id = v_sub;
  if v_row.status <> 'approved' or v_row.teacher_comment is not null or v_row.approved_minutes <> 15 then
    raise exception 'verify_failed: 예전 4개 인자 호출이 이상함 (% / % / %)', v_row.status, v_row.teacher_comment, v_row.approved_minutes;
  end if;

  /* 6) 빈 문자열은 null 로 */
  insert into public.homework_submissions (student_id, date, started_at, ended_at, submitted_minutes, submitted_problems)
  values (v_id, (now() at time zone 'Asia/Seoul')::date - 3, now() - interval '3 days 5 minutes', now() - interval '3 days', 5, 0)
  returning id into v_sub;

  v_res := public.review_homework_submission(v_sub, true, true, null, '   ');
  select * into v_row from public.homework_submissions where id = v_sub;
  if v_row.teacher_comment is not null then
    raise exception 'verify_failed: 빈 칭찬이 null 이 아님 (%)', v_row.teacher_comment;
  end if;

  /* 7) 드래곤볼은 그대로 (숙제 승인과 별개) */
  select dragonball_count into v_days from public.students where id = v_id;
  if v_days <> 0 then
    raise exception 'verify_failed: 드래곤볼이 생김 (%)', v_days;
  end if;

  raise notice '칭찬 한마디 검증 통과 — 승인 저장·공백 정리·200자 거절·모두 반려 미저장·예전 호출 호환·기록 반영·드래곤볼 그대로';

  delete from public.study_logs where student_id = v_id;
  delete from public.homework_submissions where student_id = v_id;
  delete from public.study_sessions where student_id = v_id;
  delete from public.students where id = v_id;
end;
$$;

-- 남은 검증 데이터가 없어야 한다
select count(*) as left_verify_students from public.students where grade = '검증';
