-- NWG Coaches Hub — Rota Tool, phase 2
-- Adds `status` to rota_standard_roster.
--
-- Phase 1 (0002) put `status` on rota_weekly_roster only, per the spec it was
-- written from. The Standard Rota board needs the same Working/Leave/Sick
-- value per coach per day so the template can reflect a coach's usual
-- pattern, so the column is mirrored here with the same default and check.

alter table public.rota_standard_roster
  add column status text not null default 'working'
    check (status in ('working', 'leave', 'sick'));
