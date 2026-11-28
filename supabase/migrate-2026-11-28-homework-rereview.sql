-- =====================================================================
--  선오공 — 2026-11-28 추가 마이그레이션
--  이미 승인/반려한 숙제 제출을 다시 열어 고치기 (승인 ↔ 반려 되돌리기)
--
--  Supabase Dashboard > SQL Editor 에 이 파일을 그대로 붙여넣고 실행하세요.
--  여러 번 실행해도 안전하며, 기존 학생·공부 기록은 건드리지 않습니다.
--
--  바뀌는 것
--   1) review_homework_submission 이 status = 'pending' 이 아닌 제출도 받는다.
--      · 이전 결정(approved_minutes·approved_problems)을 그날 study_logs 에서 먼저 빼고,
--        새 결정을 다시 더한다 (GREATEST(0, …) 로 음수 방지).
--      · 예) 40분 승인 → 모두 반려로 고침 : homework_minutes 40 → 0
--            0분 반려 → 시간만 승인으로 고침 : 0 → 40
--      · 숙제 기록이 0만 남으면 그날 study_logs 줄을 지운다 (처음부터 반려였을 때와 같은 상태).
--   2) 수정 이력 : first_reviewed_at(처음 확인한 시각, 이후 고쳐도 그대로),
--      reviewed_at(마지막으로 저장한 시각), review_edit_count(고친 횟수).
--   3) attendance_sessions(훈출 등·하원)와 드래곤볼은 건드리지 않는다.
--      (드래곤볼은 원래 숙제 승인과 별개로 세션 종료 때 한 번만 지급된다)
--
--  되돌리려면 : 이 파일의 함수를 2026-11-23 판(already_reviewed 로 막던 것)으로 바꾸면 된다.
--  검증 : supabase/verify-2026-11-28-homework-rereview.sql (T1~T8)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 수정 이력 열
-- ---------------------------------------------------------------------
alter table public.homework_submissions
  add column if not exists first_reviewed_at  timestamptz,
  add column if not exists review_edit_count  integer not null default 0;

comment on column public.homework_submissions.first_reviewed_at is
  '처음 승인/반려한 시각 — 이후 고쳐도 그대로 (reviewed_at 은 마지막 저장 시각)';
comment on column public.homework_submissions.review_edit_count is
  '이미 확인한 제출을 다시 고쳐 저장한 횟수 (처음 확인은 0)';

-- 이미 확인해 둔 제출은 처음 확인 시각을 reviewed_at 으로 채워 둔다
update public.homework_submissions
   set first_reviewed_at = reviewed_at
 where first_reviewed_at is null
   and reviewed_at is not null;

-- ---------------------------------------------------------------------
-- 2. review_homework_submission — 다시 고쳐 저장할 수 있게
--    · pending → 첫 확인 (지금과 같다)
--    · approved/rejected → 고치기 : 이전 승인분을 빼고 새 승인분을 더한다
-- ---------------------------------------------------------------------
drop function if exists public.review_homework_submission(uuid, boolean, boolean, text);

