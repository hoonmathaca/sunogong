-- =====================================================================
--  선오공 — 학생 「공부 기록」 달력 함수 검증 (2026-11-28)
--  Supabase Dashboard > SQL Editor 에 붙여 넣고 실행하세요.
--  · migrate-2026-11-28-student-calendar.sql 을 먼저 실행해야 합니다.
--  · 검증용 학생(ZZ검증달력)을 만들었다가 마지막에 지웁니다. 실제 학생 데이터는 건드리지 않습니다.
--  · 아래 세 줄을 차례로 실행하고, 마지막 결과에서 ok = true 인 줄만 정상입니다.
--      1) create or replace function ... (이 파일의 함수 정의)
--      2) select * from public.verify_student_calendar_20261128();
--      3) drop function if exists public.verify_student_calendar_20261128();
--    (SQL Editor 는 한 번에 실행해도 되고, 함수는 끝나고 꼭 지워 주세요)
-- =====================================================================

create or replace function public.verify_student_calendar_20261128()
returns table (test text, ok boolean, detail text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stu uuid;
  r     record;
  v_fn  oid := 'public.student_day_records(uuid, date, date)'::regprocedure;
begin
  insert into public.students (name, code, grade)
  values ('ZZ검증달력', '9901', '검증')
  returning id into v_stu;

  /* ① 보통 하루 — 15:36 등원 · 17:48 하원 (김도혁 11/27 과 같은 모양) */
  insert into public.attendance_sessions
    (student_id, session_date, seat_id, check_in_at, check_out_at, close_reason, check_in_by, check_out_by)
  values
    (v_stu, '2026-11-20', 'ZZ1', '2026-11-20 15:36+09', '2026-11-20 17:48+09', 'normal', 'staff', 'student');
  insert into public.study_logs (student_id, date, minutes, problems, academy_minutes, academy_problems, homework_minutes, homework_problems)
  values (v_stu, '2026-11-20', 131, 43, 131, 43, 0, 0);

  /* ② 하루에 두 번 (좌석 이동·재입실) — 등원은 첫 입실, 하원은 마지막 퇴실 */
  insert into public.attendance_sessions
    (student_id, session_date, seat_id, check_in_at, check_out_at, close_reason, check_in_by, check_out_by)
  values
    (v_stu, '2026-11-21', 'ZZ2', '2026-11-21 15:00+09', '2026-11-21 15:06+09', 'normal', 'staff', 'student'),
    (v_stu, '2026-11-21', 'ZZ3', '2026-11-21 15:36+09', '2026-11-21 17:47+09', 'normal', 'staff', 'student');
  insert into public.study_logs (student_id, date, minutes, problems, academy_minutes, academy_problems, homework_minutes, homework_problems)
  values (v_stu, '2026-11-21', 171, 49, 131, 43, 40, 6);

  /* ③ 하원을 안 찍어 자동 마감된 날 (21:30) */
  insert into public.attendance_sessions
    (student_id, session_date, seat_id, check_in_at, check_out_at, close_reason, check_in_by, check_out_by)
  values
    (v_stu, '2026-11-22', 'ZZ4', '2026-11-22 15:31+09', '2026-11-22 21:30+09', 'stale_auto', 'staff', 'auto');

  /* ④ 아직 학원에 있는 날 (하원 미체크) */
  insert into public.attendance_sessions
    (student_id, session_date, seat_id, check_in_at, check_out_at, close_reason, check_in_by)
  values
    (v_stu, '2026-11-23', 'ZZ5', '2026-11-23 15:30+09', null, null, 'staff');

  /* ⑤ 등·하원 없이 공부 기록만 있는 날 */
  insert into public.study_logs (student_id, date, minutes, problems, academy_minutes, academy_problems, homework_minutes, homework_problems)
  values (v_stu, '2026-11-24', 135, 45, 135, 45, 0, 0);

  /* ⑥ 앞 방문은 자동 마감, 마지막 방문은 정상 하원 → 자동 마감으로 보지 않는다 */
  insert into public.attendance_sessions
    (student_id, session_date, seat_id, check_in_at, check_out_at, close_reason, check_in_by, check_out_by)
  values
    (v_stu, '2026-11-25', 'ZZ6', '2026-11-25 15:00+09', '2026-11-25 21:30+09', 'stale_auto', 'staff', 'auto'),
    (v_stu, '2026-11-25', 'ZZ7', '2026-11-25 15:40+09', '2026-11-25 17:50+09', 'normal', 'staff', 'student');

  /* ⑦ 기간 밖(10월)은 돌려주지 않는다 */
  insert into public.attendance_sessions
    (student_id, session_date, seat_id, check_in_at, check_out_at, close_reason, check_in_by, check_out_by)
  values
    (v_stu, '2026-10-15', 'ZZ8', '2026-10-15 15:10+09', '2026-10-15 17:20+09', 'normal', 'staff', 'student');

  /* ── 함수 권한 ─────────────────────────────────────────────── */
  return query select '함수 있음', exists (select 1 from pg_proc where oid = v_fn), 'student_day_records(uuid, date, date)';
  return query select 'security definer', (select prosecdef from pg_proc where oid = v_fn), 'RLS 닫힌 attendance_sessions 를 함수만 읽는다';
  return query select 'anon 실행 권한', has_function_privilege('anon', v_fn, 'execute'), '학생 폰(anon 키)이 부를 수 있다';
  /* PUBLIC 은 역할 이름이 아니라 의사 역할이라 has_function_privilege('public', ...) 로는 확인할 수 없다
     (ERROR: role "public" is reserved). 권한 목록(proacl)을 aclexplode 로 풀어 grantee 0(PUBLIC)이 없는지 본다. */
  return query select 'public 실행 권한 없음',
    not exists (
      select 1 from pg_proc p
       where p.oid = v_fn
         and exists (
           select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0 and a.privilege_type = 'EXECUTE'
         )
    ), 'revoke all from public (GRANTEE 0 = PUBLIC 없음)';
  return query select '출결 표는 그대로 닫힘', (select relrowsecurity from pg_class where oid = 'public.attendance_sessions'::regclass), 'RLS 유지';

  /* ── ① 보통 하루 ────────────────────────────────────────────── */
  select * into r from public.student_day_records(v_stu, '2026-11-20', '2026-11-20');
  return query select '① 등원·하원 시각', r.check_in_at = '2026-11-20 15:36+09' and r.check_out_at = '2026-11-20 17:48+09',
    coalesce(to_char(r.check_in_at at time zone 'Asia/Seoul', 'HH24:MI'), 'null') || ' ~ ' || coalesce(to_char(r.check_out_at at time zone 'Asia/Seoul', 'HH24:MI'), 'null');
  return query select '① 자동마감·재원중 아님', not r.check_out_auto and not r.check_out_missing and r.visits = 1, 'visits=' || r.visits;
  return query select '① 학원·숙제 분·문제', r.academy_minutes = 131 and r.academy_problems = 43 and r.homework_minutes = 0 and r.homework_problems = 0,
    r.academy_minutes || '분 · ' || r.academy_problems || '개';

  /* ── ② 두 번 입실 ──────────────────────────────────────────── */
  select * into r from public.student_day_records(v_stu, '2026-11-21', '2026-11-21');
  return query select '② 등원=첫 입실·하원=마지막 퇴실', r.check_in_at = '2026-11-21 15:00+09' and r.check_out_at = '2026-11-21 17:47+09',
    coalesce(to_char(r.check_in_at at time zone 'Asia/Seoul', 'HH24:MI'), 'null') || ' ~ ' || coalesce(to_char(r.check_out_at at time zone 'Asia/Seoul', 'HH24:MI'), 'null');
  return query select '② 입실 횟수', r.visits = 2, 'visits=' || r.visits;
  return query select '② 숙제 분·문제 함께', r.homework_minutes = 40 and r.homework_problems = 6 and r.academy_minutes = 131,
    r.homework_minutes || '분 · ' || r.homework_problems || '개';

  /* ── ③ 자동 마감 ───────────────────────────────────────────── */
  select * into r from public.student_day_records(v_stu, '2026-11-22', '2026-11-22');
  return query select '③ 자동 마감 표시', r.check_out_auto and not r.check_out_missing, 'check_out_auto=' || r.check_out_auto;
  return query select '③ 자동 마감 시각', r.check_out_at = '2026-11-22 21:30+09', coalesce(to_char(r.check_out_at at time zone 'Asia/Seoul', 'HH24:MI'), 'null');

  /* ── ④ 아직 학원 ───────────────────────────────────────────── */
  select * into r from public.student_day_records(v_stu, '2026-11-23', '2026-11-23');
  return query select '④ 재원 중 표시', r.check_out_missing and not r.check_out_auto, 'check_out_missing=' || r.check_out_missing;
  return query select '④ 재원 중이면 하원 시각 없음', r.check_out_at is null, 'check_out_at=' || coalesce(r.check_out_at::text, 'null');

  /* ── ⑤ 공부 기록만 ─────────────────────────────────────────── */
  select * into r from public.student_day_records(v_stu, '2026-11-24', '2026-11-24');
  return query select '⑤ 출결 없이 공부만', r.check_in_at is null and r.visits = 0 and r.academy_minutes = 135,
    '분=' || r.academy_minutes || ' · visits=' || r.visits;

  /* ── ⑥ 마지막 방문이 정상이면 자동 아님 ─────────────────────── */
  select * into r from public.student_day_records(v_stu, '2026-11-25', '2026-11-25');
  return query select '⑥ 마지막 방문 기준 자동마감 아님', not r.check_out_auto and r.check_out_at = '2026-11-25 17:50+09',
    'auto=' || r.check_out_auto || ' · ' || coalesce(to_char(r.check_out_at at time zone 'Asia/Seoul', 'HH24:MI'), 'null');

  /* ── ⑦ 기간 밖 ─────────────────────────────────────────────── */
  return query select '⑦ 기간 밖(10월)은 안 나옴',
    not exists (select 1 from public.student_day_records(v_stu, '2026-11-01', '2026-11-30') x where x.record_date = '2026-10-15'), '11월만';
  return query select '⑦ 한 달 = 30일 모두 나옴 (기록 없는 날 포함)',
    (select count(*) from public.student_day_records(v_stu, '2026-11-01', '2026-11-30')) = 30, '30칸';

  /* 검증용 학생 정리 — 출결·기록은 함께 지워진다 (on delete cascade) */
  delete from public.students where id = v_stu;
end;
$$;

select * from public.verify_student_calendar_20261128();

drop function if exists public.verify_student_calendar_20261128();
