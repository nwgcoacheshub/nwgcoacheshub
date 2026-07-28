-- NWG Coaches Hub — v1 initial schema
-- profiles table, RLS policies, seed admin row
-- See nwg-coaches-hub-v1-build-doc.md sections 5, 6, 7

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'coach'
    check (role in ('admin', 'coach')),
  job_title text not null
    check (job_title in (
      'Coach',
      'Lead Coach',
      'Club Head Coach',
      'Regional General Manager',
      'Head of Gymnastics',
      'Head of People',
      'Head of Operations'
    )),
  site text not null
    check (site in (
      'Burnley',
      'Coventry',
      'Leeds',
      'Mansfield',
      'Rotherham',
      'Wirral',
      'Wolverhampton',
      'Head Office'
    )),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Security-definer helper to check admin status without recursive RLS
-- (a policy on profiles can't query profiles directly without this).
create function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- SELECT: a user can read their own row; admins can read all rows.
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (
  id = auth.uid() or public.is_admin()
);

-- UPDATE: admins can update any row. Coaches cannot update any row,
-- including their own (no update policy is granted to non-admins).
create policy "profiles_update_admin_only"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- No INSERT or DELETE policies: both are blocked entirely for the
-- authenticated/anon roles. Account provisioning goes through the
-- server-side function using the service-role key, which bypasses RLS.

-- Seed row: pre-existing auth user for the initial admin account.
insert into public.profiles (id, email, full_name, role, job_title, site, active)
select id, 'jamie@nilewilsongymnastics.com', 'Jamie Harrison', 'admin', 'Head of Gymnastics', 'Head Office', true
from auth.users
where email = 'jamie@nilewilsongymnastics.com';
