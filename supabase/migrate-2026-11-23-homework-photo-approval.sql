-- =====================================================================
--  선오공 — 숙제 공부 사진 인증 · 시간/문항수 분리 승인 · 관리자 「숙제관리」
--  Supabase Dashboard > SQL Editor 에서 이 파일을 한 번 실행하세요.
--  여러 번 실행해도 안전합니다(if not exists / create or replace).
--
--  · 숙제 공부(homework)는 학생이 끝낼 때 공부한 페이지 사진(최대 5장)과
--    푼 문제 수를 함께 제출한다. 제출한 시간·문제 수는 study_logs 에 바로 넣지 않고
--    homework_submissions 에 'pending'(승인 대기)으로 남긴다.
--  · 원장님(관리자)이 「숙제관리」 탭에서 시간과 문항수를 따로 승인/반려하면,
--    승인한 항목만 study_logs 에 더해진다(통계·랭킹 반영). 반려한 항목은 0으로 확정한다.
--  · 드래곤볼은 숙제 승인과 별개다 — 이 파일은 드래곤볼 지급/출현 로직을 건드리지 않는다.
--  · 학원 공부(academy)는 예전과 똑같이 끝낼 때 바로 study_logs 에 반영한다.
--  · 사진은 비공개 Storage 버킷 homework-photos 에 올리고 화면에서는 서명 URL 로 본다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 숙제 제출 표
-- ---------------------------------------------------------------------
create table if not exists public.homework_submissions (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references public.students (id) on delete cascade,
  -- 이 제출을 만든 공부 세션 (한 세션에 한 번만 제출)
  session_id          uuid unique references public.study_sessions (id) on delete set null,
  date                date not null default public.kst_today(),
  started_at          timestamptz,
  ended_at            timestamptz,
  -- 학생이 제출한 값 (문제 수는 자동 종료 뒤 아직 모를 수 있어 비어 있을 수 있다)
  submitted_minutes   integer not null default 0 check (submitted_minutes >= 0 and submitted_minutes <= 300),
  submitted_problems  integer check (submitted_problems is null or (submitted_problems >= 0 and submitted_problems <= 9999)),
  -- 올린 숙제 사진 경로 (homework-photos 버킷, 최대 5장)
  photo_paths         text[] not null default '{}'::text[],
  -- pending(승인 대기) / approved(하나라도 승인) / rejected(둘 다 반려)
  status              text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  time_verdict        text not null default 'pending' check (time_verdict in ('pending', 'approved', 'rejected')),
  problems_verdict    text not null default 'pending' check (problems_verdict in ('pending', 'approved', 'rejected')),
  -- 승인된 값 (반려한 항목은 0)
  approved_minutes    integer not null default 0 check (approved_minutes >= 0),
  approved_problems   integer not null default 0 check (approved_problems >= 0),
  reject_reason       text,
  submitted_at        timestamptz not null default now(),
  reviewed_at         timestamptz,
  reviewed_by         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint homework_submissions_photos_max check (
    array_length(photo_paths, 1) is null or array_length(photo_paths, 1) <= 5
  ),
  constraint homework_submissions_reason_len check (reject_reason is null or length(reject_reason) <= 300)
);

create index if not exists homework_submissions_pending_idx
  on public.homework_submissions (submitted_at asc)
  where status = 'pending';

create index if not exists homework_submissions_student_idx
  on public.homework_submissions (student_id, created_at desc);

create index if not exists homework_submissions_status_idx
  on public.homework_submissions (status, created_at desc);

comment on table  public.homework_submissions is '숙제 공부 제출 — 원장님 승인 전에는 study_logs 에 반영하지 않는다';
comment on column public.homework_submissions.photo_paths is '숙제 페이지 사진 경로 (homework-photos 버킷, 최대 5장)';
comment on column public.homework_submissions.submitted_problems is 'null 이면 자동 종료 뒤 문제 수를 아직 받지 못한 제출';
-- 드래곤볼은 숙제 승인과 별개다. 예전 시험판에서 쓰던 열이 남아 있으면 지운다.
alter table public.homework_submissions drop column if exists dragonball_granted;

