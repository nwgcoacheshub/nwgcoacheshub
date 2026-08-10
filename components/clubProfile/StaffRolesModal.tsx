"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import Modal from "@/components/Modal";
import { inputClass, secondaryButtonClass } from "@/components/formStyles";

export type RoleAssignment = { id: string; coachId: string; name: string };
export type ClubRole = { id: string; name: string; assignments: RoleAssignment[] };
export type RoleGroup = { id: string; name: string; roles: ClubRole[] };

export type SiteAccount = { id: string; name: string };

/**
 * Who holds which club role, grouped by category.
 *
 * Read-only for coaches; admins get an edit mode with removable chips and a
 * per-role picker. The database agrees: 0007 gives club_role_assignments a
 * site-scoped select policy but admin-only insert/update/delete, so a coach
 * who forced this into edit mode would still have every write rejected.
 *
 * The picker lists profiles at this site, because club_role_assignments.coach_id
 * references profiles — these are real accounts, not rota_coaches board entries.
 */
export default function StaffRolesModal({
  roleGroups,
  isAdmin,
  siteId,
  siteAccounts,
  onClose,
}: {
  roleGroups: RoleGroup[];
  isAdmin: boolean;
  siteId: string;
  siteAccounts: SiteAccount[];
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove(assignmentId: string) {
    setBusy(true);
    setError(null);
    const { error: deleteError } = await supabase
      .from("club_role_assignments")
      .delete()
      .eq("id", assignmentId);
    setBusy(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    router.refresh();
  }

  async function handleAdd(roleId: string, coachId: string) {
    if (!coachId) return;
    setBusy(true);
    setError(null);
    const { error: insertError } = await supabase.from("club_role_assignments").insert({
      club_role_id: roleId,
      site_id: siteId,
      coach_id: coachId,
    });
    setBusy(false);
    if (insertError) {
      // The (club_role_id, site_id, coach_id) unique constraint from 0007.
      setError(
        insertError.code === "23505"
          ? "That coach already holds this role."
          : insertError.message
      );
      return;
    }
    router.refresh();
  }

  return (
    <Modal title="Staff roles" onClose={onClose} wide>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] text-slate-light">
          Who looks after what at this club.
        </p>
        {isAdmin && (
          <button
            onClick={() => {
              setError(null);
              setEditing((v) => !v);
            }}
            className={secondaryButtonClass}
          >
            {editing ? "Done editing" : "Edit roles"}
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 text-[13px] font-semibold text-[#C25218]">{error}</p>
      )}

      <div className="space-y-5">
        {roleGroups.map((group) => (
          <section key={group.id}>
            <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.4px] text-slate-light">
              {group.name}
            </h3>
            <div className="overflow-hidden rounded-lg border border-line">
              {group.roles.map((role) => {
                const assignedIds = new Set(role.assignments.map((a) => a.coachId));
                const available = siteAccounts.filter((a) => !assignedIds.has(a.id));

                return (
                  <div
                    key={role.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 last:border-b-0"
                  >
                    <span className="text-sm font-semibold text-ink">{role.name}</span>

                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {role.assignments.length === 0 && !editing && (
                        <span className="text-[13px] text-slate-light">Unassigned</span>
                      )}

                      {role.assignments.map((assignment) => (
                        <span
                          key={assignment.id}
                          className="inline-flex items-center gap-1.5 rounded-full bg-orange-pale px-2.5 py-1 text-[12px] font-semibold text-orange"
                        >
                          {assignment.name}
                          {editing && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleRemove(assignment.id)}
                              aria-label={`Remove ${assignment.name} from ${role.name}`}
                              className="text-orange hover:text-orange-dark disabled:opacity-60"
                            >
                              ✕
                            </button>
                          )}
                        </span>
                      ))}

                      {editing && (
                        <select
                          value=""
                          disabled={busy || available.length === 0}
                          onChange={(e) => handleAdd(role.id, e.target.value)}
                          aria-label={`Add a coach to ${role.name}`}
                          className={`${inputClass} w-auto min-w-[150px] py-1 text-[13px]`}
                        >
                          <option value="">
                            {available.length === 0 ? "No one left to add" : "+ Add coach"}
                          </option>
                          {available.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {editing && siteAccounts.length === 0 && (
        <p className="mt-4 text-[13px] text-slate-light">
          No active accounts are set to this site, so there&apos;s no one to assign.
          Accounts are managed under Admin → Users.
        </p>
      )}
    </Modal>
  );
}
