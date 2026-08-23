"use client";

import { ExternalLink } from "lucide-react";
import OfficialChannelPostCarousel from "@/components/officialChannel/OfficialChannelPostCarousel";
import OfficialChannelPostImage from "@/components/officialChannel/OfficialChannelPostImage";
import { useI18n } from "@/components/I18nProvider";
import {
  localizeOfficialChannelPost,
  type OfficialChannelPostRow,
} from "@/lib/officialChannel";

function formatPublishedAt(value: string | null, locale: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : locale === "de" ? "de-DE" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export default function OfficialChannelPostCard({
  post,
  highlighted,
}: {
  post: OfficialChannelPostRow;
  highlighted?: boolean;
}) {
  const { t, locale } = useI18n();
  const localized = localizeOfficialChannelPost(post, locale, t("officialChannel.open"));

  return (
    <article
      id={`official-channel-post-${post.id}`}
      data-post-id={post.id}
      className={`rounded-[28px] border px-5 py-5 transition ${
        highlighted
          ? "border-primary/50 bg-primary/10 shadow-[0_0_0_1px_rgba(22,135,248,0.35)]"
          : "border-white/10 bg-slate-900/55"
      }`}
    >
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-white">{t("profile.officialChannelCardTitle")}</p>
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0"
          role="img"
          aria-label={t("officialChannel.verifiedLabel")}
        >
          <path
            fill="#1687F8"
            d="M23 12l-2.44-2.79.34-3.69-3.61-.82L15.4 1.5 12 2.96 8.6 1.5 6.71 4.69 3.1 5.51l.34 3.69L1 12l2.44 2.8-.34 3.69 3.61.82L8.6 22.5 12 21.04l3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12z"
          />
          <path
            d="m8.6 12.2 2.15 2.15 4.65-4.7"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {post.published_at ? (
        <p className="mt-1 text-[11px] text-muted">
          {formatPublishedAt(post.published_at, locale)}
        </p>
      ) : null}

      {localized.title ? (
        <h2 className="mt-3 text-[17px] font-semibold leading-snug text-white">{localized.title}</h2>
      ) : null}

      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-6 text-slate-200">{localized.body}</p>

      {post.media && post.media.length > 0 ? (
        <OfficialChannelPostCarousel media={post.media} alt={localized.title ?? localized.body} />
      ) : post.image_path ? (
        // Legacy posts published before official_channel_post_media existed.
        <OfficialChannelPostImage imagePath={post.image_path} alt={localized.title ?? localized.body} />
      ) : null}

      {post.link_url && localized.linkLabel ? (
        <a
          href={post.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-background transition hover:brightness-110"
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {localized.linkLabel}
        </a>
      ) : null}
    </article>
  );
}
