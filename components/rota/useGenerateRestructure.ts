"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabaseClient";

/**
 * Generate or regenerate one site's Restructure via upsert_restructure.
 *
 * Same shape as useGenerateWeek, minus the week_start_date argument —
 * upsert_restructure is keyed on site_id alone, since there's only ever one
 * Restructure per site.
 *
 * On success it refreshes the route rather than patching state locally, for
 * the same reason: the RPC replaces every roster and class row server-side,
 * so re-reading is the only way to be sure the board matches what's stored.
 */
export function useGenerateRestructure(siteId: string) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /** Resolves true only once the write succeeded. */
  async function generate(): Promise<boolean> {
    setError(null);
    setSaving(true);
    const { error: rpcError } = await supabase.rpc("upsert_restructure", {
      p_site_id: siteId,
    });
    setSaving(false);

    if (rpcError) {
      setError(rpcError.message);
      return false;
    }

    startTransition(() => router.refresh());
    return true;
  }

  return {
    generate,
    // Stays true through the refresh, so the button can't be double-fired
    // between the write landing and the new rows arriving.
    pending: saving || refreshing,
    error,
    dismissError: () => setError(null),
  };
}
