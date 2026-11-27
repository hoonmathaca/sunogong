-- =====================================================================
--  선오공 — 학생 화면 「공부 기록」 달력용 날짜별 조회 함수 (2026-11-28)
--  Supabase Dashboard > SQL Editor 에서 한 번 실행하세요.
--  여러 번 실행해도 안전합니다(create or replace).
--
--  ■ 무엇을 하나
--    학생 폰(anon 키)이 한 학생의 날짜별
--      · 등·하원 시각 (훈출 출결 attendance_sessions 의 실제 입·퇴실)
--      · 학원 공부 분·푼 문제 / 숙제 공부 분·푼 문제 (선오공 study_logs)
--    를 한 번에 읽는다. 화면은 이 값을 달력 점·날짜 상세에 쓴다.
--
--  ■ 왜 함수가 필요한가
--    · attendance_sessions 는 RLS 가 켜져 있고 정책이 없어 anon 키로는 401 이다.
--      → 지금 구조를 그대로 두고, 함수(security definer, 소유자 postgres)만 표를 읽는다.
--    · 돌려주는 값은 "한 학생의 날짜별 요약"뿐이라 원시 출결 행을 밖으로 열지 않는다.
--      (이름·좌석·찍은 사람·메모·study_session_id 는 내보내지 않는다)
--    · study_logs / study_sessions 는 이미 anon 에 열려 있지만, 등·하원의 원천인
--      attendance_sessions 만 닫혀 있었다. (2026-11-28 확인: 401 permission denied)
--
--  ■ 하루에 등·하원이 여러 번인 날 (좌석 이동·재입실 — 전체 1,445행 중 27일)
--    check_in_at  = 그날 첫 입실
--    check_out_at = 그날 마지막 퇴실 (아직 안 나간 방문이 하나라도 있으면 null)
--    visits       = 그날 입실 횟수
--
--  ■ 하원을 찍지 않아 자동 마감된 날 (close_reason='stale_auto', 1,445행 중 364행 = 25%)
--    check_out_auto = true → 화면은 "하원 미확인(자동 마감)" 으로 보여 준다.
--    (check_out_at 은 21:30 같은 마감 시각이라 실제 하원 시각이 아니다 — 그대로 보이면 학부모가 오해한다)
--
--  ■ 아직 학원에 있는 날 (check_out_at is null)
--    check_out_missing = true → 화면은 "아직 학원에 있어요" 로 보여 준다.
--
--  ※ attendance_sessions 는 훈출(키오스크)이 쓰는 표다. 선오공은 읽기만 한다.
-- =====================================================================

create or replace function public.student_day_records(
  p_student_id uuid,
  p_start      date,
  p_end        date
)
returns table (
  record_date       date,
  check_in_at       timestamptz,
  check_out_at      timestamptz,
  check_out_auto    boolean,
  check_out_missing boolean,
  visits            integer,
  academy_minutes   integer,
  academy_problems  integer,
  homework_minutes  integer,
  homework_problems integer
)
language sql
security definer
set search_path = public
stable
as $$
  with bounds as (
    -- 한 번에 너무 긴 기간을 묻지 못하게 400일로 자른다 (화면은 한 달씩 본다)
    select p_start as d0, least(p_end, p_start + 400) as d1
     where p_start is not null
       and p_end   is not null
  ),
  days as (
    select g::date as d
      from bounds, generate_series(bounds.d0, bounds.d1, interval '1 day') g
  ),
  att as (
    select a.session_date                                   as d,
           min(a.check_in_at)                               as in_at,
           count(*)::integer                                as visits,
           bool_or(a.check_out_at is null)                  as any_open,
           -- 마지막으로 들어온 방문의 퇴실 시각·마감 사유
           (array_agg(a.check_out_at   order by a.check_in_at desc, a.created_at desc))[1] as last_out,
           (array_agg(a.close_reason   order by a.check_in_at desc, a.created_at desc))[1] as last_reason
      from public.attendance_sessions a
     where a.student_id = p_student_id
       and a.session_date between (select d0 from bounds) and (select d1 from bounds)
     group by a.session_date
  )
  select days.d,
         att.in_at,
         case when coalesce(att.any_open, false) then null else att.last_out end,
         coalesce(not coalesce(att.any_open, false) and att.last_reason = 'stale_auto', false),
         coalesce(att.any_open, false),
         coalesce(att.visits, 0),
         coalesce(l.academy_minutes,   0),
         coalesce(l.academy_problems,  0),
         coalesce(l.homework_minutes,  0),
         coalesce(l.homework_problems, 0)
    from days
    left join att on att.d = days.d
    left join public.study_logs l
           on l.student_id = p_student_id
          and l.date       = days.d
   order by days.d;
$$;

-- 앱(anon)만 부르게 하고, 다른 사람이 만든 함수로 바꿔치기하지 못하게 search_path 를 고정했다.
revoke all on function public.student_day_records(uuid, date, date) from public;
grant execute on function public.student_day_records(uuid, date, date) to anon, authenticated, service_role;

-- 앱(PostgREST)이 새 함수를 바로 알게 한다
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 호출 (앱 — src/lib/api.ts 의 studentDayRecords)
--   supabase.rpc('student_day_records', {
--     p_student_id: student.id,
--     p_start: '2026-11-01',
--     p_end:   '2026-11-30',
--   })
--
-- 화면 규칙 (src/lib/studentCalendar.ts)
--   · 등원/하원 시각은 KST 로 바꿔 표시 (lib/time.ts 의 kstTimeString)
--   · check_out_missing → "15:36 등원 · 아직 학원에 있어요"
--   · check_out_auto    → "15:36 등원 · 하원 미확인(자동 마감)"
--   · check_in_at 없음  → "등·하원 기록 없음"
--   · 0분인데 푼 문제가 있으면 → "시간 기록 없음 · 푼 문제 47개"
--   · 2026-11-19 이전(선오공 도입 전)은 출결만 있고 공부 시간이 없다 → 시각만, "공부 시간 기록 없음"
-- ---------------------------------------------------------------------
