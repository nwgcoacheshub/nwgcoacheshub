import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import { getCurrentProfile } from "@/lib/getCurrentProfile";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, profile } = await getCurrentProfile();

  if (!user) {
    redirect("/login");
  }

  if (!profile || !profile.active) {
    redirect("/auth/signout");
  }

  // app-shell / app-main / app-footer are the hooks a page uses to opt into
  // filling the viewport instead of scrolling the window — see .fills-viewport
  // in globals.css. Pages that don't opt in are unaffected.
  return (
    <div className="app-shell flex min-h-full flex-col bg-background">
      <NavBar isAdmin={profile.role === "admin"} fullName={profile.full_name} />
      <div className="app-main flex-1">{children}</div>
      <footer className="app-footer mx-auto flex w-full max-w-[1280px] flex-wrap justify-between gap-2.5 px-6 py-6 text-xs text-slate-light">
        <div>
          NWG Coaches Hub · <b className="text-slate">Coaching intranet</b>
        </div>
        <div>
          <a href="/auth/signout" className="font-semibold text-slate">
            Log out
          </a>
        </div>
      </footer>
    </div>
  );
}