-- ---------------------------------------------------------------------
-- 2. 숙제 세션 마무리 → 승인 대기 제출 만들기
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
  v_paths := coalesce(p_photo_paths, '{}'::text[]);
  v_paths := array(
    select p from (
      select distinct btrim(p) as p from unnest(v_paths) as p
    ) t
    where coalesce(t.p, '') <> ''
    limit 5
  );

  -- 이미 제출된 세션이면 그 제출을 돌려준다.
  -- (아직 승인 전이면 나중에 들어온 문제 수·사진으로 채워 준다)
  select * into v_sub from public.homework_submissions where session_id = s.id;
  if found then
    if v_sub.status = 'pending' then
      update public.homework_submissions
         set submitted_problems = coalesce(
               case when coalesce(p_problems, 0) > 0 then p_problems end,
               submitted_problems
             ),
             photo_paths = case
               when coalesce(array_length(v_paths, 1), 0) > 0
                    and coalesce(array_length(photo_paths, 1), 0) = 0
                 then v_paths
               else photo_paths
             end,
             updated_at = now()
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

  if s.status = 'finished' then
    -- 서버가 5시간 초과로 먼저 마무리해 둔 세션 — 시간은 그대로 쓰고 기록만 승인 대기로 남긴다
    v_mins := coalesce(s.minutes, 0);
    if coalesce(p_problems, 0) > 0 then
      v_problems := greatest(0, least(9999, p_problems));
    else
      v_problems := s.problems;   -- 비어 있으면 그대로 비워 둔다(다음 접속 때 받는다)
    end if;
  else
    v_end := case when s.status = 'paused' then coalesce(s.paused_at, now()) else now() end;

    -- 그 날 자정을 넘긴 공부는 기록하지 않고 세션만 버린다 (예전 규칙과 같다)
    v_cap := ((s.date + 1)::timestamp at time zone 'Asia/Seoul') - interval '1 second';
    if v_end > v_cap then
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
    -- 문제 수를 아직 받지 못했으면 비워 둔다 (다음 접속 때 사진·문제 수를 받는다)
    if p_problems is null and s.problems is null then
      v_problems := null;
    else
      v_problems := greatest(0, least(9999, coalesce(p_problems, s.problems, 0)));
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

  insert into public.homework_submissions (
    student_id, session_id, date, started_at, ended_at,
    submitted_minutes, submitted_problems, photo_paths, status, submitted_at
  )
  values (
    s.student_id, s.id, s.date, s.started_at, coalesce(s.ended_at, v_end),
    v_mins, v_problems, v_paths, 'pending', now()
  )
  returning * into v_sub;

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
-- 3. 학생이 사진과 함께 숙제 공부를 제출 (타이머 화면 종료)
--    1문제 이상이면 사진 1장 이상이 필요하다. 0문제는 사진 없이도 된다.
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

  -- 문제를 풀었으면 풀이 흔적 사진이 있어야 한다 (이미 올려 둔 사진이 있으면 그것으로 인정)
  if v_problems > 0 and coalesce(array_length(v_paths, 1), 0) = 0 then
    if not exists (
      select 1 from public.homework_submissions
       where session_id = s.id and coalesce(array_length(photo_paths, 1), 0) > 0
    ) then
      raise exception 'photo_required' using errcode = '22023';
    end if;
  end if;

  return public.close_homework_session(s.id, v_problems, v_paths);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. 자동 종료된 숙제 공부의 문제 수 · 사진 채우기 (다음 접속 때)
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

  if v_problems > 0 and coalesce(array_length(v_all, 1), 0) = 0 then
    raise exception 'photo_required' using errcode = '22023';
  end if;

  update public.homework_submissions
     set submitted_problems = v_problems,
         photo_paths        = v_all,
         updated_at         = now()
   where id = s.id
   returning * into s;

  return to_jsonb(s);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. 원장님 확인 — 시간·문항수를 따로 승인/반려
