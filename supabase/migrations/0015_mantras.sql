-- NWG Coaches Hub — Mantra of the month
-- One mantra per calendar month (1-12), re-used every year. Content is managed
-- directly in the Supabase Table Editor via the service role, which bypasses
-- RLS — so this file adds no insert/update/delete policy.

create table public.mantras (
  id uuid primary key default gen_random_uuid(),
  month_number integer not null unique check (month_number between 1 and 12),
  mantra_text text not null
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.mantras enable row level security;

-- Shared reference data, select-only. Uses is_active_coach() (0014) rather
-- than the older bare profiles-exists check still on rota_sites/
-- rota_categories/rota_class_catalogue — this table is new, so it follows the
-- current pattern rather than reproducing the gap 0014 fixed elsewhere.

create policy "mantras_select_authenticated"
on public.mantras
for select
to authenticated
using (
  public.is_active_coach()
);

-- ---------------------------------------------------------------------------
-- Seed data — placeholder text for all 12 months, edited directly afterward.
-- ---------------------------------------------------------------------------

insert into public.mantras (month_number, mantra_text) values
(1, 'Placeholder mantra for month 1'),
(2, 'Placeholder mantra for month 2'),
(3, 'Placeholder mantra for month 3'),
(4, 'Placeholder mantra for month 4'),
(5, 'Placeholder mantra for month 5'),
(6, 'Placeholder mantra for month 6'),
(7, 'Placeholder mantra for month 7'),
(8, 'Placeholder mantra for month 8'),
(9, 'Placeholder mantra for month 9'),
(10, 'Placeholder mantra for month 10'),
(11, 'Placeholder mantra for month 11'),
(12, 'Placeholder mantra for month 12');
