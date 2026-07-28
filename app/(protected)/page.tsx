import { redirect } from "next/navigation";
import RoleBadge from "@/components/RoleBadge";
import WeeklyFocusHero from "@/components/dashboard/WeeklyFocusHero";
import ProgrammeTiles from "@/components/dashboard/ProgrammeTiles";
import HowToStrip from "@/components/dashboard/HowToStrip";
import WhatsNewCard from "@/components/dashboard/WhatsNewCard";
import QuickLinksCard from "@/components/dashboard/QuickLinksCard";
import ComplianceCard from "@/components/dashboard/ComplianceCard";
import { getCurrentProfile } from "@/lib/getCurrentProfile";

export default async function DashboardPage() {
  const { user, profile } = await getCurrentProfile();

  if (!user || !profile) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-[1280px] p-6">
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">
          Welcome back, {profile.full_name}
        </h1>
        <div className="text-[13px] text-slate-light">
          Home / <b className="font-bold text-orange">Dashboard</b>
        </div>
      </div>

      <RoleBadge jobTitle={profile.job_title} site={profile.site} />

      <div className="mb-2.5 text-sm text-slate-light">
        Monday 27 July 2026 · Here&apos;s what&apos;s on this week and everything you need to find.
      </div>

      <div className="grid grid-cols-1 gap-[22px] lg:grid-cols-[1fr_340px]">
        <div>
          <WeeklyFocusHero />
          <ProgrammeTiles />
          <HowToStrip />
        </div>
        <aside>
          <WhatsNewCard />
          <QuickLinksCard />
          <ComplianceCard />
        </aside>
      </div>
    </main>
  );
}
