"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabaseClient";

/**
 * Regenerate one site's existing week from the Standard Rota via
 * upsert_weekly_rota. Since 0030 it only rebuilds a week that exists; weeks are
 * created on the rota landing page.
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

    // P0002: the week was removed after this page loaded. Not an error to show:
    // re-reading the route renders "This week hasn't been created", which
    // explains it, and the board and its modal unmount with it.
    if (rpcError?.code === "P0002") {
      startTransition(() => router.refresh());
      return false;
    }

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
