import { createClient } from "@supabase/supabase-js";

// Server-only: uses the service-role key, which bypasses Row Level Security.
// Never import this file from client components or expose it to the browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
