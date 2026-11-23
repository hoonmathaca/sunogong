-- =====================================================================
--  선오공 — 숙제 승인 때 「선생님 칭찬 한마디」 남기기
--  Supabase Dashboard > SQL Editor 에서 이 파일을 한 번 실행하세요.
--  여러 번 실행해도 안전합니다(if not exists / create or replace).
--
--  · 원장님이 「숙제관리」에서 시간·문항수를 승인할 때, 칭찬 문구 칩을 누르거나
--    짧은 메시지를 직접 적어 함께 저장할 수 있다(선택 사항 — 비워 두면 예전처럼 저장).
--  · 저장된 한마디는 학생 홈의 「숙제 제출」 카드에 민트색 「선생님 한마디: …」 박스로 보인다.
--  · 모두 반려한 제출에는 칭찬을 남기지 않는다(저장해도 비운다).
--  · 기존 앱(4개 인자로 부르던 화면)도 그대로 동작한다 — 새 인자의 기본값은 null.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 칭찬 한마디 열 (반려 사유 reject_reason 과 같은 자리, 최대 200자)
-- ---------------------------------------------------------------------
alter table public.homework_submissions
  add column if not exists teacher_comment text;

alter table public.homework_submissions
  drop constraint if exists homework_submissions_comment_len;
alter table public.homework_submissions
  add constraint homework_submissions_comment_len check (
    teacher_comment is null or length(teacher_comment) <= 200
  );

comment on column public.homework_submissions.teacher_comment is
  '원장님이 승인할 때 남긴 칭찬·응원 한마디 (학생 홈 숙제 제출 카드에 민트 박스로 보인다, 최대 200자)';

-- ---------------------------------------------------------------------
-- 2. 원장님 확인 — 칭찬 한마디를 함께 저장
--    · 승인한 항목만 study_logs 에 더한다 (그 날 학원 공부 기록과 합쳐진다)
--    · 반려한 항목은 0으로 확정한다 (다시 제출하지 않는다)
--    · 칭찬 한마디는 하나라도 승인했을 때만 남긴다 (모두 반려면 비운다)
--    · 4개 인자로 부르던 예전 화면과 호환되도록 새 인자는 기본값 null
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
  s          public.homework_submissions;
  v_minutes  integer;
  v_problems integer;
  v_any      boolean;
  v_status   text;
  v_comment  text;
  v_log      public.study_logs;
begin
  select * into s from public.homework_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'submission_not_found' using errcode = 'P0002';
  end if;

  if s.status <> 'pending' then
    raise exception 'already_reviewed' using errcode = '22023';
  end if;

  if coalesce(p_problems_approved, false) and s.submitted_problems is null then
    raise exception 'problems_unknown' using errcode = '22023';
  end if;

  v_comment := nullif(btrim(coalesce(p_teacher_comment, '')), '');
  if v_comment is not null and length(v_comment) > 200 then
    raise exception 'comment_too_long' using errcode = '22023';
  end if;

  v_minutes  := case when coalesce(p_time_approved, false) then greatest(0, coalesce(s.submitted_minutes, 0)) else 0 end;
  v_problems := case when coalesce(p_problems_approved, false) then greatest(0, coalesce(s.submitted_problems, 0)) else 0 end;
  v_any      := coalesce(p_time_approved, false) or coalesce(p_problems_approved, false);
  v_status   := case when v_any then 'approved' else 'rejected' end;

  if v_minutes > 0 or v_problems > 0 then
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
  else
    select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;
  end if;

  update public.homework_submissions
     set status           = v_status,
         time_verdict     = case when coalesce(p_time_approved, false) then 'approved' else 'rejected' end,
         problems_verdict = case when coalesce(p_problems_approved, false) then 'approved' else 'rejected' end,
         approved_minutes = v_minutes,
         approved_problems = v_problems,
         reject_reason    = nullif(btrim(coalesce(p_reject_reason, '')), ''),
         teacher_comment  = case when v_any then v_comment else null end,
         reviewed_at      = now(),
         reviewed_by      = '선오공이',
         updated_at       = now()
   where id = s.id
   returning * into s;

  -- 드래곤볼은 숙제 승인과 별개다 — 여기서 드래곤볼을 주지 않는다.
  return jsonb_build_object(
    'submission', to_jsonb(s),
    'log',        to_jsonb(v_log),
    'minutes',    v_minutes,
    'problems',   v_problems,
    'status',     v_status
  );
end;
$$;

grant execute on function public.review_homework_submission(uuid, boolean, boolean, text, text)
  to anon, authenticated;
