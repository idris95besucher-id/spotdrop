import Shell from "@/components/Shell";

export default function ProfilePage({ params }: { params: { userId: string } }) {
  return (
    <Shell>
      <section className="rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-xl shadow-black/20">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">User profile</p>
            <h1 className="mt-4 text-3xl font-semibold text-white">{params.userId}</h1>
            <p className="mt-3 max-w-2xl text-slate-300">
              This profile page will show the user's avatar, bio, country, city, and actions like direct messaging.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="h-24 w-24 rounded-3xl bg-slate-800" />
          <div className="mt-6 space-y-2 text-slate-200">
            <p className="text-sm uppercase tracking-[0.35em] text-slate-400">About</p>
            <p className="text-sm text-slate-300">Bio placeholder for the user profile.</p>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Location</p>
          <div className="mt-4 space-y-2 text-slate-200">
            <p>Country: <span className="font-medium text-white">United States</span></p>
            <p>City: <span className="font-medium text-white">New York</span></p>
          </div>
        </div>
      </section>
    </Shell>
  );
}
