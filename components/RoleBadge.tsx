export default function RoleBadge({
  jobTitle,
  site,
}: {
  jobTitle: string;
  site: string;
}) {
  return (
    <div className="mb-[22px] flex flex-wrap gap-2">
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-orange-pale px-[13px] py-[5px] text-[12.5px] font-bold text-orange-dark">
        {jobTitle}
      </span>
      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-line bg-background px-[13px] py-[5px] text-[12.5px] font-bold text-slate-dark">
        {site}
      </span>
    </div>
  );
}
