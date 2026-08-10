-- NWG Coaches Hub — Rota Tool, edit rights by job_title
-- Splits rota access into read (any coach at the site, unchanged) and write
-- (site staff with a senior job_title, plus admins).
--
-- Until now profiles.job_title has been a company title only — profiles.role
-- (admin | coach) was the sole permission field, and it doesn't distinguish a
-- Coach from a Lead Coach. Every coach at a site could therefore edit that
-- site's whole rota and regenerate its week. Per Jamie: editing is restricted
-- to Lead Coach, Club Head Coach, Regional General Manager, Head of Gymnastics,
-- Head of People and Head of Operations. Plain 'Coach' keeps read access and
-- loses write. Admins keep everything, at every site, as they do today.
--
-- Two things follow from that, both of which shape the SQL below:
--
--   1. The six tables in 0002 each carry one `for all` policy. A single policy
--      can't cover only insert/update/delete — Postgres policies take exactly
--      one of ALL | SELECT | INSERT | UPDATE | DELETE, with no multi-command
--      form. So each `for all` policy becomes four: one select carrying today's
--      predicate untouched, and three write policies carrying the same
--      predicate AND the new job_title gate. Six policies become twenty-four.
--
--   2. The gate is prepended to the existing predicate rather than replacing
--      part of it:
--
--        public.can_edit_rota() and ( <0002's predicate, byte-identical> )
--
--      Writing it as `site_match and can_edit_rota()` would have dropped
--      is_admin() from the site test, and since admins sit at 'Head Office' —
--      which has no rota_sites row — every admin would have lost cross-site
--      editing. Keeping 0002's expression whole as the second conjunct also
--      makes the select and write policies diff cleanly against each other.
--
-- upsert_weekly_rota is security definer and bypasses RLS entirely, so the new
-- policies do not constrain it. Its own check is the authorization boundary for
-- generating a week, and it gets the same job_title gate at the bottom of this
-- file.

-- ---------------------------------------------------------------------------
-- can_edit_rota()
-- ---------------------------------------------------------------------------

-- Follows public.is_admin() in 0001: language sql, security definer, stable,
-- a pinned search_path, and every object reference schema-qualified so the body
-- can't be redirected by a caller-controlled search_path. security definer is
-- required for the same reason is_admin() needs it — the body reads profiles,
-- and a profiles policy calling it would otherwise recurse.
--
-- The titles are listed explicitly rather than tested as `job_title <> 'Coach'`.
-- The two are equivalent against today's check constraint, because the
-- edit-rights list happens to be every title except 'Coach'. They stop being
-- equivalent the moment a title like 'Trainee Coach' is added to 0001's
-- constraint: `<> 'Coach'` would silently grant it edit rights, while this list
-- fails closed and forces a deliberate decision.
--
-- is_admin() is folded in here on purpose. The policies below rely on it — they
-- read `can_edit_rota() and (is_admin() or site_match)`, so an admin whose
-- job_title is a plain 'Coach' (allowed: job_title and role are independent)
-- still passes. Do not "simplify" this function by dropping the is_admin()
-- clause without revisiting every policy that calls it.

create or replace function public.can_edit_rota()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_admin() or exists (
    select 1 from public.profiles
    where id = auth.uid()
      and job_title in (
        'Lead Coach',
        'Club Head Coach',
        'Regional General Manager',
        'Head of Gymnastics',
        'Head of People',
        'Head of Operations'
      )
  );
$$;

-- Both revokes, then an explicit grant — the rule 0012 settled on for every
-- security-definer function here. A function in this project is reachable by
-- anon down two independent paths (Postgres's default EXECUTE-to-PUBLIC, and
-- Supabase's `alter default privileges ... grant all on functions to anon`),
-- and closing either one alone leaves the other open. is_admin() in 0001 still
-- has neither revoke; that's tracked separately and deliberately not changed
-- here, but this function does not repeat the omission.

revoke execute on function public.can_edit_rota() from public;
revoke execute on function public.can_edit_rota() from anon;
grant execute on function public.can_edit_rota() to authenticated;

-- ---------------------------------------------------------------------------
-- Policy replacement
-- ---------------------------------------------------------------------------
--
-- Run this file as one batch. Between a `drop policy` and its replacements the
-- table has no policy and RLS denies everything — fail-closed, so a partial run
-- blocks the rota rather than exposing it, but it does mean the board is down
-- until the batch finishes.
--
-- Note the shape each command allows: `for insert` takes with check only,
-- `for delete` takes using only, and `for update` takes both — using decides
-- which rows may be targeted, with check decides what they may become. Both are
-- needed on update or a permitted editor could move a row to another site.

-- --- rota_coaches ----------------------------------------------------------

drop policy "rota_coaches_all_admin_or_own_site" on public.rota_coaches;

create policy "rota_coaches_select_admin_or_own_site"
on public.rota_coaches
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.rota_sites s
    join public.profiles p on p.site = s.name
    where s.id = rota_coaches.site_id and p.id = auth.uid()
  )
);

