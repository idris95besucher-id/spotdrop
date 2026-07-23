import type { Metadata } from "next";
import Link from "next/link";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "Terms of Service — SpotDrop",
  description: "Terms of Service for SpotDrop.",
};

export default function TermsPage() {
  return (
    <Shell showHeader={false}>
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block text-3xl font-bold tracking-tight text-white">
            Spot<span className="text-primary">Drop</span>
          </Link>
        </div>

        <article className="rounded-3xl border border-primary/10 bg-card p-6 shadow-2xl shadow-black/40 sm:p-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Terms of Service</h1>
          <p className="mt-4 text-base leading-relaxed text-slate-300">
            By using SpotDrop, you agree to use the service responsibly, follow applicable laws,
            and respect other users. Do not post illegal, harmful, or abusive content.
          </p>
          <p className="mt-4 text-base leading-relaxed text-slate-300">
            Questions about these terms? Contact{" "}
            <a
              href="mailto:support@spotdrop.app"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              support@spotdrop.app
            </a>
            .
          </p>
          <p className="mt-6 text-sm text-slate-400">
            <Link href="/support" className="text-primary underline-offset-4 hover:underline">
              Back to Support
            </Link>
          </p>
        </article>
      </div>
    </Shell>
  );
}
