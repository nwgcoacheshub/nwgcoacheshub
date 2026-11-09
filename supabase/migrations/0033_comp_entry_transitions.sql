-- NWG Coaches Hub — Competitions, phase 3d: External Entry actions and guards
--
-- Adds the actions that move an External Competition Entry through its
-- stages, and the triggers that stop those stages being set any other way.
-- Follows the 0032 header ("GATED COLUMNS"), docs/investigations/
-- competitions-phase1.md (sections 5, 6 and 15.5), the External Entry mockup
-- (reference/external-entry-mockup.html) and the approved Phase 3d Step A
-- design and decisions.
--
-- What this file does, in order:
--   1. Refuses to run if 0032 is missing, if any object below already
--      exists, if any comp entry table already has a trigger, or if the 4
--      comp entry capabilities no longer resolve to their 0032 titles.
--   2. Adds withdrawn_by, withdrawn_at and withdrawal_note to comp_entries,
--      with the same pair and note checks as the decline columns, and an
--      index on withdrawn_by.
--   3. Adds 2 internal helpers (no EXECUTE for authenticated):
--        comp_entry_for_action()           caller checks + row lock
--        comp_entry_assert_signoff_ready() the sign-off preconditions
--   4. Adds the 14 entry actions (security definer RPCs):
--        comp_entry_request_signoff      edit_comp_entries at site
--        comp_entry_sign_off             sign_off_competitions
--        comp_entry_decline              sign_off_competitions
--        comp_entry_confirm_pricing      confirm_comp_pricing at site
--        comp_entry_po_request_sent      edit_comp_entries at site
--        comp_entry_record_po_number     edit_comp_entries at site
--        comp_entry_mark_entered         edit_comp_entries at site
--        comp_entry_mark_organiser_paid  edit_comp_entries at site
--        comp_entry_complete             edit_comp_entries at site
--        comp_entry_withdraw             edit_comp_entries at site
--        comp_entry_approve_judge        approve_judges
--        comp_entry_undo_po_request      edit_comp_entries at site
--        comp_entry_undo_entered         edit_comp_entries at site
--        comp_entry_undo_organiser_paid  edit_comp_entries at site
--   5. Adds the guard triggers:
--        comp_entries_guard()      blocks direct changes to every gated
--                                  column; clears the price confirmation
--                                  when uplift_pct changes
--        comp_entry_staff_guard()  blocks direct judge approval; resets it
--                                  when the person, role or entry changes
--        comp_entry_lock_guard()   the gymnast list, fee levels and extras
--                                  are locked from the PO request onward
--        comp_entry_clear_pricing() clears the price confirmation when a
--                                  fee level or extra is added, removed or
--                                  repriced
--      14 triggers in all, on 6 of the 7 comp entry tables
--      (comp_external_details has none).
--   6. Post-checks that every new function is owned by a trusted role
--      (the guards trust the definer functions through that owner).
--
-- Stages (comp_entries.status):
--   draft -> awaiting_signoff -> collecting -> po_request_sent
--     -> po_received -> entered -> completed
--   awaiting_signoff -> declined -> awaiting_signoff (resubmitted)
--   awaiting_signoff .. entered -> withdrawn (final)
--   Undo: po_request_sent -> collecting, entered -> po_received.
--   "Ready for PO" is still derived, never stored: status 'collecting', at
--   least one non-withdrawn gymnast, and every non-withdrawn gymnast has
--   debt_added, paid and marked_paid_bars.
--
-- Errors. Every RPC checks in the create_weekly_rota (0030) order: active
-- account, capability, row (locked FOR UPDATE), site, then status and
-- preconditions. Messages are fixed and written to be shown as-is. Codes:
--   42501  deactivated, missing capability, wrong site, or a direct change
--          to a guarded column
--   P0002  entry or staff row not found
--   55000  wrong stage, or a precondition not met (including the PO lock)
--   22023  a required input (note, reason, PO number, late acknowledgement)
--          is missing or invalid
-- 0030 raised its caller checks as plain P0001; these use explicit codes, as
-- approved in Step A.
--
-- Trust. Every trigger function trusts current_user in ('postgres',
-- 'supabase_admin', 'service_role'), the list in
-- profiles_guard_privileged_columns (0026/0028). The RPCs are security
-- definer and owned by postgres, so inside them current_user is postgres
-- and their updates pass the guards. comp_entries_guard, comp_entry_staff_
-- guard and comp_entry_lock_guard are SECURITY INVOKER for the reason 0026
-- gives: a definer trigger would always see its owner and wave everyone
-- through. comp_entry_clear_pricing is SECURITY DEFINER on purpose: it is
-- how a Coach's fee edit clears a gated column (see section 5c).
--
-- 0034 is not blocked: its data-removal function will be security definer,
-- owned by postgres, so it can set data_removed_by/_at and blank gymnast
-- names; none of the guards here stop a trusted caller.
--
-- What it deliberately does NOT do:
--   * The activity log, PII redaction or data removal (0034).
--   * Lock payment ticks before sign-off (left to the app, Step A 7.2).
--   * Require judge approval for sign-off, or organiser payment for
--     completion (health warnings in the app, Step A 5d / 7.4).
--   * Undo sign-off, decline, completion or withdrawal. Withdrawn is final.
--   * Block deleting a gymnast after the PO request (the approved lock lists
--     insert, un-withdraw, fee level and extras only).
--   * Add capabilities, or touch any existing table, policy or function.
--     No app code changes.
--
-- Applied manually by Jamie as a single paste in the Supabase SQL Editor.
-- Verification: docs/investigations/comp-entries-0033-verification.sql
-- (Paste A before, Paste B after). Wrapped in an explicit transaction for the
-- reasons 0026 gives: all or nothing. No down migration, matching 0001-0032.

begin;

-- ---------------------------------------------------------------------------
-- 1. Guards
-- ---------------------------------------------------------------------------
--
-- 1a. 0032's tables exist, and none of this file's columns, functions or
--     triggers do. Any trigger already on a comp entry table means someone
--     has been here first.
-- 1b. The RPCs rely on the 4 comp entry capabilities resolving to the titles
--     0032 gave them. This file doesn't re-create the matrix, so it only
--     checks.

