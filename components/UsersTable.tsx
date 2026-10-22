"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { JOB_TITLES, SITES, type JobTitle, type Site } from "@/lib/profileOptions";
import Modal from "@/components/Modal";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  rowActionClass,
} from "@/components/formStyles";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  job_title: string;
  site: string;
  active: boolean;
};

// Nobody may change their own job title, site or active status: in the
// database, 0026's profiles_guard_privileged_columns trigger refuses it with
// 42501, because changing your own job title is granting yourself permissions.
// The UI disables those controls on your own row and turns a 42501 into a plain
// sentence rather than showing the raw Postgres error.
const SELF_EDIT_MESSAGE = "You can't change your own job title, site or status.";

type UserUpdates = { full_name: string; job_title?: JobTitle; site?: Site };

function updateErrorMessage(error: { code?: string; message: string }, isSelf: boolean) {
  if (error.code !== "42501") return error.message;
  return isSelf ? SELF_EDIT_MESSAGE : "You don't have permission to change this account.";
}

const disabledSelectClass = `${inputClass} disabled:cursor-not-allowed disabled:opacity-60`;

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-[10px] py-1 text-[11px] font-bold ${
        active ? "bg-[#E6F5EC] text-status-green" : "bg-[#EEF0F2] text-status-grey"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export default function UsersTable({
  initialUsers,
  currentUserId,
}: {
  initialUsers: Profile[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState<Profile[]>(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [resetUser, setResetUser] = useState<Profile | null>(null);

  const supabase = createClient();

  async function refreshUsers() {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, job_title, site, active")
      .order("full_name");
    if (data) setUsers(data);
  }

  async function handleToggleActive(user: Profile) {
    setError(null);
    setBusyId(user.id);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ active: !user.active })
      .eq("id", user.id);
    setBusyId(null);
    if (updateError) {
      setError(updateErrorMessage(updateError, user.id === currentUserId));
      return;
    }
    await refreshUsers();
  }

  async function handleEditSave(userId: string, updates: UserUpdates) {
    const { error: updateError } = await supabase.from("profiles").update(updates).eq("id", userId);
    if (updateError) {
      return updateErrorMessage(updateError, userId === currentUserId);
    }
    await refreshUsers();
    setEditUser(null);
    return null;
  }

  async function handleAddUser(payload: {
    email: string;
    full_name: string;
    job_title: JobTitle;
    site: Site;
    temp_password: string;
  }) {
    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      return json.error ?? "Failed to create user.";
    }
    await refreshUsers();
    setAddOpen(false);
    return null;
  }

  async function handleResetPassword(userId: string, newPassword: string) {
    const res = await fetch("/api/admin/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, new_password: newPassword }),
    });
    const json = await res.json();
    if (!res.ok) {
      return json.error ?? "Failed to reset password.";
    }
    setResetUser(null);
    return null;
  }

  return (
    <div className="rounded-card border border-line bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="text-sm font-bold text-ink">All users</h2>
        <button onClick={() => setAddOpen(true)} className={primaryButtonClass}>
          + Add user
        </button>
      </div>

      {error && (
        <div className="border-b border-line bg-[#FDEAE0] px-5 py-2.5 text-[13px] font-semibold text-[#C25218]">
          {error}
        </div>
      )}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[12px] font-bold uppercase tracking-[0.4px] text-slate-light">
            <th className="px-5 py-3">Name</th>
            <th className="px-5 py-3">Email</th>
            <th className="px-5 py-3">Job title</th>
            <th className="px-5 py-3">Site</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            return (
              <tr key={user.id} className="border-b border-line last:border-b-0">
                <td className="px-5 py-3 font-semibold text-ink">{user.full_name}</td>
                <td className="px-5 py-3 text-slate">{user.email}</td>
                <td className="px-5 py-3 text-slate">{user.job_title}</td>
                <td className="px-5 py-3 text-slate">{user.site}</td>
                <td className="px-5 py-3">
                  <StatusPill active={user.active} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <button className={rowActionClass} onClick={() => setEditUser(user)}>
                      Edit
                    </button>
                    <button
                      className={rowActionClass}
                      disabled={isSelf}
                      title={isSelf ? "Full-access passwords are reset in the Supabase dashboard." : undefined}
                      onClick={() => setResetUser(user)}
                    >
                      Reset password
                    </button>
                    <button
                      className={rowActionClass}
                      disabled={isSelf || busyId === user.id}
                      title={isSelf ? SELF_EDIT_MESSAGE : undefined}
                      onClick={() => handleToggleActive(user)}
                    >
                      {user.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {addOpen && <AddUserModal onClose={() => setAddOpen(false)} onSubmit={handleAddUser} />}
      {editUser && (
        <EditUserModal
          user={editUser}
          isSelf={editUser.id === currentUserId}
          onClose={() => setEditUser(null)}
          onSubmit={handleEditSave}
        />
      )}
      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onSubmit={handleResetPassword}
        />
      )}
    </div>
  );
}

function AddUserModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (payload: {
    email: string;
    full_name: string;
    job_title: JobTitle;
    site: Site;
    temp_password: string;
  }) => Promise<string | null>;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState<JobTitle>("Coach");
  const [site, setSite] = useState<Site>("Head Office");
  const [tempPassword, setTempPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await onSubmit({
      email,
      full_name: fullName,
      job_title: jobTitle,
      site,
      temp_password: tempPassword,
    });
    setSubmitting(false);
    if (result) setError(result);
  }

  return (
    <Modal title="Add user" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {error && <p className="text-[13px] font-semibold text-[#C25218]">{error}</p>}
        <div>
          <label className={labelClass}>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Full name</label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Job title</label>
          <select
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value as JobTitle)}
            className={inputClass}
          >
            {JOB_TITLES.map((jt) => (
              <option key={jt} value={jt}>
                {jt}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Site</label>
          <select value={site} onChange={(e) => setSite(e.target.value as Site)} className={inputClass}>
            {SITES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Temporary password</label>
          <input
            type="text"
            required
            minLength={6}
            value={tempPassword}
            onChange={(e) => setTempPassword(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={submitting} className={primaryButtonClass}>
            {submitting ? "Creating…" : "Create user"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({
  user,
  isSelf,
  onClose,
  onSubmit,
}: {
  user: Profile;
  isSelf: boolean;
  onClose: () => void;
  onSubmit: (userId: string, updates: UserUpdates) => Promise<string | null>;
}) {
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [jobTitle, setJobTitle] = useState<JobTitle>(user.job_title as JobTitle);
  const [site, setSite] = useState<Site>(user.site as Site);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    // Your own row sends only the name, so the guarded columns are never part
    // of the update at all.
    const result = await onSubmit(
      user.id,
      isSelf ? { full_name: fullName } : { full_name: fullName, job_title: jobTitle, site }
    );
    setSubmitting(false);
    if (result) setError(result);
  }

  return (
    <Modal title="Edit user" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {error && <p className="text-[13px] font-semibold text-[#C25218]">{error}</p>}
        <div>
          <label className={labelClass}>Full name</label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Job title</label>
          <select
            value={jobTitle}
            disabled={isSelf}
            onChange={(e) => setJobTitle(e.target.value as JobTitle)}
            className={disabledSelectClass}
          >
            {JOB_TITLES.map((jt) => (
              <option key={jt} value={jt}>
                {jt}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Site</label>
          <select
            value={site}
            disabled={isSelf}
            onChange={(e) => setSite(e.target.value as Site)}
            className={disabledSelectClass}
          >
            {SITES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {isSelf && <p className="text-[12.5px] text-slate-light">{SELF_EDIT_MESSAGE}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={submitting} className={primaryButtonClass}>
            {submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onSubmit,
}: {
  user: Profile;
  onClose: () => void;
  onSubmit: (userId: string, newPassword: string) => Promise<string | null>;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await onSubmit(user.id, newPassword);
    setSubmitting(false);
    if (result) {
      setError(result);
    } else {
      setDone(true);
    }
  }

  return (
    <Modal title={`Reset password — ${user.full_name}`} onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-slate">
            Password updated. Pass this temporary password to {user.full_name} directly.
          </p>
          <div className="flex justify-end">
            <button onClick={onClose} className={primaryButtonClass}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {error && <p className="text-[13px] font-semibold text-[#C25218]">{error}</p>}
          <div>
            <label className={labelClass}>New temporary password</label>
            <input
              type="text"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={secondaryButtonClass}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={primaryButtonClass}>
              {submitting ? "Saving…" : "Set password"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
