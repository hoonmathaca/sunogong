-- =====================================================================
--  선오공 — 숙제 사진 제출이 튕겨도 살아남게 (사진 초안 · 이어서 제출)
--  Supabase Dashboard > SQL Editor 에서 이 파일을 한 번 실행하세요.
--  여러 번 실행해도 안전합니다(if not exists / create or replace).
--
--  왜 필요한가
--  · 안드로이드에서 📷 바로 찍기로 카메라 앱을 열면, OS 가 배경 탭을 메모리에서
--    회수해 페이지가 새로고침(강제 reload)되는 일이 있다. 사진 2~3장째에서
--    탭이 튕기면 화면(React 상태)에만 있던 사진·문제 수가 통째로 사라져,
--    다시 들어왔을 때 "사진 없이 종료" 밖에 할 수 없었다.
--  · 그래서 사진을 고르는 즉시 1장씩 Storage 에 올리고, 그 경로와 입력 중인
--    문제 수를 homework_submissions 의 '초안(draft)' 줄에 바로 저장한다.
--    (draft_active = true 인 줄은 아직 제출이 아니라서 관리자·학생 목록에는 안 보인다)
--  · 탭이 튕겨 다시 접속하면 draft_open = true 인 초안을 찾아 '숙제 공부 제출'
--    창을 그대로 다시 열어 준다. 사진은 이미 서버에 있으므로 그대로 살아 있다.
--
--  더하는 것
--  1. homework_submissions 열: draft_active, draft_problems, draft_open
--  2. save_homework_draft(...)   — 사진 경로·문제 수·창 열림 상태를 초안에 저장
--  3. clear_homework_draft(...)  — 초안 줄 지우기(버리기)
--  4. close_homework_session(...) — 초안 줄이 있어도 세션을 제대로 마무리
--  5. pending_homework_submissions(...) — 초안 줄은 빼고 진짜 제출만
--  6. study_sessions 삭제 시 그 세션의 초안 줄 정리(트리거)
--  7. 권한
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 초안 열
-- ---------------------------------------------------------------------
alter table public.homework_submissions
  add column if not exists draft_active   boolean not null default false,
  add column if not exists draft_problems integer,
  add column if not exists draft_open     boolean not null default false;

comment on column public.homework_submissions.draft_active is
  '아직 제출 전인 초안 줄 (사진·문제 수만 저장). 관리자·학생 제출 목록에서는 뺀다';
comment on column public.homework_submissions.draft_problems is
  '초안에 입력 중인 문제 수 (제출하면 submitted_problems 로 옮긴다)';
comment on column public.homework_submissions.draft_open is
  '숙제 공부 제출 창이 열려 있었는지 — 탭이 튕겨 다시 접속하면 이 창을 그대로 다시 연다';

create index if not exists homework_submissions_draft_session_idx
  on public.homework_submissions (session_id)
  where draft_active;

