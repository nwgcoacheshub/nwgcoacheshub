"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabaseClient";
import type { AddWeekOption } from "@/lib/rota/landing";
import Modal from "@/components/Modal";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/formStyles";

export type CopySource = {
  /** rota_weekly_rotas.id */
  id: string;
  /** "9–15 Nov · Next week" */
  label: string;
};

export type AddWeekProps = {
  siteId: string;
  siteSlug: string;
  siteName: string;
  /** Uncreated weeks from this week to +16, computed on the server. */
  options: AddWeekOption[];
  /** Created weeks loaded on the landing page, all at this site. */
  copySources: CopySource[];
  /** Classes on the Standard Rota; 0 disables "Standard rota". */
  standardClasses: number;
  /**
   * A week from ?add= (the all-sites grid's "Not created" cells), already
   * checked to be one of `options`. The dialog opens on load with it chosen.
   */
  preselect?: string;
};

const ALL_CREATED = "All weeks up to 16 ahead have been created";

/**
 * "+ Add week": the strip's last tile, or a plain button in the no-weeks empty
 * state. Only rendered for edit_rota holders; create_weekly_rota repeats that
 * check (0030), so hiding it is presentation only.
 */
export default function AddWeek({
  variant,
  ...props
}: AddWeekProps & { variant: "tile" | "button" }) {
  const router = useRouter();
  const [open, setOpen] = useState(!!props.preselect);
  const full = props.options.length === 0;

  function close() {
    setOpen(false);
    // Drop ?add= so a reload or Back doesn't open the dialog again.
    if (props.preselect) {
      const url = new URL(window.location.href);
      url.searchParams.delete("add");
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }

  return (
    <>
      {variant === "tile" ? (
        <button
          type="button"
          disabled={full}
          title={full ? ALL_CREATED : undefined}
          onClick={() => setOpen(true)}
          className="flex min-w-[130px] flex-col items-center justify-center gap-[3px] rounded-[10px] border border-dashed border-slate-light px-2.5 py-3 text-sm font-bold text-orange-dark hover:border-orange hover:bg-orange-pale disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-slate-light disabled:hover:bg-transparent"
        >
          + Add week
          <span className="text-center text-[11.5px] font-medium text-slate-light">
            {full ? ALL_CREATED : "Plan further ahead, or copy a week that’s already built"}
          </span>
        </button>
      ) : (
        <button
          type="button"
          disabled={full}
          title={full ? ALL_CREATED : undefined}
          onClick={() => setOpen(true)}
          className={primaryButtonClass}
        >
          Add a week
        </button>
      )}

      {open && <AddWeekDialog {...props} onClose={close} onAdded={() => setOpen(false)} />}
    </>
  );
}

function AddWeekDialog({
  siteId,
  siteSlug,
  siteName,
  options,
  copySources,
  standardClasses,
  preselect,
  onClose,
  onAdded,
}: AddWeekProps & {
  onClose: () => void;
  /** Closes without touching the URL: the push to ?week= replaces it. */
  onAdded: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [navigating, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canStandard = standardClasses > 0;
  const canCopy = copySources.length > 0;

  const [week, setWeek] = useState(preselect ?? options[0]?.monday ?? "");
  const [source, setSource] = useState<"standard" | "copy">(canStandard ? "standard" : "copy");
  const [copyId, setCopyId] = useState(copySources[0]?.id ?? "");

  // A refresh after an error can remove the chosen week or copy source from the
  // lists; fall back to the first that's still offered rather than submitting a
  // value the select no longer shows.
  const weekValue = options.some((o) => o.monday === week) ? week : (options[0]?.monday ?? "");
  const copyValue = copySources.some((c) => c.id === copyId) ? copyId : (copySources[0]?.id ?? "");
  const sourceValue =
    source === "standard" && !canStandard ? "copy" : source === "copy" && !canCopy ? "standard" : source;

  const busy = saving || navigating;
  const sourceOk = sourceValue === "standard" ? canStandard : canCopy && !!copyValue;
  const canSubmit = !busy && !!weekValue && sourceOk;

  function close() {
    // Not while the write is in flight: cancelling wouldn't undo it.
    if (busy) return;
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSaving(true);
    const { error: rpcError } = await supabase.rpc("create_weekly_rota", {
      p_site_id: siteId,
      p_week_start: weekValue,
      p_source_weekly_rota_id: sourceValue === "copy" ? copyValue : null,
    });
    setSaving(false);

    if (rpcError) {
      if (rpcError.code === "23505") {
        // Another tab or person got there first: re-read so the week appears
        // in the strip and drops out of the options.
        setError("That week has already been created.");
        startTransition(() => router.refresh());
      } else if (rpcError.code === "P0002") {
        setError("The week you chose to copy no longer exists.");
        startTransition(() => router.refresh());
      } else {
        // 22023 (not a Monday / out of range), P0001 (permissions) and anything
        // else: the function's own message, as Regenerate shows it.
        setError(`Couldn't add the week: ${rpcError.message}`);
      }
      return;
    }

    // Select the new week. Closing first is safe: the write has landed.
    startTransition(() => router.push(`/rota/${siteSlug}?week=${weekValue}`));
    onAdded();
  }

  return (
    <Modal title="Add a week" onClose={close}>
      <form onSubmit={submit}>
        <p className="-mt-3 mb-4 text-[13px] text-slate">{siteName}</p>

        <label className={labelClass} htmlFor="add-week-when">
          Week commencing
        </label>
        <select
          id="add-week-when"
          className={inputClass}
          value={weekValue}
          disabled={busy}
          onChange={(e) => setWeek(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.monday} value={o.monday}>
              {o.label}
            </option>
          ))}
        </select>

        <fieldset className="mt-4">
          <legend className={labelClass}>Start from</legend>

          <label
            className={`mt-1.5 flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-[13px] ${
              sourceValue === "standard" && canStandard
                ? "border-orange bg-orange-pale"
                : "border-line"
            } ${canStandard ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
          >
            <input
              type="radio"
              name="add-week-source"
              value="standard"
              className="mt-[3px] accent-orange"
              checked={sourceValue === "standard"}
              disabled={!canStandard || busy}
              onChange={() => setSource("standard")}
            />
            <div>
              <span className="font-semibold text-ink">Standard rota</span>
              <small className="block text-slate">
                {canStandard
                  ? `Copy the ${standardClasses} ${standardClasses === 1 ? "class" : "classes"} and coaches from the template.`
                  : "Build the standard rota first"}
              </small>
            </div>
          </label>

          <label
            className={`mt-1.5 flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-[13px] ${
              sourceValue === "copy" && canCopy ? "border-orange bg-orange-pale" : "border-line"
            } ${canCopy ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
          >
            <input
              type="radio"
              name="add-week-source"
              value="copy"
              className="mt-[3px] accent-orange"
              checked={sourceValue === "copy"}
              disabled={!canCopy || busy}
              onChange={() => setSource("copy")}
            />
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-ink">Copy another week</span>
              <small className="block text-slate">
                {canCopy
                  ? "Useful for repeating a holiday or half-term pattern."
                  : "No weeks have been created yet."}
              </small>
              {canCopy && (
                <select
                  aria-label="Week to copy"
                  className={`mt-1.5 ${inputClass}`}
                  value={copyValue}
                  disabled={busy}
                  onFocus={() => setSource("copy")}
                  onChange={(e) => {
                    setCopyId(e.target.value);
                    setSource("copy");
                  }}
                >
                  {copySources.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </label>
        </fieldset>

        {error && (
          <div className="mt-4 rounded-lg border border-[#f3c9c4] bg-[#fdecea] px-3 py-[9px] text-[12.5px] text-[#a02a1c]">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} disabled={busy} onClick={close}>
            Cancel
          </button>
          <button type="submit" className={primaryButtonClass} disabled={!canSubmit}>
            {busy ? "Adding…" : "Add week"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
