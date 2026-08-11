-- NWG Coaches Hub — Rota Tool, Restructure view
-- Adds a third rota view alongside Standard Rota and This Week: a one-off
-- editable snapshot generated on command from the Standard Rota, same as a
-- week is, but with no calendar date — one per site, not one per site+week.
-- Regenerating it overwrites the existing one, same as regenerating a week.
--
-- This mirrors rota_weekly_rotas / rota_weekly_roster / rota_weekly_classes
-- (0002, 0003) and upsert_weekly_rota() in their CURRENT form — 0013 added the
-- can_edit_rota() job_title gate and split each table's single `for all`
-- policy into four, and 0014 added the is_active_coach() gate on top of that.
-- This migration creates the new tables straight into that final shape rather
-- than replaying the 0002 -> 0013 -> 0014 history, so there is only one
-- version of these policies to read.
--
-- rota_restructures is keyed by site_id alone (unique), not site_id +
-- week_start_date — there is never more than one Restructure per site, and it
-- carries no date column at all.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.rota_restructures (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.rota_sites (id) on delete cascade,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users (id),
  unique (site_id)
);

create table public.rota_restructure_roster (
  id uuid primary key default gen_random_uuid(),
  restructure_id uuid not null references public.rota_restructures (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  coach_id uuid not null references public.rota_coaches (id) on delete cascade,
  sort_order smallint not null default 0,
  shift_start_mins smallint not null,
  shift_end_mins smallint not null,
  status text not null default 'working' check (status in ('working', 'leave', 'sick')),
  is_key_holder boolean not null default false,
  is_lead boolean not null default false,
  is_cashing_up boolean not null default false,
  unique (restructure_id, day_of_week, coach_id)
);
create unique index one_cashup_per_restructure_day
  on public.rota_restructure_roster (restructure_id, day_of_week) where is_cashing_up;
create unique index one_lead_per_restructure_day
  on public.rota_restructure_roster (restructure_id, day_of_week) where is_lead;

create table public.rota_restructure_classes (
  id uuid primary key default gen_random_uuid(),
  restructure_id uuid not null references public.rota_restructures (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  coach_id uuid not null references public.rota_coaches (id) on delete cascade,
  set_coach_id uuid references public.rota_coaches (id) on delete set null,
  class_catalogue_id uuid references public.rota_class_catalogue (id) on delete set null,
  title text not null,
  category_key text not null references public.rota_categories (key),
  meta text,
  start_mins smallint not null,
  duration_mins smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.rota_restructure_classes (restructure_id, day_of_week);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- Same shape as the current rota_weekly_rotas / rota_weekly_roster /
-- rota_weekly_classes policies: is_active_coach() gates every command,
-- can_edit_rota() additionally gates every write, and the site match is
-- is_admin() or a profiles.site = rota_sites.name join, exactly as those
-- tables use. rota_restructures carries site_id directly; the roster/classes
-- tables reach it by joining through rota_restructures, the same way the
-- weekly child tables join through rota_weekly_rotas.

alter table public.rota_restructures enable row level security;
alter table public.rota_restructure_roster enable row level security;
alter table public.rota_restructure_classes enable row level security;

-- --- rota_restructures ------------------------------------------------------

create policy "rota_restructures_select_admin_or_own_site"
on public.rota_restructures
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_restructures.site_id and p.id = auth.uid()
    )
  )
);

create policy "rota_restructures_insert_can_edit_own_site"
on public.rota_restructures
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_restructures.site_id and p.id = auth.uid()
    )
  )
);

create policy "rota_restructures_update_can_edit_own_site"
on public.rota_restructures
for update
to authenticated
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_restructures.site_id and p.id = auth.uid()
    )
  )
)
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_restructures.site_id and p.id = auth.uid()
    )
  )
);

create policy "rota_restructures_delete_can_edit_own_site"
on public.rota_restructures
for delete
to authenticated
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_restructures.site_id and p.id = auth.uid()
    )
  )
);

-- --- rota_restructure_roster -------------------------------------------------

create policy "rota_restructure_roster_select_admin_or_own_site"
on public.rota_restructure_roster
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_restructures r
      join public.rota_sites s on s.id = r.site_id
      join public.profiles p on p.site = s.name
      where r.id = rota_restructure_roster.restructure_id and p.id = auth.uid()
    )
  )
);

create policy "rota_restructure_roster_insert_can_edit_own_site"
on public.rota_restructure_roster
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_restructures r
      join public.rota_sites s on s.id = r.site_id
      join public.profiles p on p.site = s.name
      where r.id = rota_restructure_roster.restructure_id and p.id = auth.uid()
    )
  )
);

create policy "rota_restructure_roster_update_can_edit_own_site"
on public.rota_restructure_roster
for update
to authenticated
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_restructures r
      join public.rota_sites s on s.id = r.site_id
      join public.profiles p on p.site = s.name
      where r.id = rota_restructure_roster.restructure_id and p.id = auth.uid()
    )
  )
)
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_restructures r
      join public.rota_sites s on s.id = r.site_id
      join public.profiles p on p.site = s.name
      where r.id = rota_restructure_roster.restructure_id and p.id = auth.uid()
    )
  )
);