create policy "rota_coaches_insert_can_edit_own_site"
on public.rota_coaches
for insert
to authenticated
with check (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_coaches.site_id and p.id = auth.uid()
    )
  )
);

create policy "rota_coaches_update_can_edit_own_site"
on public.rota_coaches
for update
to authenticated
using (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_coaches.site_id and p.id = auth.uid()
    )
  )
)
with check (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_coaches.site_id and p.id = auth.uid()
    )
  )
);

create policy "rota_coaches_delete_can_edit_own_site"
on public.rota_coaches
for delete
to authenticated
using (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_coaches.site_id and p.id = auth.uid()
    )
  )
);

-- --- rota_standard_roster --------------------------------------------------

drop policy "rota_standard_roster_all_admin_or_own_site" on public.rota_standard_roster;

create policy "rota_standard_roster_select_admin_or_own_site"
on public.rota_standard_roster
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.rota_sites s
    join public.profiles p on p.site = s.name
    where s.id = rota_standard_roster.site_id and p.id = auth.uid()
  )
);

create policy "rota_standard_roster_insert_can_edit_own_site"
on public.rota_standard_roster
for insert
to authenticated
with check (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_roster.site_id and p.id = auth.uid()
    )
  )
);

create policy "rota_standard_roster_update_can_edit_own_site"
on public.rota_standard_roster
for update
to authenticated
using (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_roster.site_id and p.id = auth.uid()
    )
  )
)
with check (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_roster.site_id and p.id = auth.uid()
    )
  )
);

create policy "rota_standard_roster_delete_can_edit_own_site"
on public.rota_standard_roster
for delete
to authenticated
using (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_roster.site_id and p.id = auth.uid()
    )
  )
);

-- --- rota_standard_classes -------------------------------------------------

drop policy "rota_standard_classes_all_admin_or_own_site" on public.rota_standard_classes;

create policy "rota_standard_classes_select_admin_or_own_site"
on public.rota_standard_classes
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.rota_sites s
    join public.profiles p on p.site = s.name
    where s.id = rota_standard_classes.site_id and p.id = auth.uid()
  )
);

create policy "rota_standard_classes_insert_can_edit_own_site"
on public.rota_standard_classes
for insert
to authenticated
with check (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_classes.site_id and p.id = auth.uid()
    )
  )
);

create policy "rota_standard_classes_update_can_edit_own_site"
on public.rota_standard_classes
for update
to authenticated
using (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_classes.site_id and p.id = auth.uid()
    )
  )
)
with check (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_classes.site_id and p.id = auth.uid()
    )
  )
);

create policy "rota_standard_classes_delete_can_edit_own_site"
on public.rota_standard_classes
for delete
to authenticated
using (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_standard_classes.site_id and p.id = auth.uid()
    )
  )
);

-- --- rota_weekly_rotas -----------------------------------------------------

drop policy "rota_weekly_rotas_all_admin_or_own_site" on public.rota_weekly_rotas;

create policy "rota_weekly_rotas_select_admin_or_own_site"
on public.rota_weekly_rotas
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.rota_sites s
    join public.profiles p on p.site = s.name
    where s.id = rota_weekly_rotas.site_id and p.id = auth.uid()
  )
);

create policy "rota_weekly_rotas_insert_can_edit_own_site"
on public.rota_weekly_rotas
for insert
to authenticated
with check (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_weekly_rotas.site_id and p.id = auth.uid()
    )
  )
);

create policy "rota_weekly_rotas_update_can_edit_own_site"
on public.rota_weekly_rotas
for update
to authenticated
using (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_weekly_rotas.site_id and p.id = auth.uid()
    )
  )
)
with check (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_weekly_rotas.site_id and p.id = auth.uid()
    )
  )
);

create policy "rota_weekly_rotas_delete_can_edit_own_site"
on public.rota_weekly_rotas
for delete
to authenticated
using (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_sites s
      join public.profiles p on p.site = s.name
      where s.id = rota_weekly_rotas.site_id and p.id = auth.uid()
    )
  )
);

