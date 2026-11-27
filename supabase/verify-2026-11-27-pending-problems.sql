-- =====================================================================
--  선오공 — 「지난번 푼 문제 수」 저장 수정 검증 (2026-11-27)
--  Supabase Dashboard > SQL Editor 에 붙여 넣고 실행하세요.
--  · migrate-2026-11-27-pending-problems-save-fix.sql 을 먼저 실행해야 합니다.
--  · 검증용 학생(ZZ검증문제수)을 만들었다가 마지막에 지웁니다. 실제 학생 데이터는 건드리지 않습니다.
--  · 결과 표에서 ok = true 인 줄만 정상입니다.
-- =====================================================================

create temp table if not exists _verify_problems (test text, ok boolean, detail text) on commit drop;
truncate _verify_problems;
grant all on _verify_problems to anon, authenticated;

do $$
declare
  v_stu    uuid;
  v_att    uuid;
  v_sess   uuid;
  v_run    uuid;
  v_res    jsonb;
  v_row    public.study_sessions;
  v_log    public.study_logs;
  v_flag   boolean;
  v_msg    text;
begin
  ------------------------------------------------------------------
  -- T0 트리거 함수가 security invoker 인가 (호출자를 볼 수 있어야 한다)
  ------------------------------------------------------------------
  select not p.prosecdef into v_flag
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'study_session_guard';
  insert into _verify_problems values ('T0 트리거 함수 = security invoker', coalesce(v_flag, false),
    format('prosecdef=false 인가: %s', v_flag));

  insert into public.students (name, code, grade) values ('ZZ검증문제수', '0001', '중1') returning id into v_stu;

  -- 훈출이 연 학원 세션(하원 마감·문제 수 대기) 하나를 만든다
  insert into public.attendance_sessions (student_id, seat_id, check_in_at, check_in_by, check_out_at, check_out_by, close_reason, session_date)
  values (v_stu, 'Z-3', now() - interval '20 minutes', 'student', now() - interval '5 minutes', 'staff', 'normal', public.kst_today())
  returning id into v_att;

  insert into public.study_sessions (student_id, kind, status, started_at, last_heartbeat_at, ended_at, minutes, problems, problems_pending, date, attendance_id)
  values (v_stu, 'academy', 'finished', now() - interval '20 minutes', now() - interval '5 minutes', now() - interval '5 minutes', 15, null, true, public.kst_today(), v_att)
  returning id into v_sess;

  insert into public.study_logs (student_id, date, minutes, problems, academy_minutes, academy_problems, homework_minutes, homework_problems)
  values (v_stu, public.kst_today(), 15, 0, 15, 0, 0, 0);

  ------------------------------------------------------------------
  -- T1 (증상 재현 자리) 학생 앱(anon) 경로로 「0문제 저장」이 통과한다
  ------------------------------------------------------------------
  begin
    execute 'set local role anon';
    v_res := public.set_session_problems(v_sess, 0);
    execute 'reset role';
    select * into v_row from public.study_sessions where id = v_sess;
    select * into v_log from public.study_logs where student_id = v_stu and date = v_row.date;
    insert into _verify_problems values (
      'T1 훈출 세션·0문제 저장(앱 경로)',
      v_row.problems = 0 and v_row.problems_pending = false and v_log.academy_problems = 0,
      format('session.problems=%s, pending=%s, log.academy_problems=%s', v_row.problems, v_row.problems_pending, v_log.academy_problems)
    );
  exception when others then
    execute 'reset role';
    insert into _verify_problems values ('T1 훈출 세션·0문제 저장(앱 경로)', false, sqlerrm);
  end;

  ------------------------------------------------------------------
  -- T2 같은 경로로 숫자(5문제)도 그대로 들어간다 — 기록에 더해진다
  ------------------------------------------------------------------
  update public.study_sessions set problems = null, problems_pending = true where id = v_sess;

  begin
    execute 'set local role anon';
    v_res := public.set_session_problems(v_sess, 5);
    execute 'reset role';
    select * into v_row from public.study_sessions where id = v_sess;
    select * into v_log from public.study_logs where student_id = v_stu and date = v_row.date;
    insert into _verify_problems values (
      'T2 훈출 세션·5문제 저장(앱 경로)',
      v_row.problems = 5 and v_row.problems_pending = false and v_log.academy_problems = 5 and v_log.problems = 5,
      format('session.problems=%s, log.academy_problems=%s, log.problems=%s', v_row.problems, v_log.academy_problems, v_log.problems)
    );
  exception when others then
    execute 'reset role';
    insert into _verify_problems values ('T2 훈출 세션·5문제 저장(앱 경로)', false, sqlerrm);
  end;

  ------------------------------------------------------------------
  -- T3 학생 폰이 표를 직접 고치는 길은 여전히 막힌다 (가드 유지)
  ------------------------------------------------------------------
  begin
    execute 'set local role anon';
    update public.study_sessions set problems = 99 where id = v_sess;
    execute 'reset role';
    insert into _verify_problems values ('T3 anon 직접 수정 차단(훈출 세션)', false, '직접 수정이 통과되었습니다');
  exception when others then
    execute 'reset role';
    v_msg := sqlerrm;
    insert into _verify_problems values ('T3 anon 직접 수정 차단(훈출 세션)', v_msg like '%session_managed_by_kiosk%', v_msg);
  end;

  ------------------------------------------------------------------
  -- T4 학생 폰이 방금 시작한 세션을 0분으로 끝내는 길도 여전히 막힌다
  ------------------------------------------------------------------
  insert into public.study_sessions (student_id, kind, status, started_at, last_heartbeat_at, date)
  values (v_stu, 'academy', 'running', now() - interval '10 seconds', now(), public.kst_today())
  returning id into v_run;

  begin
    execute 'set local role anon';
    update public.study_sessions set status = 'finished', ended_at = now(), minutes = 0 where id = v_run;
    execute 'reset role';
    insert into _verify_problems values ('T4 anon 0분 종료 차단', false, '직접 종료가 통과되었습니다');
  exception when others then
    execute 'reset role';
    v_msg := sqlerrm;
    insert into _verify_problems values ('T4 anon 0분 종료 차단', v_msg like '%academy_too_short%' or v_msg like '%session_managed_by_kiosk%', v_msg);
  end;

  ------------------------------------------------------------------
  -- T5 학생 폰의 하트비트는 그대로 된다 (구버전 탭이 계속 동작)
  ------------------------------------------------------------------
  begin
    execute 'set local role anon';
    update public.study_sessions set last_heartbeat_at = now() where id = v_run;
    execute 'reset role';
    insert into _verify_problems values ('T5 anon 하트비트 허용', true, 'ok');
  exception when others then
    execute 'reset role';
    insert into _verify_problems values ('T5 anon 하트비트 허용', false, sqlerrm);
  end;

  ------------------------------------------------------------------
  -- T6 앱 RPC(일시정지·재개)는 훈출 세션에도 통과한다 (예전엔 가드에 막혔다)
  ------------------------------------------------------------------
  begin
    select * into v_row from public.pause_session(v_run, false);
    v_flag := v_row.status = 'paused';
    select * into v_row from public.resume_session(v_run);
    insert into _verify_problems values (
      'T6 앱 RPC 일시정지·재개',
      v_flag and v_row.status = 'running',
      format('paused=%s, resumed=%s', v_flag, v_row.status)
    );
  exception when others then
    insert into _verify_problems values ('T6 앱 RPC 일시정지·재개', false, sqlerrm);
  end;

  -- T7 은 새 진행 중 세션을 만들므로, T6 이 남긴 세션을 지워 "학생당 진행 중 1개" 규칙을 지킨다
  delete from public.study_sessions where id = v_run;

  ------------------------------------------------------------------
  -- T7 하원 전 훈출 세션은 앱에서 끝낼 수 없다 (finish_session 자체 가드 유지)
  ------------------------------------------------------------------
  insert into public.attendance_sessions (student_id, seat_id, check_in_at, check_in_by, session_date)
  values (v_stu, 'Z-4', now() - interval '3 minutes', 'student', public.kst_today())
  returning id into v_att;

  insert into public.study_sessions (student_id, kind, status, started_at, last_heartbeat_at, date, attendance_id)
  values (v_stu, 'academy', 'running', now() - interval '3 minutes', now(), public.kst_today(), v_att)
  returning id into v_run;

  begin
    v_res := public.finish_session(v_run, 3);
    insert into _verify_problems values ('T7 하원 전 종료 거부(함수 가드)', false, '거부되지 않았습니다');
  exception when others then
    insert into _verify_problems values ('T7 하원 전 종료 거부(함수 가드)', sqlerrm like '%academy_managed_by_kiosk%', sqlerrm);
  end;

  ------------------------------------------------------------------
  -- T8 관리자 「수업 종료」는 훈출 세션도 끝낼 수 있다 (예전엔 트리거에 막혔다)
  ------------------------------------------------------------------
  begin
    v_res := public.admin_end_study_session(v_run, 2);
    select * into v_row from public.study_sessions where id = v_run;
    insert into _verify_problems values (
      'T8 관리자 수업 종료(훈출 세션)',
      v_row.status = 'finished' and coalesce(v_row.ended_by_admin, false),
      format('status=%s, ended_by_admin=%s', v_row.status, v_row.ended_by_admin)
    );
  exception when others then
    insert into _verify_problems values ('T8 관리자 수업 종료(훈출 세션)', false, sqlerrm);
  end;

  ------------------------------------------------------------------
  -- 정리 — 검증용 학생과 그 세션·기록·출결
  ------------------------------------------------------------------
  delete from public.study_logs            where student_id = v_stu;
  delete from public.homework_submissions  where student_id = v_stu;
  delete from public.study_sessions        where student_id = v_stu;
  delete from public.attendance_sessions   where student_id = v_stu;
  delete from public.students              where id = v_stu;
end $$;

select test, ok, detail from _verify_problems order by test;
