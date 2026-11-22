-- =====================================================================
-- 선오공 — 히든 검은용 확률 1/10,000 → 1/1,000 (2026-11-22)
--
--   · roll_black_dragon() 의 확률을 0.0001 에서 0.001 로 올린다.
--   · 보너스 규칙은 그대로 — 원래 나온 일반용·무지개용은 그대로 남는다.
--   · 확률·존재는 학생 화면 어디에도 적지 않는다(가진 학생에게만 보인다).
--
--  Supabase SQL Editor 에 그대로 붙여 넣어 실행하면 됩니다. (여러 번 실행해도 안전)
--
--  확인용 (주석을 풀어 실행):
--    select prosrc from pg_proc where proname = 'roll_black_dragon';
-- =====================================================================

create or replace function public.roll_black_dragon()
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_force text := coalesce(current_setting('sunogong.force_black', true), '');
begin
  if v_force = 'on' then
    return true;
  end if;
  if v_force = 'off' then
    return false;
  end if;
  return random() < 0.001;
end;
$$;

revoke execute on function public.roll_black_dragon() from public;
revoke execute on function public.roll_black_dragon() from anon, authenticated;
