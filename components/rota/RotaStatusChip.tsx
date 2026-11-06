import type { WeekStatus } from "@/lib/rota/landing";

// Red is the board's error-banner red (.board-error in rota-board.module.css).
const STATUS: Record<WeekStatus, { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-[#E6F5EC] text-status-green" },
  withoutCoach: { label: "Classes without a coach", className: "bg-[#fdecea] text-[#a02a1c]" },
  noClasses: { label: "No classes", className: "bg-[#EEF0F2] text-status-grey" },
};

/** One week's status on the rota landing page. Same pill shape as HowToStrip. */
export default function RotaStatusChip({ status }: { status: WeekStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-block self-start whitespace-nowrap rounded-full px-[9px] py-[3px] text-[10.5px] font-bold tracking-[0.3px] ${s.className}`}
    >
      {s.label}
    </span>
  );
}
