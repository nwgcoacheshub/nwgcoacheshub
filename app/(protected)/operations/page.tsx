export default function OperationsPage() {
  return (
    <main className="mx-auto max-w-[1280px] p-6">
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">Operations</h1>
        <div className="text-[13px] text-slate-light">
          Home / <b className="font-bold text-orange">Operations</b>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <a
          href="/rota"
          className="inline-block rounded-[14px] border border-line bg-white p-5 shadow-[0_1px_3px_rgba(40,48,56,.06),0_6px_20px_rgba(40,48,56,.05)] hover:border-orange"
        >
          <div className="text-sm font-bold text-ink">Rota</div>
          <div className="text-[13px] text-slate-light">View and manage the coaching rota</div>
        </a>
        <a
          href="/operations/site-sops"
          className="inline-block rounded-[14px] border border-line bg-white p-5 shadow-[0_1px_3px_rgba(40,48,56,.06),0_6px_20px_rgba(40,48,56,.05)] hover:border-orange"
        >
          <div className="text-sm font-bold text-ink">Site SOPs</div>
          <div className="text-[13px] text-slate-light">Opening/closing, cashing-up, key holder duties</div>
        </a>
      </div>
    </main>
  );
}
