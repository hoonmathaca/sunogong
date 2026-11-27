-- =====================================================================
--  선오공 — 2026-11-27 기록 이상 3건 정리 (2026-11-28)
--  Supabase Dashboard > SQL Editor 에서 한 번 실행하세요.
--  여러 번 실행해도 안전합니다(이미 정리된 줄은 조건에 걸리지 않습니다).
--
--  ■ 정리 목록 (2026-11-27 실데이터, 점검 결과 handoffs/🔍-선오공-학생-숙제공부-db-이상-여부-점검)
--    ① 김도혁(8d200f29…) 11/27 학원 공부 131분 누락 복구
--       등원 15:36:37 ~ 하원 17:48:24 인데 세션 eaf72fa1… 이 15:37:29 에 0분으로 닫혀
--       하원이 정산할 세션이 없었다(가드 배포 전 auto_pause 1회). 정이든(91분) 복구와 같은 방식으로
--       세션 시간·기록 시간을 채우고, problems_pending=true 로 두어 다음 접속 때 문제 수를 묻는다.
--    ② 정시훈(5a80180b…) 11/27 중복 1분 세션 777712fc… 정리
--       키오스크 토큰 버그 구간에 겹쳐 찍힌 1분 세션(15:29:22~15:30:09)과 그 1분이 더해진
--       기록(221분)을 지워 220분 1건만 남긴다. 세션을 지우면 출결(0691df92…)의 study_session_id 는
--       FK(ON DELETE SET NULL)로 비워진다 — 출결 줄 자체는 훈출 기록이라 그대로 둔다.
--    ③ 이지빈(0ce01ff1…) 0분 유령 대기 2건 정리
--       settle_academy_session 이 0분 세션에도 problems_pending=true 를 남겨, 학생 화면에는
--       영원히 뜨지 않는 대기(6d6932c9…, c3e9b6b8…)가 남았다. problems=0·problems_pending=false 로 닫는다.
--       재발 방지는 migrate-2026-11-28-academy-homework-block.sql 의 settle_academy_session 수정.
--
--  ■ 정리 내역은 audit_log 에 남긴다(restore_study_minutes · remove_duplicate_session · clear_stale_problem_pending).
-- =====================================================================

do $$
declare
  -- ① 김도혁
  v_kim_sess  uuid := 'eaf72fa1-7d89-4602-9144-96773ac5fb4c';
  v_kim_stu   uuid;
  v_kim_date  date;
  v_kim_mins  integer;
  v_kim_att   uuid;
  v_in        timestamptz;
  v_out       timestamptz;
  v_minutes   integer;
  v_log       public.study_logs;
  -- ② 정시훈
  v_dupe_sess uuid := '777712fc-1d2b-4817-8e26-055917265105';
  v_dupe_stu  uuid;
  v_dupe_date date;
  v_dupe_mins integer;
  -- ③ 이지빈
  v_ghosts    uuid[] := array['6d6932c9-9584-4e33-b267-cc239f3a35db'::uuid,
                            'c3e9b6b8-353c-4340-b8e7-bd09dc48a005'::uuid];
  v_name      text;
  v_count     integer;
