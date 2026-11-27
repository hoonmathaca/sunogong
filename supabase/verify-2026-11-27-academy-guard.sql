-- =====================================================================
--  선오공 — 학원 0분 종료 가드 검증 (2026-11-27)
--  Supabase Dashboard > SQL Editor 에 붙여 넣고 실행하세요.
--  · migrate-2026-11-27-academy-zero-end-guard.sql 을 먼저 실행해야 합니다.
--  · 검증용 학생(ZZ검증가드)을 만들었다가 마지막에 지웁니다. 실제 학생 데이터는 건드리지 않습니다.
--  · 결과 표에서 ok = true 인 줄만 정상입니다.
-- =====================================================================

create temp table if not exists _verify_guard (test text, ok boolean, detail text) on commit drop;
truncate _verify_guard;
grant all on _verify_guard to anon, authenticated;

do $$
declare
  v_stu      uuid;
  v_att      uuid;
  v_academy  uuid;
  v_short    uuid;
  v_kiosk    uuid;
  v_admin    uuid;
  v_pause0   uuid;
  v_hw       uuid;
  v_hw_end   uuid;
  v_res      jsonb;
  v_row      public.study_sessions;
  v_msg      text;
begin
  ------------------------------------------------------------------
  -- ① 학원 세션은 자동 일시정지하지 않는다 (출훈 등원 직후 구버전 탭이 부르던 경로)
  ------------------------------------------------------------------
  insert into public.students (name, code, grade) values ('ZZ검증가드', '0000', '중1') returning id into v_stu;

  insert into public.study_sessions (student_id, kind, status, started_at, last_heartbeat_at, date)
  values (v_stu, 'academy', 'running', now() - interval '40 seconds', now() - interval '40 seconds', public.kst_today())
  returning id into v_academy;

  begin
    select * into v_row from public.pause_session(v_academy, true);
    insert into _verify_guard values (
      'T1 학원·자동 일시정지 무시',
      v_row.status = 'running' and v_row.paused_at is null and v_row.auto_pause_count = 0,
      format('status=%s, paused_at=%s, auto_pause_count=%s', v_row.status, v_row.paused_at, v_row.auto_pause_count)
    );
  exception when others then
    insert into _verify_guard values ('T1 학원·자동 일시정지 무시', false, sqlerrm);
  end;

  ------------------------------------------------------------------
  -- ② 방금 시작한 학원 세션은 종료 거부 (0분 기록 금지)
  ------------------------------------------------------------------
  begin
    v_res := public.finish_session(v_academy, 5);
    insert into _verify_guard values ('T2 학원·0분 종료 거부', false, '거부되지 않았습니다: ' || coalesce(v_res ->> 'minutes', '?') || '분');
  exception when others then
    insert into _verify_guard values ('T2 학원·0분 종료 거부', sqlerrm like '%academy_too_short%', sqlerrm);
  end;

  ------------------------------------------------------------------
  -- ③ 1분 넘게 공부한 학원 세션이면 정상 종료된다
  ------------------------------------------------------------------
  update public.study_sessions
     set started_at = now() - interval '3 minutes', last_heartbeat_at = now()
   where id = v_academy;

  begin
    v_res := public.finish_session(v_academy, 7);
    insert into _verify_guard values (
      'T3 학원·3분 정상 종료',
      (v_res ->> 'minutes')::int = 3 and (v_res ->> 'problems')::int = 7,
      format('minutes=%s, problems=%s', v_res ->> 'minutes', v_res ->> 'problems')
    );
  exception when others then
    insert into _verify_guard values ('T3 학원·3분 정상 종료', false, sqlerrm);
  end;

  ------------------------------------------------------------------
  -- ④ 출훈이 연 학원 세션은 하원 전에 앱에서 끝낼 수 없다
  ------------------------------------------------------------------
  insert into public.attendance_sessions (student_id, seat_id, check_in_at, check_in_by, session_date)
  values (v_stu, 'Z-1', now() - interval '10 minutes', 'student', public.kst_today())
  returning id into v_att;

  insert into public.study_sessions (student_id, kind, status, started_at, last_heartbeat_at, date, attendance_id)
  values (v_stu, 'academy', 'running', now() - interval '10 minutes', now(), public.kst_today(), v_att)
  returning id into v_kiosk;

  begin
    v_res := public.finish_session(v_kiosk, 3);
    insert into _verify_guard values ('T4 출훈 세션·하원 전 종료 거부', false, '거부되지 않았습니다');
  exception when others then
    insert into _verify_guard values ('T4 출훈 세션·하원 전 종료 거부', sqlerrm like '%academy_managed_by_kiosk%', sqlerrm);
  end;

  ------------------------------------------------------------------
  -- ⑤ 하원 처리 뒤에는 정상 종료된다 (출훈 하원 흐름과 같은 순서)
  ------------------------------------------------------------------
  update public.attendance_sessions set check_out_at = now(), check_out_by = 'staff', close_reason = 'normal' where id = v_att;

  begin
    v_res := public.finish_session(v_kiosk, 12);
    insert into _verify_guard values (
      'T5 출훈 세션·하원 뒤 종료',
      v_res ->> 'discarded' is null and (v_res ->> 'minutes')::int >= 9,
      format('minutes=%s, problems=%s', v_res ->> 'minutes', v_res ->> 'problems')
    );
  exception when others then
    insert into _verify_guard values ('T5 출훈 세션·하원 뒤 종료', false, sqlerrm);
  end;

  ------------------------------------------------------------------
  -- ⑥ 관리자 「수업 종료」는 방금 시작한 세션도 끝낼 수 있다 (p_force)
  ------------------------------------------------------------------
  insert into public.study_sessions (student_id, kind, status, started_at, last_heartbeat_at, date)
  values (v_stu, 'academy', 'running', now() - interval '10 seconds', now(), public.kst_today())
  returning id into v_admin;

  begin
    v_res := public.admin_end_study_session(v_admin, 0);
    insert into _verify_guard values (
      'T6 관리자 수업 종료(강제)',
      coalesce((v_res ->> 'already_finished')::boolean, true) = false and (v_res ->> 'session') is not null,
      format('minutes=%s, ended_by_admin=%s', v_res ->> 'minutes', v_res ->> 'ended_by_admin')
    );
  exception when others then
    insert into _verify_guard values ('T6 관리자 수업 종료(강제)', false, sqlerrm);
  end;

  ------------------------------------------------------------------
  -- ⑦ 0분 일시정지 세션은 자동 종료되지 않는다 (예전에 0분 기록이 되던 자리)
  ------------------------------------------------------------------
  insert into public.study_sessions (student_id, kind, status, started_at, last_heartbeat_at, date, paused_at, auto_pause_count, last_pause_auto)
  values (v_stu, 'academy', 'paused', now() - interval '70 minutes', now() - interval '70 minutes', public.kst_today(), now() - interval '70 minutes', 1, true)
  returning id into v_pause0;

  begin
    v_res := public.auto_end_paused_session(v_pause0);
    select * into v_row from public.study_sessions where id = v_pause0;
    insert into _verify_guard values (
      'T7 0분 세션·자동 종료 거부',
      coalesce((v_res ->> 'too_short')::boolean, false) and v_row.status = 'paused',
      format('too_short=%s, status=%s', v_res ->> 'too_short', v_row.status)
    );
  exception when others then
    insert into _verify_guard values ('T7 0분 세션·자동 종료 거부', false, sqlerrm);
  end;

  delete from public.study_sessions where id = v_pause0;

  ------------------------------------------------------------------
  -- ⑧ 숙제 공부는 지금처럼 화면 이탈에 일시정지된다 (기존 흐름 보존)
  ------------------------------------------------------------------
  insert into public.study_sessions (student_id, kind, status, started_at, last_heartbeat_at, date)
  values (v_stu, 'homework', 'running', now() - interval '12 minutes', now() - interval '2 minutes', public.kst_today())
  returning id into v_hw;

  begin
    select * into v_row from public.pause_session(v_hw, true);
    insert into _verify_guard values (
      'T8 숙제·자동 일시정지 유지',
      v_row.status = 'paused' and v_row.auto_pause_count = 1 and v_row.paused_at = v_row.last_heartbeat_at,
      format('status=%s, auto_pause_count=%s, paused_at=%s', v_row.status, v_row.auto_pause_count, v_row.paused_at)
    );
  exception when others then
    insert into _verify_guard values ('T8 숙제·자동 일시정지 유지', false, sqlerrm);
  end;

  ------------------------------------------------------------------
  -- ⑨ 10분 숙제 세션 일시정지 60분 → 정상 자동 종료 (문제 수는 다음 접속에)
  ------------------------------------------------------------------
  update public.study_sessions
     set started_at = now() - interval '70 minutes',
         paused_at  = now() - interval '60 minutes'
   where id = v_hw;

  begin
    v_res := public.auto_end_paused_session(v_hw);
    insert into _verify_guard values (
      'T9 숙제·자동 종료 유지',
      coalesce((v_res ->> 'auto_ended')::boolean, false) and (v_res ->> 'minutes')::int = 10,
      format('minutes=%s, problems_pending=%s', v_res ->> 'minutes', v_res ->> 'problems_pending')
    );
  exception when others then
    insert into _verify_guard values ('T9 숙제·자동 종료 유지', false, sqlerrm);
  end;

  ------------------------------------------------------------------
  -- ⑩ 학생 폰(anon)이 표를 직접 고쳐 출훈 세션을 끝낼 수 없다
  ------------------------------------------------------------------
  insert into public.attendance_sessions (student_id, seat_id, check_in_at, check_in_by, session_date)
  values (v_stu, 'Z-2', now() - interval '8 minutes', 'student', public.kst_today())
  returning id into v_att;

  insert into public.study_sessions (student_id, kind, status, started_at, last_heartbeat_at, date, attendance_id)
  values (v_stu, 'academy', 'running', now() - interval '8 minutes', now(), public.kst_today(), v_att)
  returning id into v_kiosk;

  begin
    execute 'set local role anon';
    update public.study_sessions set status = 'finished', ended_at = now(), minutes = 0 where id = v_kiosk;
    execute 'reset role';
    insert into _verify_guard values ('T10 anon 직접 수정 차단', false, '직접 수정이 통과되었습니다');
  exception when others then
    v_msg := sqlerrm;
    insert into _verify_guard values ('T10 anon 직접 수정 차단', v_msg like '%session_managed_by_kiosk%', v_msg);
  end;

  ------------------------------------------------------------------
  -- ⑪ 학생 폰(anon)의 하트비트는 그대로 된다 (구버전 탭이 계속 동작)
  ------------------------------------------------------------------
  begin
    execute 'set local role anon';
    update public.study_sessions set last_heartbeat_at = now() where id = v_kiosk;
    execute 'reset role';
    insert into _verify_guard values ('T11 anon 하트비트 허용', true, 'ok');
  exception when others then
    v_msg := sqlerrm;
    insert into _verify_guard values ('T11 anon 하트비트 허용', false, v_msg);
  end;

  -- T10/T11 의 검증용(막힌 뒤 running 으로 남은) 세션을 정리해 다음 검증이 열리게 한다
  delete from public.study_sessions where id = v_kiosk;

  ------------------------------------------------------------------
  -- ⑫ 5시간을 채운 세션은 하원 전이라도 가드 없이 마무리된다 (reconcile·resume 경로)
  ------------------------------------------------------------------
  insert into public.study_sessions (student_id, kind, status, started_at, last_heartbeat_at, date)
  values (v_stu, 'academy', 'running', now() - interval '5 hours' - interval '10 seconds', now(), public.kst_today())
  returning id into v_admin;

  begin
    v_res := public.finish_session(v_admin, 40);
    insert into _verify_guard values (
      'T12 5시간 상한 종료',
      (v_res ->> 'minutes')::int = 300 and (v_res ->> 'problems')::int = 40,
      format('minutes=%s', v_res ->> 'minutes')
    );
  exception when others then
    insert into _verify_guard values ('T12 5시간 상한 종료', false, sqlerrm);
  end;

  ------------------------------------------------------------------
  -- ⑬ 지난 날 남은 세션 정리는 오늘 가드에 걸리지 않는다 (cleanup_stale 경로)
  ------------------------------------------------------------------
  insert into public.study_sessions (student_id, kind, status, started_at, last_heartbeat_at, date, paused_at)
  values (v_stu, 'academy', 'paused', public.kst_today() - interval '1 day' + interval '19 hours',
          public.kst_today() - interval '1 day' + interval '19 hours' + interval '20 seconds',
          public.kst_today() - interval '1 day',
          public.kst_today() - interval '1 day' + interval '19 hours' + interval '20 seconds')
  returning id into v_admin;

  begin
    v_res := public.finish_session(v_admin, 0);
    select * into v_row from public.study_sessions where id = v_admin;
    insert into _verify_guard values (
      'T13 지난 날 세션 정리 종료',
      coalesce((v_res ->> 'discarded')::boolean, false) or (v_res ->> 'minutes') is not null,
      format('discarded=%s, minutes=%s, status=%s', v_res ->> 'discarded', v_res ->> 'minutes', v_row.status)
    );
  exception when others then
    insert into _verify_guard values ('T13 지난 날 세션 정리 종료', false, sqlerrm);
  end;

  ------------------------------------------------------------------
  -- 정리 — 검증용 학생과 그 세션·기록·출결을 지운다
  ------------------------------------------------------------------
  delete from public.study_logs    where student_id = v_stu;
  delete from public.homework_submissions where student_id = v_stu;
  delete from public.study_sessions where student_id = v_stu;
  delete from public.attendance_sessions where student_id = v_stu;
  delete from public.students       where id = v_stu;
end $$;

select test, ok, detail from _verify_guard order by test;
