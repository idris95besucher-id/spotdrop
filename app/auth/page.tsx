import Link from "next/link";
import Shell from "@/components/Shell";

export default function AuthPage() {
  return (
    <Shell showHeader={false}>
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-slate-900/90 p-8 shadow-xl shadow-black/40">
        <div className="space-y-4 text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Authentication</p>
          <h1 className="text-4xl font-semibold text-white">Login or register for SpotDrop.</h1>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Link
            href="/auth/login"
            className="rounded-3xl border border-white/10 bg-white/5 px-6 py-8 text-center text-lg font-semibold text-white transition hover:border-cyan-300/40 hover:bg-white/10"
          >
            Login
          </Link>
          <Link
            href="/auth/register"
            className="rounded-3xl border border-white/10 bg-cyan-500 px-6 py-8 text-center text-lg font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            Register
          </Link>
        </div>
      </div>
    </Shell>
  );
}
