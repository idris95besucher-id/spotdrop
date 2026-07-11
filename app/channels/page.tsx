"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ChannelView from "@/app/channels/ChannelView";
import Shell from "@/components/Shell";
import { useI18n } from "@/components/I18nProvider";

function ChannelPageContent() {
  const searchParams = useSearchParams();
  const channelId = searchParams.get("id") ?? "";
  return <ChannelView channelId={channelId} />;
}

function ChannelPageFallback() {
  const { t } = useI18n();

  return (
    <Shell showHeader={false} flushTop>
      <div className="px-4 py-12 text-center text-sm text-muted">{t("common.loading")}</div>
    </Shell>
  );
}

export default function ChannelsPage() {
  return (
    <Suspense fallback={<ChannelPageFallback />}>
      <ChannelPageContent />
    </Suspense>
  );
}