do $$
begin
  if to_regclass('public.comp_external_details') is null
     or to_regclass('public.comp_entries') is null
     or to_regclass('public.comp_entry_fee_levels') is null
     or to_regclass('public.comp_entry_extras') is null
     or to_regclass('public.comp_entry_gymnasts') is null
     or to_regclass('public.comp_entry_gymnast_extras') is null
     or to_regclass('public.comp_entry_staff') is null then
    raise exception
      '0033 aborted: one of the 0032 comp entry tables is missing. Apply 0032 first. Nothing has been applied.';
  end if;

  if exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'comp_entries'
      and c.column_name in ('withdrawn_by', 'withdrawn_at', 'withdrawal_note')
  ) then
    raise exception
      '0033 aborted: comp_entries already has a withdrawal column. Nothing has been applied.';
  end if;

  if exists (
    select 1 from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'comp_entry_for_action', 'comp_entry_assert_signoff_ready',
        'comp_entry_request_signoff', 'comp_entry_sign_off', 'comp_entry_decline',
        'comp_entry_confirm_pricing', 'comp_entry_po_request_sent',
        'comp_entry_record_po_number', 'comp_entry_mark_entered',
        'comp_entry_mark_organiser_paid', 'comp_entry_complete', 'comp_entry_withdraw',
        'comp_entry_approve_judge', 'comp_entry_undo_po_request',
        'comp_entry_undo_entered', 'comp_entry_undo_organiser_paid',
        'comp_entries_guard', 'comp_entry_staff_guard', 'comp_entry_lock_guard',
        'comp_entry_clear_pricing'
      )
  ) then
    raise exception
      '0033 aborted: one of the 0033 functions already exists. Nothing has been applied.';
  end if;

  if exists (
    select 1 from pg_trigger t
    where not t.tgisinternal
      and t.tgrelid in (
        'public.comp_external_details'::regclass, 'public.comp_entries'::regclass,
        'public.comp_entry_fee_levels'::regclass, 'public.comp_entry_extras'::regclass,
        'public.comp_entry_gymnasts'::regclass, 'public.comp_entry_gymnast_extras'::regclass,
        'public.comp_entry_staff'::regclass
      )
  ) then
    raise exception
      '0033 aborted: a comp entry table already has a trigger. Nothing has been applied.';
  end if;
end
$$;

do $$
declare
  v_diff text;
begin
  with
  titles (job_title) as (
    values ('Coach'), ('Lead Coach'), ('Club Head Coach'),
           ('Regional General Manager'), ('Head of Gymnastics'), ('Head of Operations')
  ),
  caps (cap) as (
    values ('edit_comp_entries'), ('sign_off_competitions'), ('approve_judges'),
           ('confirm_comp_pricing')
  ),
  expected (cap, job_title) as (
    select 'edit_comp_entries', t.job_title from titles t
    union all
    select 'sign_off_competitions', 'Head of Gymnastics'
    union all
    select 'approve_judges', t.job_title
    from (values ('Regional General Manager'), ('Head of Gymnastics')) t (job_title)
    union all
    select 'confirm_comp_pricing', t.job_title
    from (values ('Club Head Coach'), ('Head of Gymnastics')) t (job_title)
  ),
  actual (cap, job_title) as (
    select c.cap, t.job_title
    from caps c cross join titles t
    where public.title_has_capability(t.job_title, c.cap)
  ),
  diff as (
    (select 'unexpected ' || cap || ' -> ' || job_title as d from actual
     except select 'unexpected ' || cap || ' -> ' || job_title from expected)
    union all
    (select 'missing ' || cap || ' -> ' || job_title from expected
     except select 'missing ' || cap || ' -> ' || job_title from actual)
  )
  select string_agg(d, '; ' order by d) into v_diff from diff;

  if v_diff is not null then
    raise exception
      '0033 aborted: the comp entry capabilities differ from 0032 (%). Nothing has been applied.',
      v_diff;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Withdrawal columns on comp_entries
-- ---------------------------------------------------------------------------
--
-- Same shape as declined_by/_at/decline_note: by references profiles on
-- delete set null, the pair check is one-directional, and the note is
-- required once withdrawn_at is set. withdrawal_note is an entry-level
-- reason, not child data, so 0034 doesn't blank it (unlike
-- comp_entry_gymnasts.withdrawn_note). All three are gated (section 5a).
-- The 0032 insert policy predates them, so comp_entries_guard refuses them
-- on insert.

alter table public.comp_entries
  add column withdrawn_by uuid references public.profiles (id) on delete set null,
  add column withdrawn_at timestamptz,
  add column withdrawal_note text,
  add constraint comp_entries_withdrawn_pair_check
    check (withdrawn_by is null or withdrawn_at is not null),
  add constraint comp_entries_withdrawal_note_check
    check (withdrawn_at is null or btrim(coalesce(withdrawal_note, '')) <> '');

comment on column public.comp_entries.withdrawal_note is
  'Why the whole entry was withdrawn (comp_entry_withdraw). Not child data.';

create index comp_entries_withdrawn_by_idx on public.comp_entries (withdrawn_by);

-- ---------------------------------------------------------------------------
-- 3. Internal helpers
-- ---------------------------------------------------------------------------
--
-- Neither does anything an RPC couldn't do inline; they keep the 14 RPCs to
-- one set of caller checks and one copy of the sign-off preconditions.
-- EXECUTE is revoked from public, anon and authenticated, so only the RPCs
-- (running as the owner) reach them. service_role keeps its Supabase
-- default grant, as copy_into_weekly_rota (0030) does.

-- --- comp_entry_for_action ---------------------------------------------------
--
-- The caller checks, in the 0030 order, then the entry row locked FOR
-- UPDATE, so two actions on one entry run one after the other and each sees
-- the other's result. p_action completes the sentences "Your job title does
-- not have permission to ..." and "You can only ... for your own site's
-- entries". p_site_scoped is true for site-scoped capabilities
-- (has_site_capability: own site, or every site with all_sites_scope).

