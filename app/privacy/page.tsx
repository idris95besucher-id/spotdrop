import type { Metadata } from "next";
import Link from "next/link";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "Privacy Policy — SpotDrop",
  description: "Privacy information for SpotDrop.",
};

export default function PrivacyPage() {
  return (
    <Shell showHeader={false}>
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block text-3xl font-bold tracking-tight text-white">
            Spot<span className="text-primary">Drop</span>
          </Link>
        </div>

        <article className="rounded-3xl border border-primary/10 bg-card p-6 shadow-2xl shadow-black/40 sm:p-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Privacy Policy</h1>
          <p className="mt-4 text-base leading-relaxed text-slate-300">
            SpotDrop respects your privacy. We use the information you provide — such as your
            account details, profile content, and messages — to operate and improve the app.
          </p>
          <p className="mt-4 text-base leading-relaxed text-slate-300">
            For privacy questions, data requests, or account deletion help, contact{" "}
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
