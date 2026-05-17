"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AUTH_CONNECTION_ERROR_MESSAGE, getSafeAuthSession, logAuthSessionError } from "@/lib/authSession";
import { ensureProfileRow } from "@/lib/profile";
import { supabase } from "@/lib/supabaseClient";
import Shell from "@/components/Shell";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const router = useRouter();

  const redirectAfterLogin = async () => {
    const { session, error } = await getSafeAuthSession();

    if (error) {
      setError(error);
      return;
    }

    if (!session?.user?.id) {
      setError("Unable to sign in. Please try again.");
      return;
    }

    const ensuredProfile = await ensureProfileRow({ user: session.user });

    if (ensuredProfile.error && !ensuredProfile.needsOnboarding) {
      setError(ensuredProfile.error);
      return;
    }

    if (!ensuredProfile.profile?.username) {
      router.push("/onboarding");
    } else {
      router.push("/profile");
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    let signInError: Error | null = null;

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      signInError = error;
    } catch (error) {
      logAuthSessionError(error);
      setError(AUTH_CONNECTION_ERROR_MESSAGE);
      setLoading(false);
      return;
    }

    if (signInError) {
      logAuthSessionError(signInError);
      setError(signInError.message === "Load failed" ? AUTH_CONNECTION_ERROR_MESSAGE : signInError.message);
      setLoading(false);
      return;
    }

    await redirectAfterLogin();
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("Enter your email first, then request a reset link.");
      return;
    }

    setSendingReset(true);
    setResetEmailSent(false);
    setError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) {
        logAuthSessionError(error);
        setError(error.message === "Load failed" ? AUTH_CONNECTION_ERROR_MESSAGE : error.message);
        return;
      }

      setResetEmailSent(true);
    } catch (resetError) {
      logAuthSessionError(resetError);
      setError(AUTH_CONNECTION_ERROR_MESSAGE);
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <Shell showHeader={false}>
      <div className="mx-auto w-full max-w-xl space-y-8 rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-xl shadow-black/40">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Login</p>
          <h1 className="mt-4 text-4xl font-semibold text-white">Welcome back to SpotDrop.</h1>
        </div>

        <div className="space-y-4">
          <label className="block text-sm text-slate-300">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-3xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
            />
          </label>
          <label className="block text-sm text-slate-300">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-3xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
            />
          </label>
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={sendingReset}
            className="text-left text-sm font-semibold text-cyan-300 transition hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sendingReset ? "Sending reset link..." : "Forgot password?"}
          </button>
        </div>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        {resetEmailSent ? (
          <p className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Password reset link sent. Check your inbox and open the link on this device.
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          className="w-full rounded-3xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <div className="text-center text-sm text-slate-400">
          Don’t have an account?{" "}
          <Link href="/auth/register" className="font-semibold text-white hover:text-cyan-200">
            Register
          </Link>
        </div>
      </div>
    </Shell>
  );
}
