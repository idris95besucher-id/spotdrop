import Link from "next/link";
import Shell from "@/components/Shell";

export default function Home() {
  return (
    <Shell showHeader={false}>
      <section className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center rounded-3xl border border-white/10 bg-slate-900/90 p-8 text-center shadow-2xl shadow-black/40 sm:p-12">
        <div className="space-y-8">
          <div className="inline-flex items-center justify-center rounded-full bg-cyan-500/10 px-5 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-cyan-200">
            SpotDrop
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Login or register to continue</h1>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/auth/login"
              className="inline-flex min-w-[140px] items-center justify-center rounded-3xl bg-cyan-500 px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Login
            </Link>
            <Link
              href="/auth/register"
              className="inline-flex min-w-[140px] items-center justify-center rounded-3xl border border-white/10 bg-white/5 px-6 py-4 text-base font-semibold text-white transition hover:border-cyan-300/40 hover:bg-white/10"
            >
              Register
            </Link>
          </div>
        </div>
      </section>
    </Shell>
  );
}
