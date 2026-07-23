import type { Metadata } from "next";
import Link from "next/link";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "SpotDrop Support",
  description: "Get help with SpotDrop — account, technical issues, reports, privacy, and feedback.",
};

const helpTopics = [
  "Account issues",
  "Technical problems",
  "Report users or content",
  "Privacy questions",
  "General feedback",
] as const;

const usefulLinks = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/settings/delete-account", label: "Delete Account" },
] as const;

export default function SupportPage() {
  return (
    <Shell showHeader={false}>
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block text-3xl font-bold tracking-tight text-white">
            Spot<span className="text-primary">Drop</span>
          </Link>
        </div>

        <article className="rounded-3xl border border-primary/10 bg-card p-6 shadow-2xl shadow-black/40 sm:p-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            SpotDrop Support
          </h1>

          <p className="mt-4 text-base leading-relaxed text-slate-300">Need help with SpotDrop?</p>

          <p className="mt-4 text-base leading-relaxed text-slate-300">
            If you have any questions about your account, technical issues, reporting users or
            content, privacy, or general feedback, contact us at:
          </p>

          <p className="mt-5">
            <a
              href="mailto:support@spotdrop.app"
              className="text-lg font-semibold text-primary underline-offset-4 transition hover:underline"
            >
              support@spotdrop.app
            </a>
          </p>

          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            We usually respond within 24–48 hours.
          </p>

          <section className="mt-10 border-t border-white/10 pt-8">
            <h2 className="text-xl font-semibold text-white">We can help with:</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-base text-slate-300">
              {helpTopics.map((topic) => (
                <li key={topic}>{topic}</li>
              ))}
            </ul>
          </section>

          <section className="mt-10 border-t border-white/10 pt-8">
            <h2 className="text-xl font-semibold text-white">Useful links</h2>
            <ul className="mt-4 space-y-3">
              {usefulLinks.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-base font-medium text-primary underline-offset-4 transition hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </article>

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/auth/login" className="transition hover:text-slate-300">
            Back to login
          </Link>
        </p>
      </div>
    </Shell>
  );
}
