// Event type → Tailwind classes for the Competition Calendar, from the type
// tokens in app/globals.css. Kept as full literal strings so Tailwind can see
// them.

import type { EventType } from "@/lib/competitions/calendar";

export const TYPE_STYLES: Record<
  EventType,
  {
    /** Grid pill / all-clubs bar: coloured left border on the type's tint. */
    event: string;
    /** Type pill (list row, panel): tint background, coloured text. */
    tag: string;
    /** Filter chip swatch. */
    swatch: string;
  }
> = {
  "NWG All Competition": {
    event: "border-type-all bg-type-all-tint",
    tag: "bg-type-all-tint text-orange-dark",
    swatch: "bg-type-all",
  },
  "NWG Club Competition": {
    event: "border-type-club bg-type-club-tint",
    tag: "bg-type-club-tint text-type-club",
    swatch: "bg-type-club",
  },
  "Invitational Competition": {
    event: "border-type-inv bg-type-inv-tint",
    tag: "bg-type-inv-tint text-type-inv",
    swatch: "bg-type-inv",
  },
  "Regional/National Competition": {
    event: "border-type-reg bg-type-reg-tint",
    tag: "bg-type-reg-tint text-type-reg",
    swatch: "bg-type-reg",
  },
};

export const typeTagClass = "inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold";
