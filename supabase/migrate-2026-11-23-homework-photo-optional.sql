-- =====================================================================
--  선오공 — 숙제 공부를 사진 없이도 제출 (2026-11-23)
--  Supabase Dashboard > SQL Editor 에서 이 파일을 한 번 실행하세요.
--  여러 번 실행해도 안전합니다(create or replace).
--
--  · 예전에는 1문제 이상이면 숙제 사진이 1장 이상 있어야 했다(photo_required).
--    이제 사진은 필수가 아니다 — 사진 0장으로도 제출할 수 있다.
--    (사진 없이 내면 반려될 수 있다는 확인은 화면에서 한 번 더 묻는다)
--  · 5장을 넘는 사진은 예전처럼 too_many_photos 로 막는다. 그 밖의 규칙은 그대로다.
--  · 표(homework_submissions) 제약은 원래 최대 5장만 보고 최소 장수는 보지 않으므로
--    표·Storage 정책은 손대지 않는다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 학생이 숙제 공부를 제출 (타이머 화면 종료)
--    사진은 0장이어도 된다 (최대 5장).
-- ---------------------------------------------------------------------
create or replace function public.submit_homework(
  p_session_id  uuid,
  p_problems    integer,
  p_photo_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s       public.study_sessions;
  v_paths text[];
  v_problems integer := greatest(0, least(9999, coalesce(p_problems, 0)));
begin
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if coalesce(s.kind, 'academy') <> 'homework' then
    raise exception 'not_homework_session' using errcode = '22023';
  end if;

  v_paths := array(
    select p from (
      select distinct btrim(p) as p from unnest(coalesce(p_photo_paths, '{}'::text[])) as p
    ) t
    where coalesce(t.p, '') <> ''
  );

  if coalesce(array_length(v_paths, 1), 0) > 5 then
    raise exception 'too_many_photos' using errcode = '22023';
  end if;

  -- 사진은 필수가 아니다 (2026-11-23). 0장이면 화면이 확인을 받고 그대로 제출한다.
  return public.close_homework_session(s.id, v_problems, v_paths);
end;
$$;

-- ---------------------------------------------------------------------
-- 2. 자동 종료된 숙제 공부의 문제 수 · 사진 채우기 (다음 접속 때)
--    사진은 0장이어도 된다 (이미 올린 사진 + 이번 사진 합쳐 최대 5장).
-- ---------------------------------------------------------------------
create or replace function public.submit_pending_homework(
  p_submission_id uuid,
  p_problems      integer,
  p_photo_paths   text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s        public.homework_submissions;
  v_paths  text[];
  v_all    text[];
  v_problems integer := greatest(0, least(9999, coalesce(p_problems, 0)));
begin
  select * into s from public.homework_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'submission_not_found' using errcode = 'P0002';
  end if;

  if s.status <> 'pending' then
    raise exception 'already_reviewed' using errcode = '22023';
  end if;

  v_paths := array(
    select p from (
      select distinct btrim(p) as p from unnest(coalesce(p_photo_paths, '{}'::text[])) as p
    ) t
    where coalesce(t.p, '') <> ''
  );

  -- 이미 올린 사진 + 이번에 올린 사진 (5장까지)
  v_all := array(
    select p from (
      select distinct p from unnest(coalesce(s.photo_paths, '{}'::text[]) || coalesce(v_paths, '{}'::text[])) as p
    ) t
    where coalesce(t.p, '') <> ''
  );
  v_all := coalesce(v_all, '{}'::text[]);

  if coalesce(array_length(v_all, 1), 0) > 5 then
    raise exception 'too_many_photos' using errcode = '22023';
  end if;

  -- 사진은 필수가 아니다 (2026-11-23). 0장이면 화면이 확인을 받고 그대로 제출한다.
  update public.homework_submissions
     set submitted_problems = v_problems,
         photo_paths        = v_all,
         updated_at         = now()
   where id = s.id
   returning * into s;

  return to_jsonb(s);
end;
$$;
