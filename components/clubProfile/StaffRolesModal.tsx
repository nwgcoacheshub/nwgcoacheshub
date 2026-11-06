"use client";

import { startTransition, useOptimistic, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import Modal from "@/components/Modal";
import { secondaryButtonClass } from "@/components/formStyles";

export type RoleAssignment = { id: string; coachId: string; name: string };
export type ClubRole = { id: string; name: string; assignments: RoleAssignment[] };
export type RoleGroup = { id: string; name: string; roles: ClubRole[] };

export type SiteAccount = { id: string; name: string };

type RoleEdit =
  | { kind: "add"; roleId: string; assignment: RoleAssignment }
  | { kind: "remove"; assignmentId: string };

// Prefix for the placeholder id an optimistic chip carries until the refresh
// brings the real row. Its ✕ stays disabled, since there's nothing to delete yet.
const OPTIMISTIC_ID = "optimistic:";

// A write that returned no rows: refused by RLS, or the data changed elsewhere.
const UNSAVED_MESSAGE = "That change didn't save. The list has been refreshed.";

function applyRoleEdit(groups: RoleGroup[], edit: RoleEdit): RoleGroup[] {
  return groups.map((group) => ({
    ...group,
    roles: group.roles.map((role) => {
      if (edit.kind === "add") {
        if (role.id !== edit.roleId) return role;
        return {
          ...role,
          assignments: [...role.assignments, edit.assignment].sort((a, b) =>
            a.name.localeCompare(b.name)
          ),
        };
      }
      return {
        ...role,
        assignments: role.assignments.filter((a) => a.id !== edit.assignmentId),
      };
    }),
  }));
}

// Not inputClass: that sets w-full and py-1.5, which beat any w-*/py-1 added
// after it (Tailwind orders the stylesheet, not the class string). Fixed width
// so every row's picker lines up in one column.
const addStaffSelectClass =
  "w-40 rounded-lg border border-line bg-white px-2.5 py-1 text-[13px] text-ink focus:border-orange focus:outline-none disabled:opacity-60";

/**
 * Who holds which club role, grouped by category.
 *
 * Read-only unless the user holds manage_club_roles at this site, which gives
 * an edit mode with removable chips and a per-role picker. The database
 * agrees: club_role_assignments has a site-scoped select policy but
 * manage_club_roles insert/update/delete (0026), so a coach who forced this
 * into edit mode would still have every write rejected.
 *
 * The picker lists active profiles at this site (site_role_candidates), because
 * club_role_assignments.coach_id references profiles. Unlike the rota's
 * site_rota_roster it isn't limited to coaching job titles. Full-access users
 * (manage_users) also get active Head Office profiles, in their own optgroup
 * after the club's people; for everyone else headOfficeAccounts is empty and
 * the group isn't rendered.
 */
export default function StaffRolesModal({
  roleGroups,
  canManageRoles,
  siteId,
  siteAccounts,
  headOfficeAccounts,
  onClose,
}: {
  roleGroups: RoleGroup[];
  canManageRoles: boolean;
  siteId: string;
  siteAccounts: SiteAccount[];
  headOfficeAccounts: SiteAccount[];
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Roles with a write in flight. Their picker and ✕ buttons are disabled until
  // the write returns; the refresh that follows runs in the background.
  const [writingRoles, setWritingRoles] = useState<ReadonlySet<string>>(new Set());

  // Chips render from this. An edit shows at once and holds until the
  // transition ends, which is when router.refresh() lands with the real rows.
  // That refresh runs on failure too, so a failed edit is replaced by whatever
  // the database actually holds (a revert, or a change made in another tab).
  const [groups, addRoleEdit] = useOptimistic(roleGroups, applyRoleEdit);

  function setWriting(roleId: string, writing: boolean) {
    setWritingRoles((prev) => {
      const next = new Set(prev);
      if (writing) next.add(roleId);
      else next.delete(roleId);
      return next;
    });
  }

  function handleRemove(roleId: string, assignmentId: string) {
    setError(null);
    setWriting(roleId, true);
    startTransition(async () => {
      addRoleEdit({ kind: "remove", assignmentId });
      // .select() so a delete RLS silently refuses (0 rows, no error) can be
      // told apart from a real one.
      const { data, error: deleteError } = await supabase
        .from("club_role_assignments")
        .delete()
        .eq("id", assignmentId)
        .select("id");
      setWriting(roleId, false);
      if (deleteError) {
        setError(deleteError.message);
      } else if (!data || data.length === 0) {
        setError(UNSAVED_MESSAGE);
      }
      router.refresh();
    });
  }

  function handleAdd(roleId: string, coachId: string) {
    const account =
      siteAccounts.find((a) => a.id === coachId) ??
      headOfficeAccounts.find((a) => a.id === coachId);
    if (!account) return;
    setError(null);
    setWriting(roleId, true);
    startTransition(async () => {
      addRoleEdit({
        kind: "add",
        roleId,
        assignment: { id: OPTIMISTIC_ID + coachId, coachId, name: account.name },
      });
      const { data, error: insertError } = await supabase
        .from("club_role_assignments")
        .insert({ club_role_id: roleId, site_id: siteId, coach_id: coachId })
        .select("id");
      setWriting(roleId, false);
      if (insertError) {
        // The (club_role_id, site_id, coach_id) unique constraint from 0007.
        setError(
          insertError.code === "23505"
            ? "That person already holds this role."
            : insertError.message
        );
      } else if (!data || data.length === 0) {
        setError(UNSAVED_MESSAGE);
      }
      router.refresh();
    });
  }

  return (
    <Modal title="Staff roles" onClose={onClose} wide>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] text-slate-light">
          Who looks after what at this club.
        </p>
        {canManageRoles && (
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
        {groups.map((group) => (
          <section key={group.id}>
            <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.4px] text-slate-light">
              {group.name}
            </h3>
            <div className="overflow-hidden rounded-lg border border-line">
              {group.roles.map((role) => {
                const assignedIds = new Set(role.assignments.map((a) => a.coachId));
                // Both lists filter on the optimistic chips, so a just-added
                // person leaves the picker at once and a removed one returns.
                const available = siteAccounts.filter((a) => !assignedIds.has(a.id));
                const availableHeadOffice = headOfficeAccounts.filter(
                  (a) => !assignedIds.has(a.id)
                );
                const noneLeft = available.length === 0 && availableHeadOffice.length === 0;
                const writing = writingRoles.has(role.id);
                const showChipLine = role.assignments.length > 0 || !editing;

                return (
                  <div
                    key={role.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 last:border-b-0"
                  >
                    <span className="text-sm font-semibold text-ink">{role.name}</span>

                    <div className="flex flex-col items-end gap-1.5">
                      {showChipLine && (
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {role.assignments.length === 0 && (
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
                                  disabled={writing || assignment.id.startsWith(OPTIMISTIC_ID)}
                                  onClick={() => handleRemove(role.id, assignment.id)}
                                  aria-label={`Remove ${assignment.name} from ${role.name}`}
                                  className="text-orange hover:text-orange-dark disabled:opacity-60"
                                >
                                  ✕
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}

                      {editing && (
                        <select
                          value=""
                          disabled={writing || noneLeft}
                          onChange={(e) => handleAdd(role.id, e.target.value)}
                          aria-label={`Add staff to ${role.name}`}
                          className={addStaffSelectClass}
                        >
                          <option value="">
                            {noneLeft ? "No one left to add" : "+ Add staff"}
                          </option>
                          {available.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                          {availableHeadOffice.length > 0 && (
                            <optgroup label="Head Office">
                              {availableHeadOffice.map((account) => (
                                <option key={account.id} value={account.id}>
                                  {account.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
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

      {editing && siteAccounts.length === 0 && headOfficeAccounts.length === 0 && (
        <p className="mt-4 text-[13px] text-slate-light">
          No active staff accounts are set to this site, so there&apos;s no one to assign.
          Accounts are managed under Admin → Users.
        </p>
      )}
    </Modal>
  );
}
