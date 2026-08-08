"use client";

import { useMemo, useRef, useState } from "react";
import {
  PAGE_H,
  exportScaleFor,
  planExport,
  type ExportPlan,
} from "@/lib/rota/exportLayout";
import RotaExportLayout, { type ExportWeek } from "./RotaExportLayout";
import type { Category, ClassRow, Coach, RosterRow } from "./RotaBoard";

/**
 * What the export needs to know about the board it's exporting, beyond the rota
 * data itself. Built by the route, because only the route knows whether it is
 * looking at a template or at a real calendar week.
 */
export type RotaExportSpec = {
  siteName: string;
  /** Download name without the extension — "leeds-standard-rota", "leeds-week-2026-08-04". */
  fileBase: string;
  /** A real week's dates, or null for the undated Standard Rota. */
  week: ExportWeek | null;
};

/**
 * "Export as PDF": renders the static export layout off-screen, captures it to
 * one bitmap, drops that into a single landscape PDF page, and downloads it.
 *
 * The layout is rendered on demand rather than kept mounted, so the live board
 * isn't carrying a second copy of itself around for a button nobody has pressed.
 * It renders inside a fixed-size, near-transparent host at the top-left of the
 * viewport: it needs real layout for the capture, so it can't be display:none,
 * and it can't be pushed off-screen with a large negative offset either — the
 * capture would come back blank in browsers that skip painting there.
 *
 * html2canvas-pro rather than plain html2canvas: html2canvas 1.4.1 can't parse
 * modern CSS colour functions, and this app is on Tailwind v4, whose own
 * stylesheet is full of oklch(). The export layout itself only ever uses hex,
 * but the capture walks computed styles, so the tolerant parser is the safe one.
 */
export default function RotaExportButton({
  spec,
  coaches,
  roster,
  classes,
  categories,
}: {
  spec: RotaExportSpec;
  coaches: Coach[];
  roster: RosterRow[];
  classes: ClassRow[];
  categories: Category[];
}) {
  // Non-null only while an export is in flight: this is both the "busy" flag and
  // what the off-screen layout renders from. Planning is only done on demand —
  // it walks every roster row and class, so doing it per edit would be waste.
  const [plan, setPlan] = useState<ExportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the week that was just exported wouldn't fit one page legibly, so
  // the reader is told rather than left wondering why the PDF is unreadable.
  const [dense, setDense] = useState(false);
  const captureRef = useRef<HTMLDivElement | null>(null);

  // Coach names resolve from the full list, deactivated coaches included, so a
  // historical week still names whoever was on it.
  const coachNameById = useMemo(
    () => new Map(coaches.map((c) => [c.id, c.name])),
    [coaches]
  );

  async function run() {
    if (plan) return;
    setError(null);
    setDense(false);
    // Held as a local as well as in state: this function's closure captured the
    // state from before the render it's about to trigger, so the state copy is
    // only good for rendering, not for reading back here.
    const pending = planExport(
      coaches,
      roster,
      classes,
      categories.map((c) => c.key)
    );
    setPlan(pending);
    try {
      // Two frames: one to commit the render, one to be sure it has been
      // painted and laid out before the capture reads geometry off it.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      const node = captureRef.current;
      if (!node) throw new Error("Export layout didn't render.");

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);

      const pageW = pending.pageW;
      const canvas = await html2canvas(node, {
        scale: exportScaleFor(pageW),
        backgroundColor: "#FFFFFF",
        width: pageW,
        height: PAGE_H,
        windowWidth: pageW,
        windowHeight: PAGE_H,
        logging: false,
      });

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [pageW, PAGE_H],
        compress: true,
      });
      // PNG, not JPEG: at these type sizes JPEG ringing around the text is
      // clearly visible once the reader zooms in, which is the whole point of
      // capturing at 3x in the first place.
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, pageW, PAGE_H, undefined, "FAST");
      pdf.save(`${spec.fileBase}.pdf`);
      setDense(pending.tooDense);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPlan(null);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost toolbar-btn"
        style={{ border: "1px solid var(--line)" }}
        disabled={!!plan}
        onClick={run}
      >
        {plan ? "Exporting…" : "Export as PDF"}
      </button>

      {error && (
        <span style={{ fontSize: 12, color: "#a02a1c" }}>Couldn&apos;t export: {error}</span>
      )}

      {dense && !error && (
        <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          This week has too many coach columns to fit one page at full size — the
          PDF is complete, but some class names are shortened. Zoom in to read it.
        </span>
      )}

      {plan && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: plan.pageW,
            height: PAGE_H,
            // Laid out and painted, but invisible and untouchable. The opacity
            // sits on this host, not on what's captured, so the bitmap comes
            // back fully opaque.
            opacity: 0.001,
            pointerEvents: "none",
            zIndex: -1,
            overflow: "hidden",
          }}
        >
          <div ref={captureRef}>
            <RotaExportLayout
              siteName={spec.siteName}
              week={spec.week}
              plan={plan}
              categories={categories}
              coachNameById={coachNameById}
            />
          </div>
        </div>
      )}
    </>
  );
}
