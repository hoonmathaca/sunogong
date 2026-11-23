-- =====================================================================
-- 2026-11-23 추가: 문제 수 0~999 상한 · 학생이 오늘 학원 공부 문제 수 수정
--   · 학생 입력 경로(finish_session · set_session_problems · close_homework_session
--     · submit_homework · submit_pending_homework)는 999 초과를 거부한다
--   · 관리자 「수업 종료」도 세션 단위 문제 수는 999 까지 (하루 합산은 LogEditorModal 에서 그대로)
--   · student_update_today_academy_problems — 오늘 학원 공부 문제 수만 0~999 로 수정
-- =====================================================================

create or replace function public.finish_session(p_session_id uuid, p_problems integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.study_sessions;
  v_now      timestamptz := now();
  v_end      timestamptz;
  v_cap      timestamptz;
  v_secs     integer;
  v_mins     integer;
  v_problems integer;
  v_kind     text;
  v_log      public.study_logs;
begin
  -- 문제 수는 학생이 입력할 수 있는 0~999 만 받는다 (2026-11-23)
  if p_problems is not null and (p_problems < 0 or p_problems > 999) then
    raise exception 'problems_out_of_range' using errcode = '22023';
  end if;

  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  -- 숙제 공부는 사진·문제 수와 함께 승인 대기로 넘긴다 (study_logs 에 바로 넣지 않는다)
  if coalesce(s.kind, 'academy') = 'homework' then
    return public.close_homework_session(s.id, p_problems, '{}'::text[]);
  end if;

  -- 이미 끝난 세션이면 그대로 돌려준다 (같은 요청이 두 번 와도 기록이 두 번 쌓이지 않음)
  if s.status = 'finished' then
    select * into v_log
      from public.study_logs
     where student_id = s.student_id and date = s.date;

    return jsonb_build_object(
      'session',        to_jsonb(s),
      'log',            to_jsonb(v_log),
      'seconds',        coalesce(s.minutes, 0) * 60,
      'minutes',        coalesce(s.minutes, 0),
      'problems',       coalesce(s.problems, 0),
      'total_minutes',  coalesce(v_log.minutes, 0),
      'total_problems', coalesce(v_log.problems, 0),
      'date',           s.date,
      'kind',           s.kind
    );
  end if;

  v_end := case when s.status = 'paused' then coalesce(s.paused_at, v_now) else v_now end;

  -- 그 날 자정을 넘긴 공부는 기록하지 않고 세션만 버린다 (12시 전에 종료를 누르지 않은 경우)
  v_cap := ((s.date + 1)::timestamp at time zone 'Asia/Seoul') - interval '1 second';
  if v_end > v_cap then
    delete from public.study_sessions where id = s.id;

    select * into v_log
      from public.study_logs
     where student_id = s.student_id and date = s.date;

    return jsonb_build_object(
      'session',        null,
      'log',            null,
      'seconds',        0,
      'minutes',        0,
      'problems',       0,
      'total_minutes',  coalesce(v_log.minutes, 0),
      'total_problems', coalesce(v_log.problems, 0),
      'date',           s.date,
      'kind',           s.kind,
      'discarded',      true
    );
  end if;

  v_secs := greatest(0, floor(extract(epoch from (v_end - s.started_at)))::integer - s.paused_seconds);
  if v_secs > 18000 then
    v_secs := 18000;
  end if;
  v_mins := (v_secs / 60)::integer;

  v_problems := greatest(0, coalesce(p_problems, s.problems, 0));
  v_kind     := case when s.kind = 'homework' then 'homework' else 'academy' end;

  update public.study_sessions
     set status          = 'finished',
         ended_at        = v_end,
         paused_at       = null,
         last_pause_auto = false,
         minutes         = v_mins,
         problems        = v_problems
   where id = s.id
   returning * into s;

  insert into public.study_logs as l (
    student_id, date, minutes, problems,
    academy_minutes, academy_problems, homework_minutes, homework_problems, updated_at
  )
  values (
    s.student_id, s.date, v_mins, v_problems,
    case when v_kind = 'academy'  then v_mins     else 0 end,
    case when v_kind = 'academy'  then v_problems else 0 end,
    case when v_kind = 'homework' then v_mins     else 0 end,
    case when v_kind = 'homework' then v_problems else 0 end,
    now()
  )
  on conflict (student_id, date) do update
    set minutes           = l.minutes + excluded.minutes,
        problems          = l.problems + excluded.problems,
        academy_minutes   = l.academy_minutes + excluded.academy_minutes,
        academy_problems  = l.academy_problems + excluded.academy_problems,
        homework_minutes  = l.homework_minutes + excluded.homework_minutes,
        homework_problems = l.homework_problems + excluded.homework_problems,
        updated_at        = now()
  returning * into v_log;

  return jsonb_build_object(
    'session',        to_jsonb(s),
    'log',            to_jsonb(v_log),
    'seconds',        v_secs,
    'minutes',        v_mins,
    'problems',       v_problems,
    'total_minutes',  coalesce(v_log.minutes, 0),
    'total_problems', coalesce(v_log.problems, 0),
    'date',           s.date,
    'kind',           v_kind
  );
end;
$$;

create or replace function public.set_session_problems(p_session_id uuid, p_problems integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.study_sessions;
  v_problems integer := greatest(0, least(999, coalesce(p_problems, 0)));
  v_kind     text;
  v_log      public.study_logs;
begin
  -- 문제 수는 학생이 입력할 수 있는 0~999 만 받는다 (2026-11-23)
  if p_problems is not null and (p_problems < 0 or p_problems > 999) then
    raise exception 'problems_out_of_range' using errcode = '22023';
  end if;

  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if s.status <> 'finished' then
    raise exception 'session_not_finished' using errcode = 'P0002';
  end if;

  if not s.problems_pending then
    raise exception 'problems_not_pending' using errcode = 'P0002';
  end if;

  v_kind := case when s.kind = 'homework' then 'homework' else 'academy' end;

  update public.study_sessions
     set problems         = v_problems,
         problems_pending = false
   where id = s.id
   returning * into s;

  update public.study_logs
     set problems          = problems + v_problems,
         academy_problems  = academy_problems  + case when v_kind = 'academy'  then v_problems else 0 end,
         homework_problems = homework_problems + case when v_kind = 'homework' then v_problems else 0 end,
         updated_at        = now()
   where student_id = s.student_id and date = s.date
   returning * into v_log;

  -- 그 날 기록이 지워졌으면 세션 시간으로 다시 만들어 둔다
  if v_log.id is null then
    insert into public.study_logs as l (
      student_id, date, minutes, problems,
      academy_minutes, academy_problems, homework_minutes, homework_problems, updated_at
    )
    values (
      s.student_id, s.date, coalesce(s.minutes, 0), v_problems,
      case when v_kind = 'academy'  then coalesce(s.minutes, 0) else 0 end,
      case when v_kind = 'academy'  then v_problems else 0 end,
      case when v_kind = 'homework' then coalesce(s.minutes, 0) else 0 end,
      case when v_kind = 'homework' then v_problems else 0 end,
      now()
    )
    on conflict (student_id, date) do update
      set problems          = l.problems + excluded.problems,
          academy_problems  = l.academy_problems  + excluded.academy_problems,
          homework_problems = l.homework_problems + excluded.homework_problems,
          updated_at        = now()
    returning * into v_log;
  end if;

  return jsonb_build_object(
    'session',          to_jsonb(s),
    'log',              to_jsonb(v_log),
    'problems',         v_problems,
    'minutes',          coalesce(s.minutes, 0),
    'total_minutes',    coalesce(v_log.minutes, 0),
    'total_problems',   coalesce(v_log.problems, 0),
    'date',             s.date,
    'kind',             v_kind,
    'problems_pending', false
  );
end;
$$;

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
  -- 문제 수는 학생이 입력할 수 있는 0~999 만 받는다 (2026-11-23)
  if p_problems is not null and (p_problems < 0 or p_problems > 999) then
    raise exception 'problems_out_of_range' using errcode = '22023';
  end if;

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
                 case when coalesce(p_problems, 0) > 0 then greatest(0, least(999, p_problems)) end,
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
      v_problems := greatest(0, least(999, p_problems));
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
      v_problems := greatest(0, least(999, coalesce(p_problems, s.problems, v_draft, 0)));
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
  v_problems integer := greatest(0, least(999, coalesce(p_problems, 0)));
begin
  -- 문제 수는 학생이 입력할 수 있는 0~999 만 받는다 (2026-11-23)
  if p_problems is not null and (p_problems < 0 or p_problems > 999) then
    raise exception 'problems_out_of_range' using errcode = '22023';
  end if;

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
  v_problems integer := greatest(0, least(999, coalesce(p_problems, 0)));
begin
  -- 문제 수는 학생이 입력할 수 있는 0~999 만 받는다 (2026-11-23)
  if p_problems is not null and (p_problems < 0 or p_problems > 999) then
    raise exception 'problems_out_of_range' using errcode = '22023';
  end if;

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
    else greatest(0, least(999, p_problems))
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

create or replace function public.admin_end_study_session(p_session_id uuid, p_problems integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s          public.study_sessions;
  v_problems integer;
  v_kind     text;
  v_res      jsonb;
  v_log      public.study_logs;
  v_sub      public.homework_submissions;
begin
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  v_problems := greatest(0, least(999, coalesce(p_problems, 0)));
  v_kind     := case when s.kind = 'homework' then 'homework' else 'academy' end;

  -- 이미 끝난 세션 — 기록을 건드리지 않고 지금 상태만 돌려준다
  if s.status = 'finished' then
    select * into v_log
      from public.study_logs
     where student_id = s.student_id and date = s.date;

    if v_kind = 'homework' then
      select * into v_sub from public.homework_submissions where session_id = s.id;
    end if;

    return jsonb_build_object(
      'session',            to_jsonb(s),
      'log',                to_jsonb(v_log),
      'submission',         to_jsonb(v_sub),
      'submission_id',      v_sub.id,
      'seconds',            coalesce(s.minutes, 0) * 60,
      'minutes',            coalesce(s.minutes, 0),
      'problems',           coalesce(v_sub.submitted_problems, s.problems, 0),
      'submitted_minutes',  v_sub.submitted_minutes,
      'submitted_problems', v_sub.submitted_problems,
      'total_minutes',      coalesce(v_log.minutes, 0),
      'total_problems',     coalesce(v_log.problems, 0),
      'date',               s.date,
      'kind',               v_kind,
      'problems_pending',   coalesce(s.problems_pending, false),
      'auto_ended',         coalesce(s.auto_ended, false),
      'pending_approval',   (v_kind = 'homework' and v_sub.id is not null),
      'discarded',          false,
      'already_finished',   true,
      'ended_by_admin',     s.ended_by_admin
    );
  end if;

  -- 숙제 공부 — 기존 규칙대로 승인 대기 제출로 넘긴다 (사진은 세션의 초안이 있으면 살린다)
  if v_kind = 'homework' then
    v_res := public.close_homework_session(s.id, v_problems, '{}'::text[]);

    update public.study_sessions
       set ended_by_admin = true
     where id = s.id and status = 'finished'
     returning * into s;

    if found then
      v_res := v_res || jsonb_build_object('session', to_jsonb(s));
    end if;

    return v_res || jsonb_build_object(
      'already_finished', false,
      'ended_by_admin',   true
    );
  end if;

  -- 학원 공부 — finish_session 이 일시정지/진행·자정 넘김·5시간 상한을 그대로 처리한다
  v_res := public.finish_session(s.id, v_problems);

  if coalesce((v_res ->> 'discarded')::boolean, false) then
    return v_res || jsonb_build_object(
      'already_finished', false,
      'ended_by_admin',   false
    );
  end if;

  update public.study_sessions
     set ended_by_admin = true
   where id = s.id
   returning * into s;

  if found then
    v_res := v_res || jsonb_build_object('session', to_jsonb(s));
  end if;

  return v_res || jsonb_build_object(
    'already_finished', false,
    'ended_by_admin',   true
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 학생이 오늘(KST) 학원 공부 문제 수를 직접 고친다 (0~999)
--   · 오늘 study_logs 한 줄을 잠그고(for update) academy_problems 만 바꾼다
--   · 합계 problems = academy_problems + homework_problems 로 다시 계산한다
--   · 숙제 공부 문제 수는 선생님 승인 대상이라 건드리지 않는다
--   · 오늘 학원 공부 기록이 없으면 no_academy_today, 오늘 기록이 없으면 log_not_found
-- ---------------------------------------------------------------------
create or replace function public.student_update_today_academy_problems(
  p_student_id uuid,
  p_problems   integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today    date := public.kst_today();
  v_problems integer;
  v_student  public.students;
  v_log      public.study_logs;
begin
  if p_student_id is null then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  -- 0~999 밖의 값은 거부한다 (화면에서도 막지만 서버가 마지막으로 확인한다)
  if p_problems is null or p_problems < 0 or p_problems > 999 then
    raise exception 'problems_out_of_range' using errcode = '22023';
  end if;
  v_problems := p_problems;

  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0002';
  end if;

  select * into v_log
    from public.study_logs
   where student_id = p_student_id and date = v_today
   for update;
  if not found then
    raise exception 'log_not_found' using errcode = 'P0002';
  end if;

  -- 오늘 학원 공부를 하지 않았으면(숙제만 했거나 기록만 남았으면) 고칠 것이 없다
  if coalesce(v_log.academy_minutes, 0) <= 0 and coalesce(v_log.academy_problems, 0) <= 0 then
    raise exception 'no_academy_today' using errcode = 'P0002';
  end if;

  update public.study_logs
     set academy_problems = v_problems,
         problems         = v_problems + coalesce(homework_problems, 0),
         updated_at       = now()
   where id = v_log.id
   returning * into v_log;

  return jsonb_build_object(
    'log',               to_jsonb(v_log),
    'date',              v_log.date,
    'minutes',           coalesce(v_log.minutes, 0),
    'academy_minutes',   coalesce(v_log.academy_minutes, 0),
    'homework_minutes',  coalesce(v_log.homework_minutes, 0),
    'academy_problems',  coalesce(v_log.academy_problems, 0),
    'homework_problems', coalesce(v_log.homework_problems, 0),
    'problems',          coalesce(v_log.problems, 0)
  );
end;
$$;

grant execute on function public.student_update_today_academy_problems(uuid, integer) to anon, authenticated;

comment on function public.student_update_today_academy_problems(uuid, integer) is
  '학생이 오늘(KST) 학원 공부 문제 수(0~999)를 직접 고친다 — 합계는 학원+숙제로 다시 계산한다';

notify pgrst, 'reload schema';
