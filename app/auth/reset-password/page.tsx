"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AUTH_CONNECTION_ERROR_MESSAGE, logAuthSessionError } from "@/lib/authSession";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";

type RecoveryState = "checking" | "ready" | "success" | "error";

function getSupabaseTokenError(error: unknown) {
  if (error instanceof Error) {
    return error.message === "Load failed" ? AUTH_CONNECTION_ERROR_MESSAGE : error.message;
  }

  return "This reset link is invalid or expired. Please request a new password reset email.";
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<RecoveryState>("checking");
  const [message, setMessage] = useState("Checking your reset link...");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(() => password.length >= 8 && password === confirmPassword, [confirmPassword, password]);

  useEffect(() => {
    let cancelled = false;

    const activateRecoverySession = async () => {
      setStatus("checking");
      setMessage("Checking your reset link...");

      try {
        const code = new URLSearchParams(window.location.search).get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            throw error;
          }

          if (!cancelled) {
            setStatus("ready");
            setMessage("Enter a new password for your account.");
          }

          return;
        }

        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const tokenType = hashParams.get("type");
        const errorDescription = hashParams.get("error_description");

        if (errorDescription) {
          throw new Error(errorDescription);
        }

        if (accessToken && refreshToken && tokenType === "recovery") {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            throw error;
          }

          window.history.replaceState(null, "", window.location.pathname);

          if (!cancelled) {
            setStatus("ready");
            setMessage("Enter a new password for your account.");
          }

          return;
        }

        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (!data.session?.user) {
          throw new Error("This reset link is invalid or expired. Please request a new password reset email.");
        }

        if (!cancelled) {
          setStatus("ready");
          setMessage("Enter a new password for your account.");
        }
      } catch (recoveryError) {
        logAuthSessionError(recoveryError);

        if (!cancelled) {
          setStatus("error");
          setMessage(getSupabaseTokenError(recoveryError));
        }
      }
    };

    void activateRecoverySession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdatePassword = async () => {
    if (password.length < 8) {
      setStatus("ready");
      setMessage("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("ready");
      setMessage("Passwords do not match.");
      return;
    }

    setSaving(true);
    setMessage("Updating your password...");

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        throw error;
      }

      await supabase.auth.signOut();
      setStatus("success");
      setMessage("Password updated successfully. Redirecting to login...");

      window.setTimeout(() => {
        router.push("/auth/login");
      }, 1500);
    } catch (updateError) {
      logAuthSessionError(updateError);
      setStatus("ready");
      setMessage(updateError instanceof Error ? updateError.message : "Unable to update your password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell showHeader={false}>
      <div className="mx-auto w-full max-w-xl space-y-8 rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-xl shadow-black/40">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Reset password</p>
          <h1 className="mt-4 text-4xl font-semibold text-white">Choose a new password.</h1>
        </div>

        <p
          className={`rounded-3xl border px-4 py-3 text-sm ${
            status === "error"
              ? "border-red-500/20 bg-red-500/10 text-red-200"
              : status === "success"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                : "border-white/10 bg-white/5 text-slate-300"
          }`}
        >
          {message}
        </p>

        {status === "ready" ? (
          <div className="space-y-4">
            <label className="block text-sm text-slate-300">
              New password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                className="mt-2 w-full rounded-3xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                className="mt-2 w-full rounded-3xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
              />
            </label>
          </div>
        ) : null}

        {status === "ready" ? (
          <button
            type="button"
            onClick={handleUpdatePassword}
            disabled={saving || !canSubmit}
            className="w-full rounded-3xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Updating password..." : "Update password"}
          </button>
        ) : null}

        {status === "error" || status === "success" ? (
          <Link
            href="/auth/login"
            className="block w-full rounded-3xl border border-white/10 bg-white/5 px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Back to login
          </Link>
        ) : null}
      </div>
    </Shell>
  );
}
