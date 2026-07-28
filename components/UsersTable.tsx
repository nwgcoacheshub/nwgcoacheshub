"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { ROLES, JOB_TITLES, SITES, type Role, type JobTitle, type Site } from "@/lib/profileOptions";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  job_title: string;
  site: string;
  active: boolean;
};

const inputClass =
  "w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink placeholder:text-slate-light focus:border-orange focus:outline-none";
const labelClass = "mb-1.5 block text-[12.5px] font-semibold text-slate-dark";
const primaryButtonClass =
  "rounded-lg bg-orange px-3.5 py-2 text-[13px] font-bold text-white hover:bg-orange-dark disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
  "rounded-lg border border-line bg-white px-3.5 py-2 text-[13px] font-bold text-slate-dark hover:bg-background";
const rowActionClass = "rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-slate-dark hover:bg-background disabled:cursor-not-allowed disabled:opacity-60";

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

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-card bg-card p-6 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="text-slate-light hover:text-slate-dark" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function UsersTable({ initialUsers }: { initialUsers: Profile[] }) {
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
      .select("id, email, full_name, role, job_title, site, active")
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
      setError(updateError.message);
      return;
    }
    await refreshUsers();
  }

  async function handleEditSave(userId: string, updates: { full_name: string; role: Role; job_title: JobTitle; site: Site }) {
    const { error: updateError } = await supabase.from("profiles").update(updates).eq("id", userId);
    if (updateError) {
      return updateError.message;
    }
    await refreshUsers();
    setEditUser(null);
    return null;
  }

  async function handleAddUser(payload: {
    email: string;
    full_name: string;
    role: Role;
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
            <th className="px-5 py-3">Role</th>
            <th className="px-5 py-3">Job title</th>
            <th className="px-5 py-3">Site</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-line last:border-b-0">
              <td className="px-5 py-3 font-semibold text-ink">{user.full_name}</td>
              <td className="px-5 py-3 text-slate">{user.email}</td>
              <td className="px-5 py-3 capitalize text-slate">{user.role}</td>
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
                  <button className={rowActionClass} onClick={() => setResetUser(user)}>
                    Reset password
                  </button>
                  <button
                    className={rowActionClass}
                    disabled={busyId === user.id}
                    onClick={() => handleToggleActive(user)}
                  >
                    {user.active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {addOpen && <AddUserModal onClose={() => setAddOpen(false)} onSubmit={handleAddUser} />}
      {editUser && (
        <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSubmit={handleEditSave} />
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
    role: Role;
    job_title: JobTitle;
    site: Site;
    temp_password: string;
  }) => Promise<string | null>;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("coach");
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
      role,
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
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
  onClose,
  onSubmit,
}: {
  user: Profile;
  onClose: () => void;
  onSubmit: (
    userId: string,
    updates: { full_name: string; role: Role; job_title: JobTitle; site: Site }
  ) => Promise<string | null>;
}) {
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [role, setRole] = useState<Role>(user.role as Role);
  const [jobTitle, setJobTitle] = useState<JobTitle>(user.job_title as JobTitle);
  const [site, setSite] = useState<Site>(user.site as Site);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await onSubmit(user.id, { full_name: fullName, role, job_title: jobTitle, site });
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
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
