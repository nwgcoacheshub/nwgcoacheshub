import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/getCurrentProfile";
import { getCapabilities } from "@/lib/capabilities";
import { createClient } from "@/lib/supabaseServer";
import UsersTable from "@/components/UsersTable";

export default async function UsersPage() {
  const { user } = await getCurrentProfile();
  const { caps } = await getCapabilities();

  // profiles_select_own_or_manage_users (0026) would return only the caller's
  // own row to anyone else anyway; this just sends them somewhere useful.
  if (!user || !caps.has("manage_users")) {
    redirect("/");
  }

  const supabase = await createClient();
  const { data: users } = await supabase
    .from("profiles")
    .select("id, email, full_name, job_title, site, active")
    .order("full_name");

  return (
    <main className="mx-auto max-w-[1280px] p-6">
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">Users</h1>
        <div className="text-[13px] text-slate-light">
          Home / Admin / <b className="font-bold text-orange">Users</b>
        </div>
      </div>
      <div className="mb-6 text-sm text-slate-light">
        Add, edit, deactivate and reset passwords for Hub accounts.
      </div>

      <UsersTable initialUsers={users ?? []} currentUserId={user.id} />
    </main>
  );
}