-- --- rota_weekly_roster ----------------------------------------------------
-- No site_id of its own; reaches it through rota_weekly_rotas, exactly as 0002
-- did.

drop policy "rota_weekly_roster_all_admin_or_own_site" on public.rota_weekly_roster;

create policy "rota_weekly_roster_select_admin_or_own_site"
on public.rota_weekly_roster
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.rota_weekly_rotas wr
    join public.rota_sites s on s.id = wr.site_id
    join public.profiles p on p.site = s.name
    where wr.id = rota_weekly_roster.weekly_rota_id and p.id = auth.uid()
  )
);

create policy "rota_weekly_roster_insert_can_edit_own_site"
on public.rota_weekly_roster
for insert
to authenticated
with check (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_roster.weekly_rota_id and p.id = auth.uid()
    )
  )
);

create policy "rota_weekly_roster_update_can_edit_own_site"
on public.rota_weekly_roster
for update
to authenticated
using (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_roster.weekly_rota_id and p.id = auth.uid()
    )
  )
)
with check (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_roster.weekly_rota_id and p.id = auth.uid()
    )
  )
);

create policy "rota_weekly_roster_delete_can_edit_own_site"
on public.rota_weekly_roster
for delete
to authenticated
using (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_roster.weekly_rota_id and p.id = auth.uid()
    )
  )
);

-- --- rota_weekly_classes ---------------------------------------------------

drop policy "rota_weekly_classes_all_admin_or_own_site" on public.rota_weekly_classes;

create policy "rota_weekly_classes_select_admin_or_own_site"
on public.rota_weekly_classes
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.rota_weekly_rotas wr
    join public.rota_sites s on s.id = wr.site_id
    join public.profiles p on p.site = s.name
    where wr.id = rota_weekly_classes.weekly_rota_id and p.id = auth.uid()
  )
);

create policy "rota_weekly_classes_insert_can_edit_own_site"
on public.rota_weekly_classes
for insert
to authenticated
with check (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_classes.weekly_rota_id and p.id = auth.uid()
    )
  )
);

create policy "rota_weekly_classes_update_can_edit_own_site"
on public.rota_weekly_classes
for update
to authenticated
using (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_classes.weekly_rota_id and p.id = auth.uid()
    )
  )
)
with check (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_classes.weekly_rota_id and p.id = auth.uid()
    )
  )
);

create policy "rota_weekly_classes_delete_can_edit_own_site"
on public.rota_weekly_classes
for delete
to authenticated
using (
  public.can_edit_rota()
  and (
    public.is_admin()
    or exists (
      select 1 from public.rota_weekly_rotas wr
      join public.rota_sites s on s.id = wr.site_id
      join public.profiles p on p.site = s.name
      where wr.id = rota_weekly_classes.weekly_rota_id and p.id = auth.uid()
    )
  )
);

-- ---------------------------------------------------------------------------
-- upsert_weekly_rota — job_title gate
-- ---------------------------------------------------------------------------
--
-- This function is security definer and bypasses RLS, so the policies above do
-- not constrain it: without this change a plain Coach could still regenerate a
-- week, wiping their site's hand-edited roster and classes, even with every
-- write policy in place. Its own check is the boundary, exactly as 0004 said.
--
-- The two conditions are checked separately so the caller gets a message that
-- names the actual reason. useGenerateWeek surfaces rpcError.message straight
-- to the user, and reusing 'Not authorized to generate a rota for this site'
-- for a Coach standing at their own site would read as if the site were wrong.
-- The job_title gate is tested first for that reason.
--
-- 0004's site check is preserved verbatim, as is the rest of the body: the
-- `on conflict` upsert that reuses the same rota row across regenerations, the
-- unconditional delete of both child tables, and the two copies from the
-- standard template.

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

-- `create or replace function` preserves an existing function's privileges, so
-- 0011's and 0012's revokes survive the replacement above and these three
-- statements are no-ops today. They're restated so the grant state is declared
-- alongside the definition rather than resting on that behaviour — and so the
-- function is still closed to anon if it is ever dropped and recreated rather
-- than replaced, which would restore both default grants.

revoke execute on function public.upsert_weekly_rota(uuid, date) from public;
revoke execute on function public.upsert_weekly_rota(uuid, date) from anon;
grant execute on function public.upsert_weekly_rota(uuid, date) to authenticated;
