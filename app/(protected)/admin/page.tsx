import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/getCurrentProfile";

export default async function AdminPage() {
  const { profile } = await getCurrentProfile();

  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  return (
    <main className="mx-auto max-w-[1280px] p-6">
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">Admin</h1>
        <div className="text-[13px] text-slate-light">
          Home / <b className="font-bold text-orange">Admin</b>
        </div>
      </div>

      <a
        href="/admin/users"
        className="inline-block rounded-[14px] border border-line bg-white p-5 shadow-[0_1px_3px_rgba(40,48,56,.06),0_6px_20px_rgba(40,48,56,.05)] hover:border-orange"
      >
        <div className="text-sm font-bold text-ink">Users</div>
        <div className="text-[13px] text-slate-light">Add, edit, deactivate and reset passwords</div>
      </a>
    </main>
  );
}
