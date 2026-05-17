"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AUTH_CONNECTION_ERROR_MESSAGE, logAuthSessionError } from "@/lib/authSession";
import { ensureProfileRow } from "@/lib/profile";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import Shell from "@/components/Shell";

const USERNAME_REGEX = /^[a-z0-9._]{3,30}$/;
const CURRENT_YEAR = new Date().getFullYear();
const DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => index + 1);
const MONTH_OPTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 1899 }, (_, index) => CURRENT_YEAR - index);

function buildDateOfBirth(yearValue: string, monthValue: string, dayValue: string) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);

  if (!year || !month || !day) {
    return null;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isAtLeast13(yearValue: string, monthValue: string, dayValue: string) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const today = new Date();

  let age = today.getFullYear() - year;
  const hasHadBirthdayThisYear =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return age >= 13;
}

function getRegisterErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error) {
    if (error.message === "Load failed") {
      return AUTH_CONNECTION_ERROR_MESSAGE;
    }

    return error.message;
  }

  return fallbackMessage;
}

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async () => {
    setLoading(true);
    setError(null);

    try {
      if (supabaseConfigError) {
        console.error("Supabase register config error:", supabaseConfigError);
        setError(supabaseConfigError);
        return;
      }

      const trimmedEmail = email.trim();
      const normalizedUsername = username.trim().toLowerCase();

      if (!trimmedEmail) {
        setError("Email is required.");
        return;
      }

      if (!password) {
        setError("Password is required.");
        return;
      }

      if (!normalizedUsername) {
        setError("Username is required.");
        return;
      }

      if (!USERNAME_REGEX.test(normalizedUsername)) {
        setError("Username must be 3-30 characters and use only lowercase letters, numbers, dots, or underscores.");
        return;
      }

      if (!birthDay || !birthMonth || !birthYear) {
        setError("Day, month, and year of birth are required.");
        return;
      }

      const dateOfBirth = buildDateOfBirth(birthYear, birthMonth, birthDay);

      if (!dateOfBirth) {
        setError("Please select a valid date of birth.");
        return;
      }

      if (!isAtLeast13(birthYear, birthMonth, birthDay)) {
        setError("You must be at least 13 years old to register.");
        return;
      }

      const { data: existingProfile, error: existingProfileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", normalizedUsername)
        .maybeSingle();

      if (existingProfileError) {
        console.error("Supabase username check failed:", existingProfileError);
        setError(existingProfileError.message || "Unable to validate username right now.");
        return;
      }

      if (existingProfile) {
        setError("That username is already taken.");
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            username: normalizedUsername,
            date_of_birth: dateOfBirth,
          },
        },
      });

      if (signUpError) {
        logAuthSessionError(signUpError);
        setError(signUpError.message || "Unable to create your account.");
        return;
      }

      const authUser = data.user ?? data.session?.user;

      if (!authUser?.id) {
        console.error("Supabase signUp returned no authenticated user:", data);
        setError("Signup finished without an authenticated user session. Check your Supabase Auth settings and email confirmation flow.");
        return;
      }

      if (!data.session) {
        console.error("Supabase signUp returned no session for profile upsert:", data);
        setError("Account created. Confirm your email and sign in. Your profile will be created automatically on first login.");
        return;
      }

      const ensureProfileResult = await ensureProfileRow({
        user: authUser,
        username: normalizedUsername,
        dateOfBirth,
      });

      if (ensureProfileResult.error) {
        setError(ensureProfileResult.error);
        return;
      }

      router.push("/profile");
    } catch (caughtError) {
      logAuthSessionError(caughtError);
      setError(getRegisterErrorMessage(caughtError, "Registration failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell showHeader={false}>
      <div className="mx-auto w-full max-w-xl space-y-8 rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-xl shadow-black/40">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Register</p>
          <h1 className="mt-4 text-4xl font-semibold text-white">Create your SpotDrop account.</h1>
        </div>

        <div className="space-y-4">
          <label className="block text-sm text-slate-300">
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="mt-2 w-full rounded-3xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
            />
          </label>
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
            <div className="relative mt-2">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-3xl border border-white/10 bg-slate-950 px-4 py-3 pr-14 text-white outline-none transition focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 transition hover:text-white"
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-2">
                    <path d="M3 3l18 18" />
                    <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                    <path d="M9.4 5.5A10.7 10.7 0 0 1 12 5c5.1 0 9.3 3.3 10 7-0.3 1.6-1.3 3.1-2.8 4.4" />
                    <path d="M6.2 6.2C4.1 7.5 2.6 9.4 2 12c0.7 3.7 4.9 7 10 7 1.7 0 3.4-0.4 4.8-1.1" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current stroke-2">
                    <path d="M2 12c0.7-3.7 4.9-7 10-7s9.3 3.3 10 7c-0.7 3.7-4.9 7-10 7S2.7 15.7 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </label>
          <label className="block text-sm text-slate-300">
            Date of birth
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select
                value={birthDay}
                onChange={(event) => setBirthDay(event.target.value)}
                className="w-full rounded-3xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
              >
                <option value="">Day</option>
                {DAY_OPTIONS.map((day) => (
                  <option key={day} value={String(day)}>
                    {day}
                  </option>
                ))}
              </select>
              <select
                value={birthMonth}
                onChange={(event) => setBirthMonth(event.target.value)}
                className="w-full rounded-3xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
              >
                <option value="">Month</option>
                {MONTH_OPTIONS.map((month, index) => (
                  <option key={month} value={String(index + 1)}>
                    {month}
                  </option>
                ))}
              </select>
              <select
                value={birthYear}
                onChange={(event) => setBirthYear(event.target.value)}
                className="w-full rounded-3xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
              >
                <option value="">Year</option>
                {YEAR_OPTIONS.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <button
          type="button"
          onClick={handleRegister}
          disabled={loading}
          className="w-full rounded-3xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Creating account…" : "Register"}
        </button>

        <div className="text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link href="/auth/login" className="font-semibold text-white hover:text-cyan-200">
            Login
          </Link>
        </div>
      </div>
    </Shell>
  );
}