create or replace function public.review_homework_submission(
  p_submission_id     uuid,
  p_time_approved     boolean,
  p_problems_approved boolean,
  p_reject_reason     text default null,
  p_teacher_comment   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s               public.homework_submissions;
  v_minutes       integer;
  v_problems      integer;
  v_any           boolean;
  v_status        text;
  v_comment       text;
  v_prev_status   text;
  v_prev_minutes  integer;
  v_prev_problems integer;
  v_edited        boolean;
  v_found         boolean := false;
  v_log           public.study_logs;
begin
  select * into s from public.homework_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'submission_not_found' using errcode = 'P0002';
  end if;

  -- 아직 제출 전인 초안 줄은 확인할 수 없다
  if s.draft_active then
    raise exception 'submission_not_found' using errcode = 'P0002';
  end if;

  if coalesce(p_problems_approved, false) and s.submitted_problems is null then
    raise exception 'problems_unknown' using errcode = '22023';
  end if;

  v_comment := nullif(btrim(coalesce(p_teacher_comment, '')), '');
  if v_comment is not null and length(v_comment) > 200 then
    raise exception 'comment_too_long' using errcode = '22023';
  end if;

  -- 이전 결정 — 처음 확인(pending)이면 아직 기록에 아무것도 들어가지 않았다
  v_prev_status   := s.status;
  v_edited        := s.status <> 'pending';
  v_prev_minutes  := case when v_edited then greatest(0, coalesce(s.approved_minutes, 0))  else 0 end;
  v_prev_problems := case when v_edited then greatest(0, coalesce(s.approved_problems, 0)) else 0 end;

  -- 새 결정
  v_minutes  := case when coalesce(p_time_approved, false) then greatest(0, coalesce(s.submitted_minutes, 0)) else 0 end;
  v_problems := case when coalesce(p_problems_approved, false) then greatest(0, coalesce(s.submitted_problems, 0)) else 0 end;
  v_any      := coalesce(p_time_approved, false) or coalesce(p_problems_approved, false);
  v_status   := case when v_any then 'approved' else 'rejected' end;

  -- 그날 기록에서 이전 승인분을 빼고 새 승인분을 더한다 (학원 공부 몫은 그대로)
  --   minutes/problems 는 학원+숙제 합계라 같은 차이만큼 함께 움직인다.
  update public.study_logs as l
     set minutes           = greatest(0, l.minutes           - v_prev_minutes  + v_minutes),
         problems          = greatest(0, l.problems          - v_prev_problems + v_problems),
         homework_minutes  = greatest(0, l.homework_minutes  - v_prev_minutes  + v_minutes),
         homework_problems = greatest(0, l.homework_problems - v_prev_problems + v_problems),
         updated_at        = now()
   where l.student_id = s.student_id
     and l.date       = s.date
   returning * into v_log;
  v_found := found;

  -- 그날 기록 줄이 없고 새로 승인한 값이 있으면 만든다
  if not v_found and (v_minutes > 0 or v_problems > 0) then
    insert into public.study_logs as l (
      student_id, date, minutes, problems,
      academy_minutes, academy_problems, homework_minutes, homework_problems, updated_at
    )
    values (
      s.student_id, s.date, v_minutes, v_problems,
      0, 0, v_minutes, v_problems, now()
    )
    on conflict (student_id, date) do update
      set minutes           = l.minutes + excluded.minutes,
          problems          = l.problems + excluded.problems,
          homework_minutes  = l.homework_minutes + excluded.homework_minutes,
          homework_problems = l.homework_problems + excluded.homework_problems,
          updated_at        = now()
    returning * into v_log;
    v_found := true;
  end if;

  -- 모두 반려로 고쳐 그날 기록이 0만 남으면 줄을 지운다 (처음부터 반려였을 때와 같은 상태)
  if v_found
     and coalesce(v_log.minutes, 0) = 0
     and coalesce(v_log.problems, 0) = 0
     and coalesce(v_log.academy_minutes, 0) = 0
     and coalesce(v_log.academy_problems, 0) = 0
     and coalesce(v_log.homework_minutes, 0) = 0
     and coalesce(v_log.homework_problems, 0) = 0 then
    delete from public.study_logs where id = v_log.id;
    v_log := null;
  end if;

  update public.homework_submissions
     set status            = v_status,
         time_verdict      = case when coalesce(p_time_approved, false) then 'approved' else 'rejected' end,
         problems_verdict  = case when coalesce(p_problems_approved, false) then 'approved' else 'rejected' end,
         approved_minutes  = v_minutes,
         approved_problems = v_problems,
         reject_reason     = nullif(btrim(coalesce(p_reject_reason, '')), ''),
         teacher_comment   = case when v_any then v_comment else null end,
         reviewed_at       = now(),
         first_reviewed_at = coalesce(s.first_reviewed_at, s.reviewed_at, now()),
         review_edit_count = coalesce(s.review_edit_count, 0) + case when v_edited then 1 else 0 end,
         reviewed_by       = '선오공이',
         updated_at        = now()
   where id = s.id
   returning * into s;

  -- 드래곤볼은 숙제 승인과 별개다 — 여기서 드래곤볼을 주지 않는다.
  -- (훈출 등·하원 attendance_sessions 도 건드리지 않는다)
  return jsonb_build_object(
    'submission',        to_jsonb(s),
    'log',               to_jsonb(v_log),
    'minutes',           v_minutes,
    'problems',          v_problems,
    'status',            v_status,
    'edited',            v_edited,
    'previous_status',   v_prev_status,
    'previous_minutes',  v_prev_minutes,
    'previous_problems', v_prev_problems
  );
end;
$$;

grant execute on function public.review_homework_submission(uuid, boolean, boolean, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