create function public.comp_entry_for_action(
  p_entry_id uuid,
  p_cap text,
  p_action text,
  p_site_scoped boolean
)
returns public.comp_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.comp_entries;
begin
  if not public.is_active_coach() then
    raise exception 'Your account has been deactivated'
      using errcode = '42501';
  end if;

  if not public.has_capability(p_cap) then
    raise exception 'Your job title does not have permission to %', p_action
      using errcode = '42501';
  end if;

  select en.* into v_entry
  from public.comp_entries en
  where en.id = p_entry_id
  for update;

  if not found then
    raise exception 'Competition entry not found'
      using errcode = 'P0002';
  end if;

  if p_site_scoped and not public.has_site_capability(p_cap, v_entry.site_id) then
    raise exception 'You can only % for your own site''s entries', p_action
      using errcode = '42501';
  end if;

  return v_entry;
end;
$$;

revoke all on function public.comp_entry_for_action(uuid, text, text, boolean) from public;
revoke all on function public.comp_entry_for_action(uuid, text, text, boolean) from anon;
revoke all on function public.comp_entry_for_action(uuid, text, text, boolean) from authenticated;

-- --- comp_entry_assert_signoff_ready -------------------------------------------
--
-- Checked when sign-off is requested and again at sign-off, since gymnasts
-- and the deadline stay editable while an entry waits. Withdrawn gymnasts
-- don't count.

create function public.comp_entry_assert_signoff_ready(p_entry_id uuid, p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.comp_entry_gymnasts g
    where g.entry_id = p_entry_id and not g.withdrawn
  ) then
    raise exception 'Add at least one gymnast before sign-off'
      using errcode = '55000';
  end if;

  if exists (
    select 1 from public.comp_entry_gymnasts g
    where g.entry_id = p_entry_id and not g.withdrawn and g.fee_level_id is null
  ) then
    raise exception 'Every gymnast needs a fee level before sign-off'
      using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.comp_external_details d
    where d.event_id = p_event_id and d.entry_deadline is not null
  ) then
    raise exception 'Set the competition''s entry deadline before sign-off'
      using errcode = '55000';
  end if;
end;
$$;