--    · 승인한 항목만 study_logs 에 더한다 (그 날 학원 공부 기록과 합쳐진다)
--    · 반려한 항목은 0으로 확정한다 (다시 제출하지 않는다)
--    · 하나라도 승인되면 드래곤볼 1개 (한 제출에 한 번만)
-- ---------------------------------------------------------------------
create or replace function public.review_homework_submission(
  p_submission_id     uuid,
  p_time_approved     boolean,
  p_problems_approved boolean,
  p_reject_reason     text default null
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

-- ---------------------------------------------------------------------
-- 6. 자동 종료된 숙제 공부 중 문제 수를 아직 받지 못한 제출 (학생 다음 접속)
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
     and submitted_problems is null
     and date >= (public.kst_today() - 30)
   order by coalesce(ended_at, created_at) asc, created_at asc;
$$;

-- ---------------------------------------------------------------------
-- 7. 기존 함수 연결
--    7-1. finish_session: 숙제 공부는 기록에 바로 넣지 않고 승인 대기로 넘긴다
--    7-2. auto_end_paused_session: 숙제 공부의 60분 자동 종료도 승인 대기로 넘긴다
--    7-3. 정리: 숙제 세션은 문제 수 대기 목록에서 뺀다 (제출 표가 대신 물어본다)
-- ---------------------------------------------------------------------

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

create or replace function public.auto_end_paused_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s      public.study_sessions;
  v_end  timestamptz;
  v_cap  timestamptz;
  v_secs integer;
  v_mins integer;
  v_kind text;
  v_log  public.study_logs;
  v_res  jsonb;
begin
  select * into s from public.study_sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  -- 이미 끝난 세션 → 그대로
  if s.status = 'finished' then
    select * into v_log
      from public.study_logs
     where student_id = s.student_id and date = s.date;

    return jsonb_build_object(
      'session',          to_jsonb(s),
      'log',              to_jsonb(v_log),
      'seconds',          coalesce(s.minutes, 0) * 60,
      'minutes',          coalesce(s.minutes, 0),
      'problems',         coalesce(s.problems, 0),
      'total_minutes',    coalesce(v_log.minutes, 0),
      'total_problems',   coalesce(v_log.problems, 0),
      'date',             s.date,
      'kind',             s.kind,
      'problems_pending', s.problems_pending,
      'already_finished', true
    );
  end if;

  -- 공부 중인 세션은 자동 종료하지 않는다 (쉬는 중일 때만)
  if s.status <> 'paused' then
    return jsonb_build_object(
      'session',          to_jsonb(s),
      'log',              null,
      'seconds',          0,
      'minutes',          0,
      'problems',         0,
      'total_minutes',    0,
      'total_problems',   0,
      'date',             s.date,
      'kind',             s.kind,
      'problems_pending', false,
      'not_paused',       true
    );
  end if;

  -- 숙제 공부는 승인 대기 제출로 넘긴다 (문제 수는 다음 접속 때 제출 표에서 받는다)
  if coalesce(s.kind, 'academy') = 'homework' then
    v_res := public.close_homework_session(s.id, null, '{}'::text[]);
    return v_res || jsonb_build_object(
      'problems_pending', coalesce((v_res ->> 'pending_approval')::boolean, false),
      'auto_ended',       true
    );
  end if;

  -- 공부를 멈춘 시각까지가 공부 시간이다 (쉬는 동안의 시간은 세지 않는다)
  v_end := coalesce(s.paused_at, now());

  -- 그 날 자정을 넘긴 공부는 기록하지 않고 세션만 버린다 (기존 규칙과 같다)
  v_cap := ((s.date + 1)::timestamp at time zone 'Asia/Seoul') - interval '1 second';
  if v_end > v_cap then
    delete from public.study_sessions where id = s.id;

    select * into v_log
      from public.study_logs
     where student_id = s.student_id and date = s.date;

    return jsonb_build_object(
      'session',          null,
      'log',              null,
      'seconds',          0,
      'minutes',          0,
      'problems',         0,
      'total_minutes',    coalesce(v_log.minutes, 0),
      'total_problems',   coalesce(v_log.problems, 0),
      'date',             s.date,
      'kind',             s.kind,
      'problems_pending', false,
      'discarded',        true
    );
  end if;

  v_secs := greatest(0, floor(extract(epoch from (v_end - s.started_at)))::integer - s.paused_seconds);
  if v_secs > 18000 then
    v_secs := 18000;
  end if;
  v_mins := (v_secs / 60)::integer;
  v_kind := case when s.kind = 'homework' then 'homework' else 'academy' end;

  update public.study_sessions
     set status           = 'finished',
         ended_at         = v_end,
         paused_at        = null,
         last_pause_auto  = false,
         minutes          = v_mins,
         problems         = null,               -- 아직 모른다 (problems_pending 으로 표시)
         problems_pending = (v_mins > 0),       -- 1분도 안 됐으면 물어볼 것이 없다
         auto_ended       = true
   where id = s.id
   returning * into s;

  if v_mins > 0 then
    -- 문제 수는 0으로 넣어 두고, 나중에 set_session_problems() 가 더한다
    insert into public.study_logs as l (
      student_id, date, minutes, problems,
      academy_minutes, academy_problems, homework_minutes, homework_problems, updated_at
    )
    values (
      s.student_id, s.date, v_mins, 0,
      case when v_kind = 'academy'  then v_mins else 0 end,
      0,
      case when v_kind = 'homework' then v_mins else 0 end,
      0,
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
  else
    -- 공부한 시간이 0분이면 기록 줄도 만들지 않는다 (그 날 기록은 그대로)
    select * into v_log
      from public.study_logs
     where student_id = s.student_id and date = s.date;
  end if;

  return jsonb_build_object(
    'session',          to_jsonb(s),
    'log',              to_jsonb(v_log),
    'seconds',          v_secs,
    'minutes',          v_mins,
    'problems',         0,
    'total_minutes',    coalesce(v_log.minutes, 0),
    'total_problems',   coalesce(v_log.problems, 0),
    'date',             s.date,
    'kind',             v_kind,
    'problems_pending', s.problems_pending,
    'auto_ended',       true
  );
end;
$$;

-- 숙제 세션은 문제 수 대기 목록에서 뺀다 (문제 수·사진은 제출 표가 물어본다)
create or replace function public.pending_problem_sessions(p_student_id uuid)
returns setof public.study_sessions
language sql
stable
security definer
set search_path = public
as $$
  select *
    from public.study_sessions
   where student_id = p_student_id
     and status = 'finished'
     and coalesce(kind, 'academy') = 'academy'
     and problems_pending
     and coalesce(minutes, 0) > 0
     and date >= (public.kst_today() - 30)
   order by coalesce(ended_at, created_at) asc, created_at asc;
$$;

-- ---------------------------------------------------------------------
-- 8. Storage — 숙제 사진 버킷 (비공개)
--    무료 플랜 용량을 아끼려고 앱에서 긴 변 1200px · JPEG 0.72 로 줄여 올린다(장당 100~150KB).
--    버킷 자체 상한은 5MB 로 두어 원본이 그대로 올라가는 일을 막는다.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'homework-photos',
  'homework-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists homework_photos_read   on storage.objects;
drop policy if exists homework_photos_insert on storage.objects;
drop policy if exists homework_photos_update on storage.objects;
drop policy if exists homework_photos_delete on storage.objects;

create policy homework_photos_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'homework-photos');

create policy homework_photos_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'homework-photos');

create policy homework_photos_update on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'homework-photos')
  with check (bucket_id = 'homework-photos');

create policy homework_photos_delete on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'homework-photos');

-- ---------------------------------------------------------------------
-- 9. 권한 · RLS
-- ---------------------------------------------------------------------
alter table public.homework_submissions enable row level security;

drop policy if exists homework_submissions_anon_all on public.homework_submissions;
create policy homework_submissions_anon_all on public.homework_submissions
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.homework_submissions to anon, authenticated;

grant execute on function public.close_homework_session(uuid, integer, text[]) to anon, authenticated;
grant execute on function public.submit_homework(uuid, integer, text[]) to anon, authenticated;
grant execute on function public.submit_pending_homework(uuid, integer, text[]) to anon, authenticated;
grant execute on function public.review_homework_submission(uuid, boolean, boolean, text) to anon, authenticated;
grant execute on function public.pending_homework_submissions(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
