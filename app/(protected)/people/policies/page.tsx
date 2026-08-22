import { getCurrentProfile } from "@/lib/getCurrentProfile";
import { createClient } from "@/lib/supabaseServer";
import PoliciesLibrary, { type Policy } from "@/components/PoliciesLibrary";

// Readable by every active coach, so unlike /admin/users there is no redirect
// here — the (protected) layout already handles signed-out and deactivated
// accounts. `role` only decides whether the write actions render, and it is
// re-checked server-side by every route those actions call, so a coach who
// forced isAdmin true in the browser would still be refused by the API.

export default async function PoliciesPage() {
  const { profile } = await getCurrentProfile();
  const isAdmin = profile?.role === "admin";

  // RLS-gated select: policies_select_authenticated (0023) requires
  // is_active_coach(). file_path is deliberately not selected — the client has
  // no use for it, since downloads go through /api/policies/signed-url by id.
  const supabase = await createClient();
  const { data: policies } = await supabase
    .from("policies")
    .select("id, title, tags, file_size, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <main className="mx-auto max-w-[920px] p-6">
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">
          Policies
        </h1>
        <div className="text-[13px] text-slate-light">
          Home / People / <b className="font-bold text-orange">Policies</b>
        </div>
      </div>

      <PoliciesLibrary initialPolicies={(policies ?? []) as Policy[]} isAdmin={isAdmin} />
    </main>
  );
}