revoke all on function public.comp_entry_assert_signoff_ready(uuid, uuid) from public;
revoke all on function public.comp_entry_assert_signoff_ready(uuid, uuid) from anon;
revoke all on function public.comp_entry_assert_signoff_ready(uuid, uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Entry actions
-- ---------------------------------------------------------------------------
--
-- All 14: language plpgsql, security definer, search_path '', returns void
-- (the app refreshes after each call, as it does after create_weekly_rota).
-- Every *_by is auth.uid(), which is unchanged under security definer.
-- Every update also sets updated_at, which has no trigger (0032).
-- "Today" is the Europe/London date, as in create_weekly_rota.
-- Grants: revoke all from public and anon, execute to authenticated.

-- --- 1. comp_entry_request_signoff ---------------------------------------------
--
-- From draft, or from declined (a resubmission: the decline fields are
-- cleared; the 0034 activity log keeps the history). An entry can't be
-- recreated while a declined one exists (unique (event_id, site_id), and
-- only drafts can be deleted), so resubmission is the only way back.

create function public.comp_entry_request_signoff(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.comp_entries;
begin
  v_entry := public.comp_entry_for_action(
    p_entry_id, 'edit_comp_entries', 'request sign-off', true);

  if v_entry.status not in ('draft', 'declined') then
    raise exception 'Sign-off can only be requested for a draft or declined entry'
      using errcode = '55000';
  end if;

  perform public.comp_entry_assert_signoff_ready(v_entry.id, v_entry.event_id);

  update public.comp_entries
     set status = 'awaiting_signoff',
         signoff_requested_by = auth.uid(),
         signoff_requested_at = now(),
         declined_by = null,
         declined_at = null,
         decline_note = null,
         updated_at = now()
   where id = v_entry.id;
end;
$$;

revoke all on function public.comp_entry_request_signoff(uuid) from public;
revoke all on function public.comp_entry_request_signoff(uuid) from anon;
grant execute on function public.comp_entry_request_signoff(uuid) to authenticated;

-- --- 2. comp_entry_sign_off ----------------------------------------------------
--
-- Head of Gymnastics only (sign_off_competitions, global). Re-checks the
-- sign-off preconditions. Late = entry_deadline minus 28 days is before
-- today: the PO request will go in under 4 weeks before the deadline. A
-- late sign-off needs p_acknowledge_late = true, and stores
-- late_notice_acknowledged = true; an on-time one stores false whatever is
-- passed. Judge approval is not required (a health warning in the app).

create function public.comp_entry_sign_off(p_entry_id uuid, p_acknowledge_late boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.comp_entries;
  v_deadline date;
  v_late boolean;
begin
  v_entry := public.comp_entry_for_action(
    p_entry_id, 'sign_off_competitions', 'sign off competition entries', false);

  if v_entry.status <> 'awaiting_signoff' then
    raise exception 'This entry is not awaiting sign-off'
      using errcode = '55000';
  end if;

  perform public.comp_entry_assert_signoff_ready(v_entry.id, v_entry.event_id);

  select d.entry_deadline into v_deadline
  from public.comp_external_details d
  where d.event_id = v_entry.event_id;

  v_late := v_deadline - 28 < (now() at time zone 'Europe/London')::date;

  if v_late and not coalesce(p_acknowledge_late, false) then
    raise exception 'This entry is late: the PO request will be under 4 weeks before the entry deadline. Acknowledge the late notice to sign off'
      using errcode = '22023';
  end if;

  update public.comp_entries
     set status = 'collecting',
         signed_off_by = auth.uid(),
         signed_off_at = now(),
         late_notice_acknowledged = v_late,
         updated_at = now()
   where id = v_entry.id;
end;
$$;

revoke all on function public.comp_entry_sign_off(uuid, boolean) from public;
revoke all on function public.comp_entry_sign_off(uuid, boolean) from anon;
grant execute on function public.comp_entry_sign_off(uuid, boolean) to authenticated;

-- --- 3. comp_entry_decline -----------------------------------------------------
--
-- sign_off_competitions. The note is required (and by
-- comp_entries_decline_note_check). signoff_requested_* are kept; a
-- resubmission overwrites them.

create function public.comp_entry_decline(p_entry_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.comp_entries;
begin
  v_entry := public.comp_entry_for_action(
    p_entry_id, 'sign_off_competitions', 'decline competition entries', false);

  if v_entry.status <> 'awaiting_signoff' then
    raise exception 'This entry is not awaiting sign-off'
      using errcode = '55000';
  end if;

  if btrim(coalesce(p_note, '')) = '' then
    raise exception 'A note is required to decline an entry'
      using errcode = '22023';
  end if;

  update public.comp_entries
     set status = 'declined',
         declined_by = auth.uid(),
         declined_at = now(),
         decline_note = btrim(p_note),
         updated_at = now()
   where id = v_entry.id;
end;
$$;

revoke all on function public.comp_entry_decline(uuid, text) from public;
revoke all on function public.comp_entry_decline(uuid, text) from anon;
grant execute on function public.comp_entry_decline(uuid, text) to authenticated;

-- --- 4. comp_entry_confirm_pricing ---------------------------------------------
--
-- confirm_comp_pricing at the entry's site: Club Head Coach at their own
-- site, Head of Gymnastics at every site. Allowed at any open stage (the
-- mockup confirms before sign-off), so a confirmation cleared by a price
-- change (sections 5a and 5c) can be given again. Refused if already
-- confirmed, so the log holds one confirmation per price list.

create function public.comp_entry_confirm_pricing(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.comp_entries;
begin
  v_entry := public.comp_entry_for_action(
    p_entry_id, 'confirm_comp_pricing', 'confirm parent prices', true);

  if v_entry.status in ('completed', 'declined', 'withdrawn') then
    raise exception 'Prices can''t be confirmed on a completed, declined or withdrawn entry'
      using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.comp_entry_fee_levels f where f.entry_id = v_entry.id
  ) then
    raise exception 'Add at least one fee level before confirming prices'
      using errcode = '55000';
  end if;

  if v_entry.pricing_confirmed_at is not null then
    raise exception 'Parent prices are already confirmed'
      using errcode = '55000';
  end if;

  update public.comp_entries
     set pricing_confirmed_by = auth.uid(),
         pricing_confirmed_at = now(),
         updated_at = now()
   where id = v_entry.id;
end;
$$;

revoke all on function public.comp_entry_confirm_pricing(uuid) from public;
revoke all on function public.comp_entry_confirm_pricing(uuid) from anon;
grant execute on function public.comp_entry_confirm_pricing(uuid) to authenticated;

-- --- 5. comp_entry_po_request_sent ---------------------------------------------
--
-- From collecting, only when the derived "Ready for PO" holds and prices
-- are confirmed. The Hub doesn't send the email; this records that it was
-- sent. From here on the gymnast list and prices are locked (section 5d).

create function public.comp_entry_po_request_sent(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.comp_entries;
begin
  v_entry := public.comp_entry_for_action(
    p_entry_id, 'edit_comp_entries', 'mark the PO request as sent', true);

  if v_entry.status <> 'collecting' then
    raise exception 'The PO request can only be marked as sent while payments are being collected'
      using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.comp_entry_gymnasts g
    where g.entry_id = v_entry.id and not g.withdrawn
  ) then
    raise exception 'The entry has no gymnasts'
      using errcode = '55000';
  end if;

  if exists (
    select 1 from public.comp_entry_gymnasts g
    where g.entry_id = v_entry.id
      and not g.withdrawn
      and not (g.debt_added and g.paid and g.marked_paid_bars)
  ) then
    raise exception 'Not every gymnast has debt added, paid and marked paid on BARS yet'
      using errcode = '55000';
  end if;

  if v_entry.pricing_confirmed_at is null then
    raise exception 'Parent prices must be confirmed before the PO request is sent'
      using errcode = '55000';
  end if;

  update public.comp_entries
     set status = 'po_request_sent',
         po_requested_by = auth.uid(),
         po_requested_at = now(),
         updated_at = now()
   where id = v_entry.id;
end;
$$;

revoke all on function public.comp_entry_po_request_sent(uuid) from public;
revoke all on function public.comp_entry_po_request_sent(uuid) from anon;
grant execute on function public.comp_entry_po_request_sent(uuid) to authenticated;

-- --- 6. comp_entry_record_po_number --------------------------------------------
--
-- From po_request_sent: records the number and moves to po_received.
-- At po_received or entered: corrects the number only (status and
-- po_received_* unchanged; the 0034 log records the correction). The number
-- is trimmed and must be 1-100 characters (comp_entries_po_number_check).

create function public.comp_entry_record_po_number(p_entry_id uuid, p_po_number text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.comp_entries;
  v_po text := btrim(p_po_number);
begin
  v_entry := public.comp_entry_for_action(
    p_entry_id, 'edit_comp_entries', 'record a PO number', true);

  if v_entry.status not in ('po_request_sent', 'po_received', 'entered') then
    raise exception 'A PO number can only be recorded after the PO request is sent'
      using errcode = '55000';
  end if;

  if v_po is null or length(v_po) not between 1 and 100 then
    raise exception 'Enter a PO number (up to 100 characters)'
      using errcode = '22023';
  end if;

  if v_entry.status = 'po_request_sent' then
    update public.comp_entries
       set status = 'po_received',
           po_number = v_po,
           po_received_by = auth.uid(),
           po_received_at = now(),
           updated_at = now()
     where id = v_entry.id;
  else
    update public.comp_entries
       set po_number = v_po,
           updated_at = now()
     where id = v_entry.id;
  end if;
end;
$$;

revoke all on function public.comp_entry_record_po_number(uuid, text) from public;
revoke all on function public.comp_entry_record_po_number(uuid, text) from anon;
grant execute on function public.comp_entry_record_po_number(uuid, text) to authenticated;

-- --- 7. comp_entry_mark_entered --------------------------------------------------

create function public.comp_entry_mark_entered(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.comp_entries;
begin
  v_entry := public.comp_entry_for_action(
    p_entry_id, 'edit_comp_entries', 'mark an entry as entered', true);

  if v_entry.status <> 'po_received' then
    raise exception 'An entry can only be marked as entered once its PO number is recorded'
      using errcode = '55000';
  end if;

  update public.comp_entries
     set status = 'entered',
         entered_by = auth.uid(),
         entered_at = now(),
         updated_at = now()
   where id = v_entry.id;
end;
$$;

revoke all on function public.comp_entry_mark_entered(uuid) from public;
revoke all on function public.comp_entry_mark_entered(uuid) from anon;
grant execute on function public.comp_entry_mark_entered(uuid) to authenticated;

-- --- 8. comp_entry_mark_organiser_paid -------------------------------------------
--
-- At po_received or entered, independent of status.

create function public.comp_entry_mark_organiser_paid(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.comp_entries;
begin
  v_entry := public.comp_entry_for_action(
    p_entry_id, 'edit_comp_entries', 'mark the organiser as paid', true);

  if v_entry.status not in ('po_received', 'entered') then
    raise exception 'The organiser can only be marked as paid once the PO number is recorded'
      using errcode = '55000';
  end if;

  if v_entry.organiser_paid_at is not null then
    raise exception 'The organiser is already marked as paid'
      using errcode = '55000';
  end if;

  update public.comp_entries
     set organiser_paid_by = auth.uid(),
         organiser_paid_at = now(),
         updated_at = now()
   where id = v_entry.id;
end;
$$;

revoke all on function public.comp_entry_mark_organiser_paid(uuid) from public;
revoke all on function public.comp_entry_mark_organiser_paid(uuid) from anon;
grant execute on function public.comp_entry_mark_organiser_paid(uuid) to authenticated;

-- --- 9. comp_entry_complete ------------------------------------------------------
--
-- From entered, on or after the competition's last day (London). Organiser
-- payment is not required (a health warning in the app).

create function public.comp_entry_complete(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.comp_entries;
  v_end date;
begin
  v_entry := public.comp_entry_for_action(
    p_entry_id, 'edit_comp_entries', 'complete an entry', true);

  if v_entry.status <> 'entered' then
    raise exception 'Only an entry that has been entered with the organiser can be completed'
      using errcode = '55000';
  end if;

  select e.end_date into v_end
  from public.comp_events e
  where e.id = v_entry.event_id;

  if (now() at time zone 'Europe/London')::date < v_end then
    raise exception 'An entry can only be completed on or after the last day of the competition'
      using errcode = '55000';
  end if;

  update public.comp_entries
     set status = 'completed',
         completed_by = auth.uid(),
         completed_at = now(),
         updated_at = now()
   where id = v_entry.id;
end;
$$;

revoke all on function public.comp_entry_complete(uuid) from public;
revoke all on function public.comp_entry_complete(uuid) from anon;
grant execute on function public.comp_entry_complete(uuid) to authenticated;

-- --- 10. comp_entry_withdraw ------------------------------------------------------
--
-- From any submitted, open stage. A draft is deleted instead (0032's delete
-- policy). Withdrawn is final: there is no undo, and the entry keeps its
-- (event, site) slot.

create function public.comp_entry_withdraw(p_entry_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.comp_entries;
begin
  v_entry := public.comp_entry_for_action(
    p_entry_id, 'edit_comp_entries', 'withdraw an entry', true);

  if v_entry.status not in (
    'awaiting_signoff', 'collecting', 'po_request_sent', 'po_received', 'entered'
  ) then
    raise exception 'This entry can''t be withdrawn at its current stage. A draft is deleted instead'
      using errcode = '55000';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required to withdraw an entry'
      using errcode = '22023';
  end if;

  update public.comp_entries
     set status = 'withdrawn',
         withdrawn_by = auth.uid(),
         withdrawn_at = now(),
         withdrawal_note = btrim(p_reason),
         updated_at = now()
   where id = v_entry.id;
end;
$$;

revoke all on function public.comp_entry_withdraw(uuid, text) from public;
revoke all on function public.comp_entry_withdraw(uuid, text) from anon;
grant execute on function public.comp_entry_withdraw(uuid, text) to authenticated;

-- --- 11. comp_entry_approve_judge -------------------------------------------------
--
-- approve_judges (global: Regional General Manager, Head of Gymnastics, who
-- both hold view_all_sites), so no site check. Works on a comp_entry_staff
-- row, which is locked FOR UPDATE. Self-approval is allowed (Step A 7.7).
-- The judge's profile must still be active (0032 leaves "the picked profile
-- is active" to 0033).

create function public.comp_entry_approve_judge(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff public.comp_entry_staff;
  v_status text;
begin
  if not public.is_active_coach() then
    raise exception 'Your account has been deactivated'
      using errcode = '42501';
  end if;

  if not public.has_capability('approve_judges') then
    raise exception 'Your job title does not have permission to approve judges'
      using errcode = '42501';
  end if;

  select s.* into v_staff
  from public.comp_entry_staff s
  where s.id = p_staff_id
  for update;

  if not found then
    raise exception 'Staff member not found on this entry'
      using errcode = 'P0002';
  end if;

  if v_staff.staff_role <> 'judge' then
    raise exception 'Only judges need approval'
      using errcode = '55000';
  end if;

  if v_staff.judge_approved_at is not null then
    raise exception 'This judge is already approved'
      using errcode = '55000';
  end if;

  select en.status into v_status
  from public.comp_entries en
  where en.id = v_staff.entry_id;

  if v_status in ('completed', 'declined', 'withdrawn') then
    raise exception 'Judges can''t be approved on a completed, declined or withdrawn entry'
      using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = v_staff.profile_id and p.active
  ) then
    raise exception 'This judge''s account has been deactivated'
      using errcode = '55000';
  end if;

  update public.comp_entry_staff
     set judge_approved_by = auth.uid(),
         judge_approved_at = now()
   where id = v_staff.id;
end;
$$;

revoke all on function public.comp_entry_approve_judge(uuid) from public;
revoke all on function public.comp_entry_approve_judge(uuid) from anon;
grant execute on function public.comp_entry_approve_judge(uuid) to authenticated;

-- --- 12. comp_entry_undo_po_request -----------------------------------------------
--
-- po_request_sent -> collecting, for a request ticked by mistake. Only before
-- the PO number is recorded. Unlocks the gymnast list and prices.

create function public.comp_entry_undo_po_request(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.comp_entries;
begin
  v_entry := public.comp_entry_for_action(
    p_entry_id, 'edit_comp_entries', 'undo the PO request', true);

  if v_entry.status <> 'po_request_sent' then
    raise exception 'The PO request can only be undone before the PO number is recorded'
      using errcode = '55000';
  end if;

  update public.comp_entries
     set status = 'collecting',
         po_requested_by = null,
         po_requested_at = null,
         updated_at = now()
   where id = v_entry.id;
end;
$$;

revoke all on function public.comp_entry_undo_po_request(uuid) from public;
revoke all on function public.comp_entry_undo_po_request(uuid) from anon;
grant execute on function public.comp_entry_undo_po_request(uuid) to authenticated;

-- --- 13. comp_entry_undo_entered ---------------------------------------------------
--
-- entered -> po_received. Not after completion.

create function public.comp_entry_undo_entered(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.comp_entries;
begin
  v_entry := public.comp_entry_for_action(
    p_entry_id, 'edit_comp_entries', 'undo entered', true);

  if v_entry.status <> 'entered' then
    raise exception 'Only an entry marked as entered (and not completed) can be un-marked'
      using errcode = '55000';
  end if;

  update public.comp_entries
     set status = 'po_received',
         entered_by = null,
         entered_at = null,
         updated_at = now()
   where id = v_entry.id;
end;
$$;

revoke all on function public.comp_entry_undo_entered(uuid) from public;
revoke all on function public.comp_entry_undo_entered(uuid) from anon;
grant execute on function public.comp_entry_undo_entered(uuid) to authenticated;

-- --- 14. comp_entry_undo_organiser_paid ------------------------------------------
--
-- Clears organiser_paid_* at po_received or entered (the stages where it can
-- be set). Not after completion.

create function public.comp_entry_undo_organiser_paid(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.comp_entries;
begin
  v_entry := public.comp_entry_for_action(
    p_entry_id, 'edit_comp_entries', 'undo organiser paid', true);

  if v_entry.status not in ('po_received', 'entered') then
    raise exception 'Organiser paid can only be undone before the entry is completed'
      using errcode = '55000';
  end if;

  if v_entry.organiser_paid_at is null then
    raise exception 'The organiser is not marked as paid'
      using errcode = '55000';
  end if;

  update public.comp_entries
     set organiser_paid_by = null,
         organiser_paid_at = null,
         updated_at = now()
   where id = v_entry.id;
end;
$$;

revoke all on function public.comp_entry_undo_organiser_paid(uuid) from public;
revoke all on function public.comp_entry_undo_organiser_paid(uuid) from anon;
grant execute on function public.comp_entry_undo_organiser_paid(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Guard triggers
-- ---------------------------------------------------------------------------
--
-- Trusted roles, copied from profiles_guard_privileged_columns (0026/0028):
-- postgres, supabase_admin, service_role. Under PostgREST current_user is
-- authenticated; in the SQL Editor it is postgres; for the secret-key routes
-- it is service_role; inside the definer RPCs above it is their owner,
-- postgres. FK actions (on delete set null / cascade) run as the table
-- owner, so they are trusted too.
--
-- These are trigger functions, not helpers. Firing a trigger doesn't check
-- EXECUTE and a trigger function can't be called directly. The revokes are
-- there only so they don't appear callable (the 0026 note).

-- --- 5a. comp_entries_guard --------------------------------------------------
--
-- UPDATE: an untrusted caller may not change any gated column: the 0032 list
-- (status, late_notice_acknowledged, every who/when pair, decline_note,
-- po_number, event_id, site_id, created_by) plus withdrawn_by/_at and
-- withdrawal_note. notes, judges_required, uplift_pct and updated_at stay
-- editable.
--
-- INSERT: the 0032 insert policy already forces every 0032 gated column
-- empty but predates the withdrawal columns, so an untrusted insert must
-- leave those 3 empty.
--
-- Price confirmation: after the check, for every caller, a change to
-- uplift_pct clears pricing_confirmed_by/_at in the same row. The check runs
-- on what the caller sent, so a Coach changing the uplift is never refused.
--
-- The WHEN clause on the update trigger keeps ordinary edits (notes,
-- judges_required, updated_at) out of the function.

create function public.comp_entries_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    if tg_op = 'INSERT' then
      if num_nonnulls(new.withdrawn_by, new.withdrawn_at, new.withdrawal_note) > 0 then
        raise exception 'Status, sign-off and PO fields can only be changed through the entry actions'
          using errcode = '42501';
      end if;
    elsif (
      old.status, old.late_notice_acknowledged,
      old.signoff_requested_by, old.signoff_requested_at,
      old.signed_off_by, old.signed_off_at,
      old.declined_by, old.declined_at, old.decline_note,
      old.pricing_confirmed_by, old.pricing_confirmed_at,
      old.po_requested_by, old.po_requested_at, old.po_number,
      old.po_received_by, old.po_received_at,
      old.entered_by, old.entered_at,
      old.organiser_paid_by, old.organiser_paid_at,
      old.completed_by, old.completed_at,
      old.data_removed_by, old.data_removed_at,
      old.withdrawn_by, old.withdrawn_at, old.withdrawal_note,
      old.event_id, old.site_id, old.created_by
    ) is distinct from (
      new.status, new.late_notice_acknowledged,
      new.signoff_requested_by, new.signoff_requested_at,
      new.signed_off_by, new.signed_off_at,
      new.declined_by, new.declined_at, new.decline_note,
      new.pricing_confirmed_by, new.pricing_confirmed_at,
      new.po_requested_by, new.po_requested_at, new.po_number,
      new.po_received_by, new.po_received_at,
      new.entered_by, new.entered_at,
      new.organiser_paid_by, new.organiser_paid_at,
      new.completed_by, new.completed_at,
      new.data_removed_by, new.data_removed_at,
      new.withdrawn_by, new.withdrawn_at, new.withdrawal_note,
      new.event_id, new.site_id, new.created_by
    ) then
      raise exception 'Status, sign-off and PO fields can only be changed through the entry actions'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.uplift_pct is distinct from old.uplift_pct then
      new.pricing_confirmed_by := null;
      new.pricing_confirmed_at := null;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.comp_entries_guard() from public;
revoke execute on function public.comp_entries_guard() from anon;

create trigger comp_entries_guard_insert
before insert on public.comp_entries
for each row
execute function public.comp_entries_guard();

create trigger comp_entries_guard_update
before update on public.comp_entries
for each row
when (
  (
    old.status, old.late_notice_acknowledged,
    old.signoff_requested_by, old.signoff_requested_at,
    old.signed_off_by, old.signed_off_at,
    old.declined_by, old.declined_at, old.decline_note,
    old.pricing_confirmed_by, old.pricing_confirmed_at,
    old.po_requested_by, old.po_requested_at, old.po_number,
    old.po_received_by, old.po_received_at,
    old.entered_by, old.entered_at,
    old.organiser_paid_by, old.organiser_paid_at,
    old.completed_by, old.completed_at,
    old.data_removed_by, old.data_removed_at,
    old.withdrawn_by, old.withdrawn_at, old.withdrawal_note,
    old.event_id, old.site_id, old.created_by,
    old.uplift_pct
  ) is distinct from (
    new.status, new.late_notice_acknowledged,
    new.signoff_requested_by, new.signoff_requested_at,
    new.signed_off_by, new.signed_off_at,
    new.declined_by, new.declined_at, new.decline_note,
    new.pricing_confirmed_by, new.pricing_confirmed_at,
    new.po_requested_by, new.po_requested_at, new.po_number,
    new.po_received_by, new.po_received_at,
    new.entered_by, new.entered_at,
    new.organiser_paid_by, new.organiser_paid_at,
    new.completed_by, new.completed_at,
    new.data_removed_by, new.data_removed_at,
    new.withdrawn_by, new.withdrawn_at, new.withdrawal_note,
    new.event_id, new.site_id, new.created_by,
    new.uplift_pct
  )
)
execute function public.comp_entries_guard();

-- --- 5b. comp_entry_staff_guard ----------------------------------------------
--
-- If profile_id, staff_role or entry_id changes, the approval no longer
-- applies to that person in that role on that entry, so it is reset to
-- null, for every caller. (entry_id is included so an approved judge row
-- can't be moved to another entry with its approval.) Resetting before the
-- row is checked also satisfies comp_entry_staff_judge_approval_role_check
-- when a judge becomes a coach. Otherwise an untrusted caller may not change
-- judge_approved_by/_at: approval goes through comp_entry_approve_judge.

create function public.comp_entry_staff_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (old.profile_id, old.staff_role, old.entry_id)
     is distinct from (new.profile_id, new.staff_role, new.entry_id) then
    new.judge_approved_by := null;
    new.judge_approved_at := null;
  elsif current_user not in ('postgres', 'supabase_admin', 'service_role')
        and (old.judge_approved_by, old.judge_approved_at)
            is distinct from (new.judge_approved_by, new.judge_approved_at) then
    raise exception 'Judges can only be approved through Approve judge'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.comp_entry_staff_guard() from public;
revoke execute on function public.comp_entry_staff_guard() from anon;

create trigger comp_entry_staff_guard
before update on public.comp_entry_staff
for each row
when (
  (old.profile_id, old.staff_role, old.entry_id, old.judge_approved_by, old.judge_approved_at)
  is distinct from
  (new.profile_id, new.staff_role, new.entry_id, new.judge_approved_by, new.judge_approved_at)
)
execute function public.comp_entry_staff_guard();

-- --- 5c. comp_entry_clear_pricing --------------------------------------------
--
-- Parent prices come from the fee levels, the extras and uplift_pct. Any
-- change to what parents pay clears the confirmation, so it has to be given
-- again:
--   * a fee level or extra added or removed (AFTER INSERT / DELETE);
--   * a fee level's organiser_fee or an extra's price changed, or the row
--     moved to another entry (AFTER UPDATE, narrowed by WHEN). A label or
--     sort order change doesn't clear it;
--   * uplift_pct changed (handled in comp_entries_guard, 5a).
--
-- SECURITY DEFINER on purpose, unlike the guards. It has to clear a gated
-- column on behalf of an ordinary Coach editing a fee. Running as its owner
-- (postgres, trusted), its update passes comp_entries_guard. It only ever
-- sets the pair to null, on the entries the triggering row belongs to, and
-- does nothing when no confirmation is set. During an entry delete the
-- cascaded rows find no parent left, and nothing happens.

create function public.comp_entry_clear_pricing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_entry uuid;
  v_new_entry uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_entry := old.entry_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_entry := new.entry_id;
  end if;

  update public.comp_entries en
     set pricing_confirmed_by = null,
         pricing_confirmed_at = null
   where en.id in (v_old_entry, v_new_entry)
     and en.pricing_confirmed_at is not null;

  return null;
end;
$$;

revoke execute on function public.comp_entry_clear_pricing() from public;
revoke execute on function public.comp_entry_clear_pricing() from anon;
revoke execute on function public.comp_entry_clear_pricing() from authenticated;

create trigger comp_entry_fee_levels_clear_pricing
after insert or delete on public.comp_entry_fee_levels
for each row
execute function public.comp_entry_clear_pricing();

create trigger comp_entry_fee_levels_clear_pricing_update
after update on public.comp_entry_fee_levels
for each row
when ((old.organiser_fee, old.entry_id) is distinct from (new.organiser_fee, new.entry_id))
execute function public.comp_entry_clear_pricing();

create trigger comp_entry_extras_clear_pricing
after insert or delete on public.comp_entry_extras
for each row
execute function public.comp_entry_clear_pricing();

create trigger comp_entry_extras_clear_pricing_update
after update on public.comp_entry_extras
for each row
when ((old.price, old.entry_id) is distinct from (new.price, new.entry_id))
execute function public.comp_entry_clear_pricing();

-- --- 5d. comp_entry_lock_guard -----------------------------------------------
--
-- Once an entry is po_request_sent, po_received, entered, completed or
-- withdrawn, the PO amount is fixed, so an untrusted caller may not:
--   comp_entry_gymnasts        insert a gymnast; un-withdraw one; change a
--                              non-withdrawn gymnast's fee_level_id
--   comp_entry_gymnast_extras  insert or delete a row
--   comp_entry_fee_levels      insert, delete, or change organiser_fee
--   comp_entry_extras          insert, delete, or change price
-- Moving a row to another entry (entry_id) counts as a change on both
-- entries. Withdrawing a gymnast, gymnast notes and payment fields, and fee
-- level / extra labels stay editable. undo_po_request unlocks the list.
--
-- The entry is read FOR SHARE, so a change here and a PO request on the
-- same entry run one after the other: either the PO request waits and then
-- sees the new gymnast (not yet paid, so not Ready for PO), or the change
-- waits and then sees po_request_sent and is refused. The caller can always
-- read that row: writing a child row needs edit_comp_entries at its site,
-- which passes the comp_entries select and update policies. If it can't,
-- the row is not found, nothing is locked here, and RLS refuses the write.
--
-- One function for the 4 tables (branching on tg_table_name). The update
-- triggers have WHEN clauses, so payment ticks and label edits on gymnasts,
-- fee levels and extras never reach it.

create function public.comp_entry_lock_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_entry_ids uuid[];
  v_locks boolean := false;
  v_locked boolean;
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_entry_ids := array[new.entry_id];
    v_locks := true;
  elsif tg_op = 'DELETE' then
    v_entry_ids := array[old.entry_id];
    v_locks := true;
  else
    v_entry_ids := array[old.entry_id, new.entry_id];
    if old.entry_id is distinct from new.entry_id then
      v_locks := true;
    elsif tg_table_name = 'comp_entry_gymnasts' then
      v_locks := (old.withdrawn and not new.withdrawn)
                 or (not old.withdrawn and not new.withdrawn
                     and old.fee_level_id is distinct from new.fee_level_id);
    elsif tg_table_name = 'comp_entry_fee_levels' then
      v_locks := old.organiser_fee is distinct from new.organiser_fee;
    elsif tg_table_name = 'comp_entry_extras' then
      v_locks := old.price is distinct from new.price;
    end if;
  end if;

  if not v_locks then
    return new;
  end if;

  select coalesce(bool_or(s.status in (
           'po_request_sent', 'po_received', 'entered', 'completed', 'withdrawn')), false)
    into v_locked
  from (
    select en.status
    from public.comp_entries en
    where en.id = any (v_entry_ids)
    for share
  ) s;

  if v_locked then
    if tg_table_name in ('comp_entry_gymnasts', 'comp_entry_gymnast_extras') then
      raise exception 'The gymnast list is locked once the PO request is sent — undo the PO request to change it'
        using errcode = '55000';
    else
      raise exception 'Fee levels and extras are locked once the PO request is sent — undo the PO request to change them'
        using errcode = '55000';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.comp_entry_lock_guard() from public;
revoke execute on function public.comp_entry_lock_guard() from anon;

create trigger comp_entry_gymnasts_lock_insert
before insert on public.comp_entry_gymnasts
for each row
execute function public.comp_entry_lock_guard();

create trigger comp_entry_gymnasts_lock_update
before update on public.comp_entry_gymnasts
for each row
when (
  (old.entry_id, old.withdrawn, old.fee_level_id)
  is distinct from (new.entry_id, new.withdrawn, new.fee_level_id)
)
execute function public.comp_entry_lock_guard();

create trigger comp_entry_gymnast_extras_lock
before insert or delete on public.comp_entry_gymnast_extras
for each row
execute function public.comp_entry_lock_guard();

create trigger comp_entry_fee_levels_lock
before insert or delete on public.comp_entry_fee_levels
for each row
execute function public.comp_entry_lock_guard();

create trigger comp_entry_fee_levels_lock_update
before update on public.comp_entry_fee_levels
for each row
when ((old.organiser_fee, old.entry_id) is distinct from (new.organiser_fee, new.entry_id))
execute function public.comp_entry_lock_guard();

create trigger comp_entry_extras_lock
before insert or delete on public.comp_entry_extras
for each row
execute function public.comp_entry_lock_guard();

create trigger comp_entry_extras_lock_update
before update on public.comp_entry_extras
for each row
when ((old.price, old.entry_id) is distinct from (new.price, new.entry_id))
execute function public.comp_entry_lock_guard();

-- ---------------------------------------------------------------------------
-- 6. Post-check: owners
-- ---------------------------------------------------------------------------
--
-- The guards let the definer functions through only because their owner is
-- trusted. If this file were run as some other role, every RPC would be
-- refused by the guards (and comp_entry_clear_pricing would fail), so stop
-- here instead. Also confirms all 20 functions were created.

do $$
declare
  v_count int;
  v_bad text;
begin
  select count(*),
         string_agg(p.proname || ' (' || pg_get_userbyid(p.proowner) || ')', ', ')
           filter (where pg_get_userbyid(p.proowner) not in ('postgres', 'supabase_admin', 'service_role'))
    into v_count, v_bad
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in (
      'comp_entry_for_action', 'comp_entry_assert_signoff_ready',
      'comp_entry_request_signoff', 'comp_entry_sign_off', 'comp_entry_decline',
      'comp_entry_confirm_pricing', 'comp_entry_po_request_sent',
      'comp_entry_record_po_number', 'comp_entry_mark_entered',
      'comp_entry_mark_organiser_paid', 'comp_entry_complete', 'comp_entry_withdraw',
      'comp_entry_approve_judge', 'comp_entry_undo_po_request',
      'comp_entry_undo_entered', 'comp_entry_undo_organiser_paid',
      'comp_entries_guard', 'comp_entry_staff_guard', 'comp_entry_lock_guard',
      'comp_entry_clear_pricing'
    );

  if v_count <> 20 then
    raise exception
      '0033 aborted: expected 20 new functions, found %. Nothing has been applied.', v_count;
  end if;

  if v_bad is not null then
    raise exception
      '0033 aborted: these functions are not owned by a trusted role: %. Run this file as postgres. Nothing has been applied.',
      v_bad;
  end if;
end
$$;

commit;
