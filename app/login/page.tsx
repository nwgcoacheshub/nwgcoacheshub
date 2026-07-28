"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(login, undefined);

  return (
    <main className="flex flex-1 items-center justify-center bg-background">
      <form
        action={formAction}
        className="w-full max-w-sm rounded-card bg-card p-8 shadow-card"
      >
        <h1 className="text-xl font-semibold text-ink">NWG Coaches Hub</h1>

        <label className="mt-6 block text-sm font-medium text-slate-dark">
          Email
          <input
            type="email"
            name="email"
            required
            className="mt-1 w-full rounded-md border border-line px-3 py-2 text-ink"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-dark">
          Password
          <input
            type="password"
            name="password"
            required
            className="mt-1 w-full rounded-md border border-line px-3 py-2 text-ink"
          />
        </label>

        {error && (
          <p className="mt-4 text-sm text-status-amber">{error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-6 w-full rounded-md bg-orange py-2 font-medium text-white hover:bg-orange-dark disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
