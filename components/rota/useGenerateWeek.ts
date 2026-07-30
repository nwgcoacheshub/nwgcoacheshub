"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabaseClient";

/**
 * Generate or regenerate one site's week via upsert_weekly_rota.
 *
 * The RPC is called from the browser client on purpose: the function is
 * security definer and authorises on auth.uid(), so it needs the caller's own
 * session, not the service role.
 *
 * On success it refreshes the route rather than patching state locally — the
 * function replaces every roster and class row server-side, so re-reading is
 * the only way to be sure the board matches what's actually stored. The week
 * board is keyed on generated_at, which the RPC always bumps, so it remounts
 * with the new rows instead of holding the old ones in useState.
 */
export function useGenerateWeek(siteId: string, weekStart: string) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /** Resolves true only once the write succeeded. */
  async function generate(): Promise<boolean> {
    setError(null);
    setSaving(true);
    const { error: rpcError } = await supabase.rpc("upsert_weekly_rota", {
      p_site_id: siteId,
      p_week_start: weekStart,
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
