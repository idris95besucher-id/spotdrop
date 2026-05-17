import Link from "next/link";

type SelectionCardProps = {
  title: string;
  description: string;
  href: string;
};

export default function SelectionCard({ title, description, href }: SelectionCardProps) {
  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 transition hover:-translate-y-0.5 hover:bg-white/10"
    >
      <div className="text-xs uppercase tracking-[0.3em] text-slate-400">{title}</div>
      <p className="mt-4 text-xl font-semibold text-white">{description}</p>
      <span className="mt-6 inline-flex rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-950 transition group-hover:bg-white">
        Open
      </span>
    </Link>
  );
}
