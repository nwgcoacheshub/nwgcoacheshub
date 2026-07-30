"use client";

import { useState } from "react";
import { DAY_NAMES } from "@/lib/rota/board";

export type ManageCoach = { id: string; name: string };

/**
 * Add / rename / deactivate for a site's coach directory. Deliberately only
 * lists active coaches — deactivated ones drop off this list the same way
 * they drop off both add-coach pickers.
 *
 * Rendered inside RotaBoard's own `styles.root` div, so it can reuse the
 * board's .overlay/.modal/.field/.btn classes without importing the CSS
 * module itself.
 */
export default function ManageCoachesModal({
  coaches,
  daysByCoach,
  onAdd,
  onRename,
  onDeactivate,
  onClose,
}: {
  coaches: ManageCoach[];
  /** Days (0=Mon..6=Sun) a coach appears on in the site's Standard Rota. */
  daysByCoach: Map<string, number[]>;
  onAdd: (name: string) => Promise<{ error: string | null }>;
  onRename: (id: string, name: string) => Promise<{ error: string | null }>;
  onDeactivate: (id: string) => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deactivateTarget, setDeactivateTarget] = useState<ManageCoach | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const { error } = await onAdd(name);
    setBusy(false);
    if (error) setError(error);
    else setNewName("");
  }

  function startRename(coach: ManageCoach) {
    setError(null);
    setRenamingId(coach.id);
    setRenameValue(coach.name);
  }

  async function confirmRename(id: string) {
    const name = renameValue.trim();
    if (!name) return;
    setBusy(true);
    const { error } = await onRename(id, name);
    setBusy(false);
    if (error) setError(error);
    else setRenamingId(null);
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return;
    setBusy(true);
    const { error } = await onDeactivate(deactivateTarget.id);
    setBusy(false);
    if (error) setError(error);
    else setDeactivateTarget(null);
  }

  if (deactivateTarget) {
    const days = (daysByCoach.get(deactivateTarget.id) ?? []).slice().sort((a, b) => a - b);
    return (
      <div
        className="overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) setDeactivateTarget(null);
        }}
      >
        <div className="modal">
          <h2>Deactivate {deactivateTarget.name}?</h2>
          <p>
            {days.length > 0
              ? `${deactivateTarget.name} is currently rostered on ${days
                  .map((d) => DAY_NAMES[d])
                  .join("/")} in the Standard Rota — deactivating won't remove them from ` +
                `the rota, but they won't be selectable for new days going forward.`
              : `${deactivateTarget.name} isn't currently on the Standard Rota. Deactivating ` +
                `means they won't be selectable for new days going forward.`}{" "}
            Continue?
          </p>

          {error && (
            <div className="board-error" style={{ marginTop: 12, marginBottom: 0 }}>
              <span>Couldn&apos;t deactivate: {error}</span>
              <button onClick={() => setError(null)} aria-label="Dismiss">
                ✕
              </button>
            </div>
          )}

          <div className="modal-actions">
            <div style={{ flex: 1 }} />
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => setDeactivateTarget(null)}
            >
              Cancel
            </button>
            <button className="btn btn-danger" disabled={busy} onClick={confirmDeactivate}>
              {busy ? "Deactivating…" : "Deactivate"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <h2>Manage coaches</h2>

        {error && (
          <div className="board-error">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}

        <div className="coach-manage-list">
          {coaches.length === 0 && (
            <div className="coach-manage-empty">No coaches yet — add one below.</div>
          )}
          {coaches.map((c) => (
            <div className="coach-manage-row" key={c.id}>
              {renamingId === c.id ? (
                <>
                  <input
                    type="text"
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmRename(c.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                  />
                  <div className="row-actions">
                    <button disabled={busy} onClick={() => confirmRename(c.id)}>
                      Save
                    </button>
                    <button disabled={busy} onClick={() => setRenamingId(null)}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="name">{c.name}</span>
                  <div className="row-actions">
                    <button onClick={() => startRename(c)}>Rename</button>
                    <button
                      className="danger"
                      onClick={() => {
                        setError(null);
                        setDeactivateTarget(c);
                      }}
                    >
                      Deactivate
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <form className="field" onSubmit={handleAdd}>
          <label htmlFor="new-coach-name">Add a coach</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="new-coach-name"
              type="text"
              placeholder="Coach name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Add
            </button>
          </div>
        </form>

        <div className="modal-actions">
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
