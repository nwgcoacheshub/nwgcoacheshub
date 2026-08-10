"use client";

/**
 * The app's modal shell — a centred card over a dimmed backdrop.
 *
 * Extracted unchanged from UsersTable, which is where it started life. Note
 * this is not the same modal the rota board uses: that one styles itself from
 * .overlay/.modal in rota-board.module.css, which are scoped under the board's
 * own root element and don't work anywhere else.
 */
export default function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Club Profile's quick-link modals hold tables, so they get a wider card. */
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={`w-full rounded-card bg-card p-6 shadow-card ${
          wide ? "max-h-[85vh] max-w-3xl overflow-y-auto" : "max-w-md"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-light hover:text-slate-dark"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
