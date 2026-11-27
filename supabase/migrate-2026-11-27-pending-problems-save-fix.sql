-- =====================================================================
--  선오공 — 「지난번 푼 문제 수」 저장이 막히던 문제 수정 (2026-11-27)
--  Supabase Dashboard > SQL Editor 에서 한 번 실행하세요.
--  여러 번 실행해도 안전합니다(create or replace / drop if exists).
--
--  ■ 증상
--    훈출(등·하원)이 연 학원 세션(attendance_id 있음)이 하원으로 마무리되면
--    problems_pending = true 로 남는다. 학생이 다음 접속에 뜨는 「지난번 푼 문제 수」 창에서
--    0을 누르고 「저장」해도 set_session_problems 가 session_managed_by_kiosk 로 거부되어
--    창이 닫히지 않았다(2026-11-27 이지빈 세션 f84fb01e… 에서 확인).
--
--  ■ 원인
--    migrate-2026-11-27-academy-zero-end-guard.sql 의 study_session_guard() 가
--    "학생 폰이 표를 직접 고쳤는지" 를 current_setting('role') 로 판단했다.
--    PostgREST 는 앱(anon 키)이 부르는 RPC 도 SET LOCAL ROLE anon 으로 실행하므로,
--    security definer 함수(set_session_problems · pause_session · resume_session ·
--    admin_end_study_session …)가 표를 고칠 때도 role='anon' 이 보여 정상 경로까지 막혔다.
--    (실DB 재현: attendance_id 가 있는 세션에 set_session_problems(0) → session_managed_by_kiosk,
--     attendance_id 가 없는 세션은 같은 호출이 정상 통과)
--
--  ■ 고침 — 트리거 함수를 security invoker 로 두고 current_user 로 판단한다
--      · 학생 폰이 표를 직접 고칠 때        → current_user = anon / authenticated  → 가드 적용
--      · 앱 RPC(security definer) 안에서     → current_user = postgres(함수 주인)   → 가드 통과
--      · 훈출 서버(service_role)            → current_user = service_role         → 가드 통과
--    가드 내용은 그대로다.
--      ① 훈출이 연 학원 세션(attendance_id 있음)은 학생 폰이 하트비트만 남길 수 있다
--      ② 어떤 세션이든 60초 미만에서 'finished' 로 바꿀 수 없다
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. study_session_guard — 역할 판별만 current_user 로 바꾼다
--    (security definer 였을 때는 함수 주인(postgres)으로 실행되어 안쪽에서
--     current_user 를 봐도 구분할 수 없었다. invoker 로 두어야 호출자를 본다.)
-- ---------------------------------------------------------------------
create or replace function public.study_session_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- '학생 폰(anon/authenticated)이 표를 직접 고쳤는지' 판단한다.
  --   · 직접 REST 쓰기     : PostgREST 가 SET LOCAL ROLE anon → current_user = anon
  --   · 앱 RPC(definer) 안 : 함수 주인으로 실행 → current_user = postgres
  if current_user <> 'anon' and current_user <> 'authenticated' then
    return new;
  end if;

  -- ① 훈출이 연 학원 세션은 학생 폰이 하트비트만 남길 수 있다
  if coalesce(old.kind, 'academy') = 'academy' and old.attendance_id is not null then
    if new.status          is distinct from old.status
       or new.minutes        is distinct from old.minutes
       or new.problems       is distinct from old.problems
       or new.ended_at       is distinct from old.ended_at
       or new.paused_at      is distinct from old.paused_at
       or new.paused_seconds is distinct from old.paused_seconds
       or new.started_at     is distinct from old.started_at
       or new.attendance_id  is distinct from old.attendance_id
       or new.date           is distinct from old.date then
      raise exception 'session_managed_by_kiosk' using errcode = '42501';
    end if;
  end if;

  -- ② 0분 종료 금지 (직접 쓰기 경로)
  if new.status = 'finished' and coalesce(old.status, '') <> 'finished' then
    if floor(extract(epoch from (coalesce(new.ended_at, now()) - old.started_at))) < public.academy_min_study_seconds() then
      raise exception 'academy_too_short' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.study_session_guard() is
  '학생 폰(anon/authenticated)의 직접 쓰기만 막는다 — 훈출 세션은 하트비트만, 60초 미만 종료 금지. 앱 RPC(definer)는 통과 (2026-11-27 수정)';

drop trigger if exists study_sessions_kiosk_guard on public.study_sessions;
create trigger study_sessions_kiosk_guard
  before update on public.study_sessions
  for each row execute function public.study_session_guard();

revoke all on function public.study_session_guard() from public;

-- 앱(PostgREST)이 바뀐 트리거를 바로 알게 한다
notify pgrst, 'reload schema';
