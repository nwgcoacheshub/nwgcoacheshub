const newsItems = [
  {
    dot: "bg-orange",
    title: "New theme starts w/c 10 Aug: Jungle Adventure",
    meta: "Programme · 2 days ago",
  },
  {
    dot: "bg-slate",
    title: "Updated trampoline safety SOP — please read",
    meta: "Policy · 4 days ago",
  },
  {
    dot: "bg-status-green",
    title: "Mentor Programme — round 3 sign-ups open",
    meta: "Development · 1 week ago",
  },
];

export default function WhatsNewCard() {
  return (
    <div className="mb-5 overflow-hidden rounded-card border border-line bg-card shadow-card">
      <h4 className="flex items-center justify-between border-b border-line px-[18px] py-[15px] text-sm font-bold text-ink">
        What&apos;s new
        <a href="#" className="text-xs font-bold text-orange">
          All
        </a>
      </h4>
      {newsItems.map((item) => (
        <div key={item.title} className="flex gap-2.5 border-b border-line px-[18px] py-3 last:border-b-0">
          <span className={`mt-[5px] h-[9px] w-[9px] flex-shrink-0 rounded-full ${item.dot}`} />
          <div>
            <div className="text-[13.5px] font-semibold leading-[1.35] text-ink">{item.title}</div>
            <div className="mt-[2px] text-[11.5px] text-slate-light">{item.meta}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
