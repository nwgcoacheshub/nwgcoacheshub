-- NWG Coaches Hub — Rota Tool, phase 5b
-- Adds upsert_weekly_rota(), the single generate/regenerate entry point for a
-- site's weekly rota. Per phase 5a's investigation: one security-definer
-- function handles both first-time generation and regeneration, using
-- `on conflict` on rota_weekly_rotas so the same row (and id) is reused
-- across repeated calls rather than duplicated, and unconditionally
-- delete-then-reinserts the child rows so they're fully replaced, not
-- appended to.
--
-- security definer means this function bypasses RLS entirely, so it is the
-- authorization boundary for this write — the explicit check below (admin,
-- or the caller's profiles.site name-matches rota_sites.name for p_site_id)
-- mirrors the same admin-or-own-site rule already enforced by RLS on
-- rota_weekly_rotas/rota_weekly_roster/rota_weekly_classes in 0002, so a
-- caller who couldn't touch these tables directly can't do so through this
-- function either.
--
-- No explicit grant statement: matches the existing convention set by
-- public.is_admin() in 0001, which also has none and relies on Postgres's
-- default EXECUTE-to-PUBLIC grant on newly created functions. Unauthorized
-- callers are still blocked by the check below, not by the grant.

create or replace function public.upsert_weekly_rota(p_site_id uuid, p_week_start date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_weekly_rota_id uuid;
  v_authorized boolean;
begin
  select
    public.is_admin()
    or exists (
      select 1
      from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = p_site_id and p.id = auth.uid()
    )
  into v_authorized;

  if not v_authorized then
    raise exception 'Not authorized to generate a rota for this site';
  end if;

  insert into public.rota_weekly_rotas (site_id, week_start_date, generated_by)
  values (p_site_id, p_week_start, auth.uid())
  on conflict (site_id, week_start_date)
  do update set generated_at = now(), generated_by = auth.uid()
  returning id into v_weekly_rota_id;

  delete from public.rota_weekly_classes where weekly_rota_id = v_weekly_rota_id;
  delete from public.rota_weekly_roster where weekly_rota_id = v_weekly_rota_id;

  insert into public.rota_weekly_roster (
    weekly_rota_id, day_of_week, coach_id, sort_order,
    shift_start_mins, shift_end_mins, status,
    is_key_holder, is_lead, is_cashing_up
  )
  select
    v_weekly_rota_id, day_of_week, coach_id, sort_order,
    shift_start_mins, shift_end_mins, status,
    is_key_holder, is_lead, is_cashing_up
  from public.rota_standard_roster
  where site_id = p_site_id;

  insert into public.rota_weekly_classes (
    weekly_rota_id, day_of_week, coach_id, set_coach_id,
    class_catalogue_id, title, category_key, meta,
    start_mins, duration_mins
  )
  select
    v_weekly_rota_id, day_of_week, coach_id, set_coach_id,
    class_catalogue_id, title, category_key, meta,
    start_mins, duration_mins
  from public.rota_standard_classes
  where site_id = p_site_id;

  return v_weekly_rota_id;
end;
$$;
