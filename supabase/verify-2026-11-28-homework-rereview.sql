-- =====================================================================
--  선오공 — 숙제 제출 다시 고치기 검증 (2026-11-28)
--  Supabase Dashboard > SQL Editor 에 붙여 넣고 실행하세요.
--  · migrate-2026-11-28-homework-rereview.sql 을 먼저 실행해야 합니다.
--  · 검증용 학생(ZZ검증수정)과 그 제출·기록만 만들었다가 마지막에 지웁니다.
--    실제 학생 데이터는 건드리지 않습니다.
--  · 결과 표에서 ok = true 인 줄만 정상입니다 (T1~T11).
--  · 필요하면 마지막 select 문만 다시 실행해 결과를 볼 수 있습니다.
-- =====================================================================

drop table if exists public._verify_rereview;
create table public._verify_rereview (test text, ok boolean, detail text);

do $$
declare
  v_stu   uuid;
  v_sub   uuid;
  v_sub2  uuid;
  v_sub3  uuid;
  v_draft uuid;
  v_res   jsonb;
  v_log   public.study_logs;
  v_rows  integer;
  v_stu2  uuid;
begin
  insert into public.students (name, code, grade)
  values ('ZZ검증수정', '0000', '중1') returning id into v_stu;

  ------------------------------------------------------------------
  -- T1 승인 대기 → 모두 승인 : 그날 기록에 40분·12문항이 들어간다
  ------------------------------------------------------------------
  insert into public.homework_submissions (student_id, date, submitted_minutes, submitted_problems)
  values (v_stu, public.kst_today(), 40, 12) returning id into v_sub;

  v_res := public.review_homework_submission(v_sub, true, true, null, '풀이가 꼼꼼해요');
  select * into v_log from public.study_logs where student_id = v_stu and date = public.kst_today();

  insert into public._verify_rereview values (
    'T1 처음 승인 → 기록 40분·12문항',
    v_log.homework_minutes = 40 and v_log.homework_problems = 12
      and v_log.minutes = 40 and v_log.problems = 12
      and v_log.academy_minutes = 0 and v_log.academy_problems = 0
      and (v_res ->> 'edited')::boolean = false
      and (v_res ->> 'status') = 'approved',
    format('homework=%s/%s, total=%s/%s, edited=%s', v_log.homework_minutes, v_log.homework_problems, v_log.minutes, v_log.problems, v_res ->> 'edited')
  );

  ------------------------------------------------------------------
  -- T2 승인 → 시간만 반려로 고침 : 40분이 빠지고 12문항은 남는다
  ------------------------------------------------------------------
  v_res := public.review_homework_submission(v_sub, false, true, '풀이 흔적 부족', null);
  select * into v_log from public.study_logs where student_id = v_stu and date = public.kst_today();

  insert into public._verify_rereview values (
    'T2 시간만 반려로 고침 → 0분·12문항',
    v_log.homework_minutes = 0 and v_log.homework_problems = 12
      and v_log.minutes = 0 and v_log.problems = 12
      and (v_res ->> 'edited')::boolean
      and (v_res ->> 'previous_minutes')::int = 40
      and (v_res ->> 'previous_status') = 'approved'
      and (v_res -> 'submission' ->> 'review_edit_count')::int = 1,
    format('homework=%s/%s, total=%s/%s, prev=%s, edit_count=%s', v_log.homework_minutes, v_log.homework_problems, v_log.minutes, v_log.problems, v_res ->> 'previous_minutes', v_res -> 'submission' ->> 'review_edit_count')
  );

  ------------------------------------------------------------------
  -- T3 모두 반려로 고침 : 그날 기록 줄이 남지 않는다 (처음부터 반려였을 때와 같다)
  ------------------------------------------------------------------
  v_res := public.review_homework_submission(v_sub, false, false, '사진 식별 불가', null);
  select count(*) into v_rows from public.study_logs where student_id = v_stu and date = public.kst_today();

  insert into public._verify_rereview values (
    'T3 모두 반려로 고침 → 기록 줄 0개',
    v_rows = 0
      and (v_res ->> 'log') is null
      and (v_res ->> 'status') = 'rejected'
      and (v_res -> 'submission' ->> 'approved_minutes')::int = 0
      and (v_res -> 'submission' ->> 'teacher_comment') is null
      and (v_res -> 'submission' ->> 'review_edit_count')::int = 2,
    format('log_rows=%s, status=%s, comment=%s', v_rows, v_res ->> 'status', v_res -> 'submission' ->> 'teacher_comment')
  );

  ------------------------------------------------------------------
  -- T4 반려 → 다시 승인 (되돌리기) : 40분·12문항이 다시 들어간다
  ------------------------------------------------------------------
  v_res := public.review_homework_submission(v_sub, true, true, null, '다시 봤어요');
  select * into v_log from public.study_logs where student_id = v_stu and date = public.kst_today();

  insert into public._verify_rereview values (
    'T4 반려 → 다시 승인 → 기록 40분·12문항',
    v_log.homework_minutes = 40 and v_log.homework_problems = 12 and v_log.minutes = 40
      and (v_res ->> 'previous_status') = 'rejected'
      and (v_res -> 'submission' ->> 'review_edit_count')::int = 3
      and (v_res -> 'submission' ->> 'first_reviewed_at') is not null,
    format('homework=%s/%s, total=%s, status=%s', v_log.homework_minutes, v_log.homework_problems, v_log.minutes, v_res ->> 'status')
  );

  ------------------------------------------------------------------
  -- T5 같은 날 제출 두 건 : 합쳐지고, 한 건을 고치면 그 몫만 빠진다
  ------------------------------------------------------------------
  insert into public.homework_submissions (student_id, date, submitted_minutes, submitted_problems)
  values (v_stu, public.kst_today(), 30, 8) returning id into v_sub2;

  v_res := public.review_homework_submission(v_sub2, true, true, null, null);
  select * into v_log from public.study_logs where student_id = v_stu and date = public.kst_today();

  insert into public._verify_rereview values (
    'T5 두 번째 제출 승인 → 합계 70분·20문항',
    v_log.homework_minutes = 70 and v_log.homework_problems = 20 and v_log.minutes = 70 and v_log.problems = 20,
    format('homework=%s/%s', v_log.homework_minutes, v_log.homework_problems)
  );

  v_res := public.review_homework_submission(v_sub, false, false, '다시 확인했어요', null);
  select * into v_log from public.study_logs where student_id = v_stu and date = public.kst_today();

  insert into public._verify_rereview values (
    'T5b 첫 제출 반려로 고침 → 30분·8문항만 남음',
    v_log.homework_minutes = 30 and v_log.homework_problems = 8 and v_log.minutes = 30 and v_log.problems = 8,
    format('homework=%s/%s, total=%s/%s', v_log.homework_minutes, v_log.homework_problems, v_log.minutes, v_log.problems)
  );

  ------------------------------------------------------------------
  -- T6 학원 공부 몫은 건드리지 않는다
  ------------------------------------------------------------------
  insert into public.study_logs (student_id, date, minutes, problems, academy_minutes, academy_problems, homework_minutes, homework_problems)
  values (v_stu, public.kst_today() - 1, 50, 5, 50, 5, 0, 0);

  insert into public.homework_submissions (student_id, date, submitted_minutes, submitted_problems)
  values (v_stu, public.kst_today() - 1, 40, 12) returning id into v_sub3;

  v_res := public.review_homework_submission(v_sub3, true, true, null, null);
  select * into v_log from public.study_logs where student_id = v_stu and date = public.kst_today() - 1;
  insert into public._verify_rereview values (
    'T6 학원 50분 + 숙제 40분 → 합계 90분 (학원 몫 그대로)',
    v_log.minutes = 90 and v_log.problems = 17
      and v_log.academy_minutes = 50 and v_log.academy_problems = 5
      and v_log.homework_minutes = 40 and v_log.homework_problems = 12,
    format('total=%s/%s, academy=%s/%s, homework=%s/%s', v_log.minutes, v_log.problems, v_log.academy_minutes, v_log.academy_problems, v_log.homework_minutes, v_log.homework_problems)
  );

  v_res := public.review_homework_submission(v_sub3, false, false, null, null);
  select * into v_log from public.study_logs where student_id = v_stu and date = public.kst_today() - 1;
  insert into public._verify_rereview values (
    'T6b 숙제를 반려로 고쳐도 학원 기록은 그대로',
    v_log.minutes = 50 and v_log.problems = 5
      and v_log.academy_minutes = 50 and v_log.academy_problems = 5
      and v_log.homework_minutes = 0 and v_log.homework_problems = 0,
    format('total=%s/%s, academy=%s/%s', v_log.minutes, v_log.problems, v_log.academy_minutes, v_log.academy_problems)
  );

  ------------------------------------------------------------------
  -- T7 처음부터 모두 반려 : 기록을 만들지 않는다
  ------------------------------------------------------------------
  insert into public.students (name, code, grade)
  values ('ZZ검증수정2', '0001', '중2') returning id into v_stu2;

  insert into public.homework_submissions (student_id, date, submitted_minutes, submitted_problems)
  values (v_stu2, public.kst_today(), 25, 6) returning id into v_sub2;

  v_res := public.review_homework_submission(v_sub2, false, false, '답만 작성됨', null);
  select count(*) into v_rows from public.study_logs where student_id = v_stu2;

  insert into public._verify_rereview values (
    'T7 처음부터 반려 → 기록 0개',
    v_rows = 0 and (v_res ->> 'status') = 'rejected' and (v_res ->> 'edited')::boolean = false,
    format('log_rows=%s', v_rows)
  );

  ------------------------------------------------------------------
  -- T8 반려만 두 번 (기록 변화 없음)
  ------------------------------------------------------------------
  v_res := public.review_homework_submission(v_sub2, false, false, '사진 식별 불가', null);
  select count(*) into v_rows from public.study_logs where student_id = v_stu2;

  insert into public._verify_rereview values (
    'T8 반려 → 반려 고침 → 기록 그대로 0개',
    v_rows = 0 and (v_res -> 'submission' ->> 'reject_reason') = '사진 식별 불가'
      and (v_res -> 'submission' ->> 'review_edit_count')::int = 1,
    format('log_rows=%s, reason=%s', v_rows, v_res -> 'submission' ->> 'reject_reason')
  );

  ------------------------------------------------------------------
  -- T9 문제 수를 모르는 제출은 문항수 승인을 막는다 (예전 규칙 그대로)
  ------------------------------------------------------------------
  insert into public.homework_submissions (student_id, date, submitted_minutes, submitted_problems)
  values (v_stu2, public.kst_today() - 2, 20, null) returning id into v_sub2;

  begin
    v_res := public.review_homework_submission(v_sub2, true, true, null, null);
    insert into public._verify_rereview values ('T9 문제 수 없이 문항수 승인 거부', false, '거부되지 않았습니다');
  exception when others then
    insert into public._verify_rereview values ('T9 문제 수 없이 문항수 승인 거부', sqlerrm like '%problems_unknown%', sqlerrm);
  end;

  ------------------------------------------------------------------
  -- T10 아직 제출 전인 초안 줄은 확인할 수 없다
  ------------------------------------------------------------------
  insert into public.homework_submissions (student_id, date, submitted_minutes, submitted_problems, draft_active, draft_problems)
  values (v_stu2, public.kst_today(), 0, null, true, 3) returning id into v_draft;

  begin
    v_res := public.review_homework_submission(v_draft, true, false, null, null);
    insert into public._verify_rereview values ('T10 초안 줄 확인 거부', false, '거부되지 않았습니다');
  exception when others then
    insert into public._verify_rereview values ('T10 초안 줄 확인 거부', sqlerrm like '%submission_not_found%', sqlerrm);
  end;

  ------------------------------------------------------------------
  -- T11 훈출 등·하원 기록은 그대로 (숙제 승인·수정이 건드리지 않는다)
  ------------------------------------------------------------------
  insert into public.attendance_sessions (student_id, seat_id, check_in_at, check_in_by, session_date)
  values (v_stu2, 'Z-9', now() - interval '30 minutes', 'student', public.kst_today())
  returning id into v_sub3;

  v_res := public.review_homework_submission(v_sub2, true, false, null, '시간만 승인');
  insert into public._verify_rereview values (
    'T11 훈출 등·하원 기록 그대로',
    exists (select 1 from public.attendance_sessions where id = v_sub3 and check_out_at is null),
    'attendance_sessions 1건 유지'
  );

  ------------------------------------------------------------------
  -- 정리 — 검증용 학생과 그 제출·기록·출결을 지운다
  ------------------------------------------------------------------
  delete from public.study_logs where student_id in (v_stu, v_stu2);
  delete from public.homework_submissions where student_id in (v_stu, v_stu2);
  delete from public.attendance_sessions where student_id in (v_stu, v_stu2);
  delete from public.students where id in (v_stu, v_stu2);
end $$;

select test, ok, detail from public._verify_rereview order by test;

drop table if exists public._verify_rereview;
