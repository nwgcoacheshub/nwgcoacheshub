"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(login, undefined);

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-background">
      <div className="pointer-events-none absolute -left-[220px] -top-[220px] h-[600px] w-[600px] rounded-full bg-orange opacity-[0.06]" />
      <div className="pointer-events-none absolute -bottom-[200px] -right-[180px] h-[500px] w-[500px] rounded-full bg-slate opacity-[0.06]" />

      <div className="relative w-full max-w-[380px] rounded-card bg-white p-9 pb-9 pt-11 shadow-[0_20px_50px_rgba(46,51,57,0.12)]">
        <div className="mb-2 text-center text-[26px] font-extrabold leading-[1.25] tracking-[0.2px]">
          <span className="text-orange">NWG</span> <span className="text-slate-dark">Coaches Hub</span>
        </div>
        <form action={formAction} className="mt-8 flex flex-col gap-[18px]">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-[13px] font-semibold text-slate-dark">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              autoComplete="username"
              required
              className="w-full rounded-lg border border-line bg-[#FAFBFC] px-3 py-2.5 text-sm text-ink transition-colors focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-orange/15 focus:border-orange focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-dark"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-[13px] font-semibold text-slate-dark">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-line bg-[#FAFBFC] px-3 py-2.5 text-sm text-ink transition-colors focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-orange/15 focus:border-orange focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-dark"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-[#FCF3DD] px-3.5 py-2.5 text-[13px] font-medium text-status-amber">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-1.5 rounded-lg bg-orange py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-dark active:translate-y-px disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-dark"
          >
            {pending ? "Logging in…" : "Log In"}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-light">
          © 2026 The Gymnastics Blueprint. All rights reserved.
        </div>
      </div>
    </main>
  );
}