begin
  ------------------------------------------------------------------
  -- ① 김도혁 11/27 131분 소급 복구
  ------------------------------------------------------------------
  select s.student_id, s.date, s.attendance_id, coalesce(s.minutes, 0)
    into v_kim_stu, v_kim_date, v_kim_att, v_kim_mins
    from public.study_sessions s
   where s.id = v_kim_sess;

  if v_kim_stu is not null and v_kim_mins = 0 then
    select a.check_in_at, a.check_out_at
      into v_in, v_out
      from public.attendance_sessions a
     where a.id = v_kim_att;

    if v_in is not null and v_out is not null then
      -- 등원~하원 사이 실제 시간(초 단위 내림) — 점검에서 131분으로 확인
      v_minutes := greatest(0, floor(extract(epoch from (v_out - v_in)) / 60)::integer);

      if v_minutes > 0 then
        update public.study_sessions
           set status           = 'finished',
               ended_at         = v_out,
               paused_at        = null,
               last_pause_auto  = false,
               minutes          = v_minutes,
               problems         = null,          -- 아직 모른다 → 다음 접속에 묻는다
               problems_pending = true
         where id = v_kim_sess;

        insert into public.study_logs as l (
          student_id, date, minutes, problems,
          academy_minutes, academy_problems, homework_minutes, homework_problems, updated_at
        )
        values (
          v_kim_stu, v_kim_date, v_minutes, 0,
          v_minutes, 0, 0, 0, now()
        )
        on conflict (student_id, date) do update
          set minutes          = l.minutes + excluded.minutes,
              academy_minutes  = l.academy_minutes + excluded.academy_minutes,
              updated_at       = now()
        returning * into v_log;

        select name into v_name from public.students where id = v_kim_stu;

        insert into public.audit_log (actor_kind, action, target, detail)
        values (
          'staff', 'restore_study_minutes', v_name,
          jsonb_build_object(
            'reason',           '2026-11-27 하원 직후 학원 세션이 0분으로 닫혀 공부시간 누락 — 원장님 승인 후 소급 복구',
            'minutes',          v_minutes,
            'check_in_at',      v_in,
            'check_out_at',     v_out,
            'study_log_id',     v_log.id,
            'attendance_id',    v_kim_att,
            'study_session_id', v_kim_sess
          )
        );

        raise notice '① 김도혁 %분 복구 (세션 %, 기록 %)', v_minutes, v_kim_sess, v_log.id;
      end if;
    end if;
  else
    raise notice '① 김도혁 — 이미 복구되었거나 대상이 아님 (session=%, minutes=%)', v_kim_sess, v_kim_mins;
  end if;

  ------------------------------------------------------------------
  -- ② 정시훈 11/27 중복 1분 세션 + 중복 합산 1분 정리
  ------------------------------------------------------------------
  select s.student_id, s.date, coalesce(s.minutes, 0)
    into v_dupe_stu, v_dupe_date, v_dupe_mins
    from public.study_sessions s
   where s.id = v_dupe_sess;

  if v_dupe_stu is not null then
    delete from public.study_sessions where id = v_dupe_sess;

    update public.study_logs
       set minutes          = greatest(0, minutes - v_dupe_mins),
           academy_minutes  = greatest(0, academy_minutes - v_dupe_mins),
           updated_at       = now()
     where student_id = v_dupe_stu and date = v_dupe_date
    returning * into v_log;

    select name into v_name from public.students where id = v_dupe_stu;

    insert into public.audit_log (actor_kind, action, target, detail)
    values (
      'staff', 'remove_duplicate_session', v_name,
      jsonb_build_object(
        'reason',           '2026-11-27 키오스크 토큰 버그로 겹쳐 찍힌 1분 중복 세션 정리(220분 1건만 남김)',
        'removed_session_id', v_dupe_sess,
        'removed_minutes',  v_dupe_mins,
        'date',             v_dupe_date,
        'study_log_id',     v_log.id,
        'log_minutes_after', v_log.minutes,
        'attendance_id',    '0691df92-b3bd-4a5b-bc16-e77a56783a11'
      )
    );

    raise notice '② 정시훈 1분 중복 세션 삭제 — 기록 %분', v_log.minutes;
  else
    raise notice '② 정시훈 — 이미 정리됨 (session=% 없음)', v_dupe_sess;
  end if;

  ------------------------------------------------------------------
  -- ③ 이지빈 0분 유령 대기 2건
  ------------------------------------------------------------------
  update public.study_sessions
     set problems         = coalesce(problems, 0),
         problems_pending = false
   where id = any (v_ghosts)
     and problems_pending
     and coalesce(minutes, 0) = 0;
  get diagnostics v_count = row_count;

  if v_count > 0 then
    select s.student_id into v_kim_stu from public.study_sessions s where s.id = v_ghosts[1];
    select name into v_name from public.students where id = v_kim_stu;

    insert into public.audit_log (actor_kind, action, target, detail)
    values (
      'staff', 'clear_stale_problem_pending', v_name,
      jsonb_build_object(
        'reason',     '0분 세션에 남은 문제 수 대기(학생 화면에 뜨지 않는 유령 대기) 정리',
        'session_ids', to_jsonb(v_ghosts),
        'count',      v_count
      )
    );
  end if;

  raise notice '③ 이지빈 0분 유령 대기 %건 정리', v_count;
end $$;

-- 확인 — 정리 뒤 2026-11-27 세 학생의 기록
select st.name,
       l.minutes,
       l.academy_minutes,
       (select count(*) from public.study_sessions s
         where s.student_id = st.id and s.date = '2026-11-27') as sessions,
       (select count(*) from public.study_sessions s
         where s.student_id = st.id and s.problems_pending and coalesce(s.minutes, 0) = 0) as ghost_pending
  from public.students st
  left join public.study_logs l on l.student_id = st.id and l.date = '2026-11-27'
 where st.name in ('김도혁', '정시훈', '이지빈')
 order by st.name;