create policy "rota_restructure_roster_delete_can_edit_own_site"
on public.rota_restructure_roster
for delete
to authenticated
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_restructures r
      join public.rota_sites s on s.id = r.site_id
      join public.profiles p on p.site = s.name
      where r.id = rota_restructure_roster.restructure_id and p.id = auth.uid()
    )
  )
);

-- --- rota_restructure_classes -------------------------------------------------

create policy "rota_restructure_classes_select_admin_or_own_site"
on public.rota_restructure_classes
for select
to authenticated
using (
  public.is_active_coach()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_restructures r
      join public.rota_sites s on s.id = r.site_id
      join public.profiles p on p.site = s.name
      where r.id = rota_restructure_classes.restructure_id and p.id = auth.uid()
    )
  )
);

create policy "rota_restructure_classes_insert_can_edit_own_site"
on public.rota_restructure_classes
for insert
to authenticated
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_restructures r
      join public.rota_sites s on s.id = r.site_id
      join public.profiles p on p.site = s.name
      where r.id = rota_restructure_classes.restructure_id and p.id = auth.uid()
    )
  )
);

create policy "rota_restructure_classes_update_can_edit_own_site"
on public.rota_restructure_classes
for update
to authenticated
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_restructures r
      join public.rota_sites s on s.id = r.site_id
      join public.profiles p on p.site = s.name
      where r.id = rota_restructure_classes.restructure_id and p.id = auth.uid()
    )
  )
)
with check (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_restructures r
      join public.rota_sites s on s.id = r.site_id
      join public.profiles p on p.site = s.name
      where r.id = rota_restructure_classes.restructure_id and p.id = auth.uid()
    )
  )
);

create policy "rota_restructure_classes_delete_can_edit_own_site"
on public.rota_restructure_classes
for delete
to authenticated
using (
  public.is_active_coach()
  and public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_restructures r
      join public.rota_sites s on s.id = r.site_id
      join public.profiles p on p.site = s.name
      where r.id = rota_restructure_classes.restructure_id and p.id = auth.uid()
    )
  )
);

-- ---------------------------------------------------------------------------
-- upsert_restructure
-- ---------------------------------------------------------------------------
--
-- security definer, so it bypasses RLS entirely — the checks below are the
-- authorization boundary, not the policies above. Same three checks as the
-- current upsert_weekly_rota(), in the same order and with the same reasoning
-- for that order (0014: most fundamental reason first, so the caller's error
-- message actually explains the refusal instead of pointing at the wrong
-- thing): deactivated account, then missing edit rights, then wrong site.
--
-- `on conflict (site_id)` reuses the same rota_restructures row (and id)
-- across repeated calls instead of duplicating it, matching site_id being the
-- table's sole unique key — there is no week_start_date to also match on.
-- Both child tables are unconditionally deleted then re-inserted from the
-- Standard Rota, so a regeneration fully replaces them rather than appending.

create or replace function public.upsert_restructure(p_site_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restructure_id uuid;
  v_authorized boolean;
begin
  if not public.is_active_coach() then
    raise exception 'Your account has been deactivated';
  end if;

  if not public.can_edit_rota() then
    raise exception 'Your job title does not have rota edit rights';
  end if;

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
    raise exception 'Not authorized to generate a restructure for this site';
  end if;

  insert into public.rota_restructures (site_id, generated_by)
  values (p_site_id, auth.uid())
  on conflict (site_id)
  do update set generated_at = now(), generated_by = auth.uid()
  returning id into v_restructure_id;

  delete from public.rota_restructure_classes where restructure_id = v_restructure_id;
  delete from public.rota_restructure_roster where restructure_id = v_restructure_id;

  insert into public.rota_restructure_roster (
    restructure_id, day_of_week, coach_id, sort_order,
    shift_start_mins, shift_end_mins, status,
    is_key_holder, is_lead, is_cashing_up
  )
  select
    v_restructure_id, day_of_week, coach_id, sort_order,
    shift_start_mins, shift_end_mins, status,
    is_key_holder, is_lead, is_cashing_up
  from public.rota_standard_roster
  where site_id = p_site_id;

  insert into public.rota_restructure_classes (
    restructure_id, day_of_week, coach_id, set_coach_id,
    class_catalogue_id, title, category_key, meta,
    start_mins, duration_mins
  )
  select
    v_restructure_id, day_of_week, coach_id, set_coach_id,
    class_catalogue_id, title, category_key, meta,
    start_mins, duration_mins
  from public.rota_standard_classes
  where site_id = p_site_id;

  return v_restructure_id;
end;
$$;

-- Both revokes, then an explicit grant — the rule 0012 settled on for every
-- security-definer function here, applied from creation this time rather than
-- as a follow-up: a function is reachable by anon down two independent paths
-- (Postgres's default EXECUTE-to-PUBLIC, and Supabase's `alter default
-- privileges ... grant all on functions to anon`), and closing one alone
-- leaves the other open.

revoke execute on function public.upsert_restructure(uuid) from public;
revoke execute on function public.upsert_restructure(uuid) from anon;
grant execute on function public.upsert_restructure(uuid) to authenticated;
