import { NextResponse } from "next/server";

export async function POST() {
  // TODO: verify caller is an admin, then use lib/supabaseAdmin.ts to
  // create the auth.users entry and matching profiles row.
  // See build doc section 8.
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
