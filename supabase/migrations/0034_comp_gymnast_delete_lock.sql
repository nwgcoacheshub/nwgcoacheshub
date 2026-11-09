-- NWG Coaches Hub — Competitions, phase 3d follow-up: gymnast delete lock
--
-- Closes a gap in the 0033 lock: comp_entry_lock_guard() already refuses to
-- add a gymnast once the PO amount is fixed, but nothing stopped a gymnast
-- being deleted. Found by 0033 verification test l19
-- (docs/investigations/comp-entries-0033-verification.sql).
--
-- What this file does, in order:
--   1. Refuses to run if 0033 is missing (comp_entry_lock_guard() doesn't
--      exist) or if comp_entry_gymnasts_lock_delete already exists.
--   2. Adds a BEFORE DELETE trigger on comp_entry_gymnasts that reuses
--      comp_entry_lock_guard(), so a gymnast can't be deleted once the entry
--      is po_request_sent, po_received, entered, completed or withdrawn
--      (55000). Withdraw the gymnast instead. 15 triggers in all on the comp
--      entry tables (14 from 0033).
--
-- Cascaded deletes still work: deleting a draft entry cascades to its
-- gymnasts, and FK actions run as the table owner, which the guard trusts.
-- 0033 is unchanged.
--
-- Applied and verified in the SQL Editor on 9 Nov 2026.
--
-- No down migration. To reverse it:
--   drop trigger comp_entry_gymnasts_lock_delete on public.comp_entry_gymnasts;

begin;
do $$
begin
  if to_regprocedure('public.comp_entry_lock_guard()') is null then
    raise exception '0034 aborted: 0033 is not applied. Nothing has been applied.';
  end if;
  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.comp_entry_gymnasts'::regclass
      and tgname = 'comp_entry_gymnasts_lock_delete'
  ) then
    raise exception '0034 aborted: comp_entry_gymnasts_lock_delete already exists. Nothing has been applied.';
  end if;
end
$$;
create trigger comp_entry_gymnasts_lock_delete
before delete on public.comp_entry_gymnasts
for each row
execute function public.comp_entry_lock_guard();
commit;