-- ---------------------------------------------------------------------
-- 2. 초안 저장 — 사진 1장을 올릴 때마다 / 문제 수를 누를 때마다 / 창을 열고 닫을 때
--    · p_session_id   : 타이머 화면에서 마칠 때 (아직 안 끝난 세션)
--    · p_submission_id: 다음 접속 때 「지난 숙제 공부 제출」 창에서 (자동 종료된 제출)
--    · p_photo_paths  : 지금까지 담은 사진 경로 전체(빼면 목록에서도 빠진다)
--    · p_problems     : 지금까지 누른 문제 수 (아직 안 눌렀으면 null)
--    · p_open         : 제출 창이 열려 있는지
-- ---------------------------------------------------------------------
create or replace function public.save_homework_draft(
  p_session_id    uuid default null,
  p_submission_id uuid default null,
  p_problems      integer default null,
  p_photo_paths   text[] default '{}',
  p_open          boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s         public.study_sessions;
  v_sub     public.homework_submissions;
  v_paths   text[];
  v_minutes integer;
  v_problems integer;
begin
  -- 사진 경로 정리: 빈 값·중복을 빼고 5장까지만
  v_paths := array(
    select p from (
      select distinct btrim(p) as p from unnest(coalesce(p_photo_paths, '{}'::text[])) as p
    ) t
    where coalesce(t.p, '') <> ''
    limit 5
  );
  v_paths := coalesce(v_paths, '{}'::text[]);

  v_problems := case
    when p_problems is null then null
    else greatest(0, least(9999, p_problems))
  end;

  /* ── (가) 자동 종료된 제출에 이어서 담기 ─────────────────────────── */
  if p_submission_id is not null then
    select * into v_sub from public.homework_submissions where id = p_submission_id for update;
    if not found then
      raise exception 'submission_not_found' using errcode = 'P0002';
    end if;
    if v_sub.status <> 'pending' then
      raise exception 'already_reviewed' using errcode = '22023';
    end if;

    update public.homework_submissions
       set photo_paths    = v_paths,
           draft_problems = v_problems,
           draft_open     = coalesce(p_open, true),
           updated_at     = now()
     where id = v_sub.id
     returning * into v_sub;

    return jsonb_build_object(
      'submission',  to_jsonb(v_sub),
      'photo_paths', v_sub.photo_paths,
      'problems',    v_sub.draft_problems,
      'open',        v_sub.draft_open
    );
  end if;

  /* ── (나) 아직 마치지 않은 숙제 세션의 초안 ───────────────────────── */
  if p_session_id is null then
    raise exception 'draft_target_required' using errcode = '22023';
  end if;

  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if coalesce(s.kind, 'academy') <> 'homework' then
    raise exception 'not_homework_session' using errcode = '22023';
  end if;
  if s.status = 'finished' then
    raise exception 'session_finished' using errcode = '22023';
  end if;

  -- 지금까지의 공부 시간(분) — 제출 전 미리 보여 주기용 (마칠 때 다시 계산한다)
  v_minutes := greatest(
    0,
    least(
      300,
      floor(
        greatest(
          0,
          extract(epoch from (
            coalesce(case when s.status = 'paused' then s.paused_at end, now()) - s.started_at
          )) - coalesce(s.paused_seconds, 0)
        ) / 60
      )::integer
    )
  );

  select * into v_sub from public.homework_submissions where session_id = s.id for update;

  if found then
    if not v_sub.draft_active then
      -- 이미 진짜 제출로 마무리된 세션 — 초안으로 되돌리지 않는다
      raise exception 'already_submitted' using errcode = '22023';
    end if;

    update public.homework_submissions
       set photo_paths       = v_paths,
           draft_problems    = v_problems,
           draft_open        = coalesce(p_open, true),
           submitted_minutes = v_minutes,
           started_at        = coalesce(started_at, s.started_at),
           date              = s.date,
           updated_at        = now()
     where id = v_sub.id
     returning * into v_sub;
  else
    insert into public.homework_submissions (
      student_id, session_id, date, started_at, ended_at,
      submitted_minutes, submitted_problems, photo_paths, status,
      draft_active, draft_problems, draft_open, submitted_at
    )
    values (
      s.student_id, s.id, s.date, s.started_at, null,
      v_minutes, null, v_paths, 'pending',
      true, v_problems, coalesce(p_open, true), now()
    )
    returning * into v_sub;
  end if;

  return jsonb_build_object(
    'submission',  to_jsonb(v_sub),
    'photo_paths', v_sub.photo_paths,
    'problems',    v_sub.draft_problems,
    'open',        v_sub.draft_open
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. 초안 지우기 — 학생이 그만두거나, 1분도 공부하지 않아 남길 것이 없을 때
--    (진짜 제출 줄은 draft_active = false 라 지워지지 않는다)
-- ---------------------------------------------------------------------
create or replace function public.clear_homework_draft(
  p_session_id    uuid default null,
  p_submission_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_session_id is null and p_submission_id is null then
    raise exception 'draft_target_required' using errcode = '22023';
  end if;

  delete from public.homework_submissions
   where draft_active
     and (
       (p_submission_id is not null and id = p_submission_id)
       or (p_session_id is not null and session_id = p_session_id)
     );
  get diagnostics v_count = row_count;

  return jsonb_build_object('deleted', v_count);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. 숙제 세션 마무리 — 초안 줄이 있어도 세션을 제대로 마무리한다
--    finish_session(학생이 직접 종료) · auto_end_paused_session(60분 자동 종료) ·
--    submit_homework(사진과 함께 제출) 이 모두 이 함수를 거친다.
--    같은 세션으로 두 번 불러도 제출 줄은 한 번만 생긴다.
-- ---------------------------------------------------------------------
create or replace function public.close_homework_session(
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
  s           public.study_sessions;
  v_end       timestamptz;
  v_cap       timestamptz;
  v_secs      integer;
  v_mins      integer;
  v_problems  integer;
  v_paths     text[];
  v_sub       public.homework_submissions;
  v_existing  uuid;
  v_draft     integer;
  v_log       public.study_logs;
begin
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if coalesce(s.kind, 'academy') <> 'homework' then
    raise exception 'not_homework_session' using errcode = '22023';
  end if;

  if coalesce(array_length(p_photo_paths, 1), 0) > 5 then
    raise exception 'too_many_photos' using errcode = '22023';
  end if;

  -- 사진 경로 정리: 빈 값·중복을 빼고 5장까지만
  v_paths := array(
    select p from (
      select distinct btrim(p) as p from unnest(coalesce(p_photo_paths, '{}'::text[])) as p
    ) t
    where coalesce(t.p, '') <> ''
    limit 5
  );
  v_paths := coalesce(v_paths, '{}'::text[]);

  -- 이 세션의 제출 줄(초안 포함)이 이미 있는지
  select id into v_existing from public.homework_submissions where session_id = s.id;
  select draft_problems into v_draft from public.homework_submissions where session_id = s.id;

  /* ── 이미 마무리된 세션 ──────────────────────────────────────────── */
  if s.status = 'finished' then
    if v_existing is not null then
      select * into v_sub from public.homework_submissions where id = v_existing for update;

      if v_sub.status = 'pending' then
        update public.homework_submissions
           set submitted_problems = coalesce(
                 case when coalesce(p_problems, 0) > 0 then greatest(0, least(9999, p_problems)) end,
                 submitted_problems
               ),
               photo_paths = case
                 when coalesce(array_length(v_paths, 1), 0) > 0
                      and coalesce(array_length(photo_paths, 1), 0) = 0
                   then v_paths
                 else photo_paths
               end,
               draft_active = false,
               draft_open   = false,
               updated_at   = now()
         where id = v_sub.id
         returning * into v_sub;
      end if;

      select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;

      return jsonb_build_object(
        'session',            to_jsonb(s),
        'submission',         to_jsonb(v_sub),
        'submission_id',      v_sub.id,
        'log',                to_jsonb(v_log),
        'seconds',            coalesce(s.minutes, 0) * 60,
        'minutes',            coalesce(s.minutes, 0),
        'problems',           coalesce(v_sub.submitted_problems, 0),
        'submitted_minutes',  v_sub.submitted_minutes,
        'submitted_problems', v_sub.submitted_problems,
        'total_minutes',      coalesce(v_log.minutes, 0),
        'total_problems',     coalesce(v_log.problems, 0),
        'date',               s.date,
        'kind',               'homework',
        'pending_approval',   true,
        'already',            true
      );
    end if;

    -- 서버가 5시간 초과로 먼저 마무리해 둔 세션 — 시간은 그대로 쓰고 기록만 승인 대기로 남긴다
    v_mins := coalesce(s.minutes, 0);
    if coalesce(p_problems, 0) > 0 then
      v_problems := greatest(0, least(9999, p_problems));
    else
      v_problems := coalesce(s.problems, v_draft);   -- 비어 있으면 그대로 비워 둔다(다음 접속 때 받는다)
    end if;
  else
    /* ── 아직 안 끝난 세션 — 지금 마무리한다 (초안 줄이 있어도 OK) ──── */
    v_end := case when s.status = 'paused' then coalesce(s.paused_at, now()) else now() end;

    -- 그 날 자정을 넘긴 공부는 기록하지 않고 세션만 버린다 (예전 규칙과 같다)
    v_cap := ((s.date + 1)::timestamp at time zone 'Asia/Seoul') - interval '1 second';
    if v_end > v_cap then
      delete from public.homework_submissions where session_id = s.id and draft_active;
      delete from public.study_sessions where id = s.id;

      select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;

      return jsonb_build_object(
        'session',          null,
        'submission',       null,
        'log',              null,
        'seconds',          0,
        'minutes',          0,
        'problems',         0,
        'total_minutes',    coalesce(v_log.minutes, 0),
        'total_problems',   coalesce(v_log.problems, 0),
        'date',             s.date,
        'kind',             'homework',
        'pending_approval', false,
        'discarded',        true
      );
    end if;

    v_secs := greatest(0, floor(extract(epoch from (v_end - s.started_at)))::integer - s.paused_seconds);
    if v_secs > 18000 then
      v_secs := 18000;
    end if;
    v_mins := (v_secs / 60)::integer;

    -- 문제 수: 이번에 온 값 → 세션 값 → 초안에 입력해 둔 값 순서로 쓴다.
    -- (60분 자동 종료는 값을 보내지 않는다 — 그때는 초안의 문제 수를 살린다)
    if p_problems is null and coalesce(s.problems, v_draft) is null then
      v_problems := null;
    else
      v_problems := greatest(0, least(9999, coalesce(p_problems, s.problems, v_draft, 0)));
    end if;

    update public.study_sessions
       set status           = 'finished',
           ended_at         = v_end,
           paused_at        = null,
           last_pause_auto  = false,
           minutes          = v_mins,
           problems         = v_problems,
           problems_pending = false
     where id = s.id
     returning * into s;

    select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;

    -- 1분도 공부하지 않았고 문제 수도 없으면 승인할 것이 없다 (기록 줄을 만들지 않는다)
    if v_mins <= 0 and coalesce(v_problems, 0) <= 0 then
      -- 그때 남아 있던 초안 줄(사진만)은 지운다 — 화면에서도 사진을 지운다
      delete from public.homework_submissions where session_id = s.id and draft_active;

      return jsonb_build_object(
        'session',          to_jsonb(s),
        'submission',       null,
        'log',              to_jsonb(v_log),
        'seconds',          v_secs,
        'minutes',          v_mins,
        'problems',         v_problems,
        'total_minutes',    coalesce(v_log.minutes, 0),
        'total_problems',   coalesce(v_log.problems, 0),
        'date',             s.date,
        'kind',             'homework',
        'pending_approval', false,
        'nothing',          true
      );
    end if;
  end if;

  /* ── 제출 줄: 초안이 있으면 그 줄을 채우고, 없으면 새로 만든다 ──────── */
  if v_existing is not null then
    select * into v_sub from public.homework_submissions where id = v_existing for update;

    if v_sub.status = 'pending' then
      -- 초안에 있던 사진 + 이번에 보낸 사진 (5장까지)
      update public.homework_submissions
         set date               = s.date,
             started_at         = coalesce(started_at, s.started_at),
             ended_at           = coalesce(s.ended_at, v_end),
             submitted_minutes  = v_mins,
             submitted_problems = v_problems,
             photo_paths        = (
               select coalesce(array_agg(p), '{}'::text[]) from (
                 select distinct p from unnest(
                   coalesce(photo_paths, '{}'::text[]) || coalesce(v_paths, '{}'::text[])
                 ) as p
                 where coalesce(p, '') <> ''
                 limit 5
               ) t
             ),
             status             = 'pending',
             draft_active       = false,
             draft_problems     = null,
             draft_open         = false,
             submitted_at       = coalesce(submitted_at, now()),
             updated_at         = now()
       where id = v_sub.id
       returning * into v_sub;
    end if;
  else
    insert into public.homework_submissions (
      student_id, session_id, date, started_at, ended_at,
      submitted_minutes, submitted_problems, photo_paths, status, submitted_at
    )
    values (
      s.student_id, s.id, s.date, s.started_at, coalesce(s.ended_at, v_end),
      v_mins, v_problems, v_paths, 'pending', now()
    )
    returning * into v_sub;
  end if;

  select * into v_log from public.study_logs where student_id = s.student_id and date = s.date;

  return jsonb_build_object(
    'session',            to_jsonb(s),
    'submission',         to_jsonb(v_sub),
    'submission_id',      v_sub.id,
    'log',                to_jsonb(v_log),
    'seconds',            v_secs,
    'minutes',            v_mins,
    'problems',           v_problems,
    'submitted_minutes',  v_sub.submitted_minutes,
    'submitted_problems', v_sub.submitted_problems,
    'total_minutes',      coalesce(v_log.minutes, 0),
    'total_problems',     coalesce(v_log.problems, 0),
    'date',               s.date,
    'kind',               'homework',
    'pending_approval',   true
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. 자동 종료된 숙제 공부 중 문제 수를 아직 받지 못한 제출 (학생 다음 접속)
--    초안 줄(draft_active)은 빼고 진짜 제출만 물어본다.
-- ---------------------------------------------------------------------
create or replace function public.pending_homework_submissions(p_student_id uuid)
returns setof public.homework_submissions
language sql
stable
security definer
set search_path = public
as $$
  select *
    from public.homework_submissions
   where student_id = p_student_id
     and status = 'pending'
     and not draft_active
     and submitted_problems is null
     and date >= (public.kst_today() - 30)
   order by coalesce(ended_at, created_at) asc, created_at asc;
$$;

-- ---------------------------------------------------------------------
-- 6. 세션이 지워지면(자정 넘김 등) 그 세션의 초안 줄도 함께 정리
-- ---------------------------------------------------------------------
create or replace function public.drop_session_homework_draft()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.homework_submissions where session_id = old.id and draft_active;
  return old;
end;
$$;

drop trigger if exists study_sessions_drop_homework_draft on public.study_sessions;
create trigger study_sessions_drop_homework_draft
  before delete on public.study_sessions
  for each row execute function public.drop_session_homework_draft();

-- ---------------------------------------------------------------------
-- 7. 권한
-- ---------------------------------------------------------------------
grant execute on function public.save_homework_draft(uuid, uuid, integer, text[], boolean) to anon, authenticated;
grant execute on function public.clear_homework_draft(uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
