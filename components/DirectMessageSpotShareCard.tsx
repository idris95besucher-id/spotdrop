"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import DmMessageStatus from "@/components/DmMessageStatus";
import { useI18n } from "@/components/I18nProvider";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { formatCheckSpotShareDistanceLabel } from "@/lib/privateSpotDistance";
import {
  acceptPrivateSpotShare,
  declinePrivateSpotShare,
  fetchPrivateSpotShare,
  requestCheckSpotGpsReading,
  type PrivateSpotShare,
} from "@/lib/privateSpotShares";
import { publicProfileUsername } from "@/lib/publicProfile";

type DirectMessageSpotShareCardProps = {
  shareId: string;
  messageType: "spot_share_request" | "spot_share_accepted";
  isOwnMessage: boolean;
  currentUserId: string;
  partnerUsername: string;
  senderUsername: string;
  createdAt: string;
  senderId: string;
  deliveredAt?: string | null;
  readAt?: string | null;
  initialShare?: PrivateSpotShare | null;
  onShareUpdated?: () => void;
};

export default function DirectMessageSpotShareCard({
  shareId,
  messageType,
  isOwnMessage,
  currentUserId,
  partnerUsername,
  senderUsername,
  createdAt,
  senderId,
  deliveredAt = null,
  readAt = null,
  initialShare = null,
  onShareUpdated,
}: DirectMessageSpotShareCardProps) {
  const { t } = useI18n();
  const [share, setShare] = useState<PrivateSpotShare | null>(initialShare);
  const [loadingShare, setLoadingShare] = useState(!initialShare);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRecipient = share?.recipient_id === currentUserId;
  const displayPartner = publicProfileUsername(partnerUsername);
  const displaySender = publicProfileUsername(senderUsername);

  const distanceLabel = useMemo(() => {
    if (!share) {
      return null;
    }

    return formatCheckSpotShareDistanceLabel(share, t);
  }, [share, t]);

  useEffect(() => {
    if (initialShare) {
      setShare(initialShare);
      setLoadingShare(false);
      return;
    }

    let cancelled = false;

    void fetchPrivateSpotShare(shareId, currentUserId).then((result) => {
      if (cancelled) {
        return;
      }

      setShare(result.share);
      setError(result.error);
      setLoadingShare(false);
    });

    return () => {
      cancelled = true;
    };
  }, [currentUserId, initialShare, shareId]);

  const handleAccept = async () => {
    setResolving(true);
    setError(null);

    const { reading, error: locationError } = await requestCheckSpotGpsReading();

    if (locationError || !reading) {
      setError(locationError ?? t("checkspot.locationRequired"));
      setResolving(false);
      return;
    }

    const result = await acceptPrivateSpotShare(shareId, currentUserId, reading);

    if (result.error) {
      setError(result.error);
      setResolving(false);
      return;
    }

    setShare(result.share);
    setResolving(false);
    onShareUpdated?.();
  };

  const handleDecline = async () => {
    setResolving(true);
    setError(null);

    const result = await declinePrivateSpotShare(shareId, currentUserId);

    if (result.error) {
      setError(result.error);
      setResolving(false);
      return;
    }

    setShare((current) => (current ? { ...current, status: "declined" } : current));
    setResolving(false);
    onShareUpdated?.();
  };

  if (loadingShare) {
    return (
      <div className="max-w-[85%] rounded-[22px] border border-white/10 bg-[#0B1026] px-4 py-3 text-sm text-muted">
        {t("checkspot.loading")}
      </div>
    );
  }

  if (!share) {
    const displayError = localizeUserMessage(t, error) ?? error ?? t("checkspot.unavailable");

    return (
      <div className="max-w-[85%] rounded-[22px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {displayError}
      </div>
    );
  }

  if (messageType === "spot_share_accepted") {
    return (
      <div
        className={`max-w-[85%] rounded-[22px] px-4 py-3 shadow-md shadow-black/20 ${
          isOwnMessage
            ? "rounded-br-md bg-primary/15 text-cyan-50"
            : "rounded-bl-md border border-white/10 bg-[#0B1026] text-slate-100"
        }`}
      >
        <p className="text-sm font-medium text-white">{t("checkspot.accepted")}</p>
        {share.status === "accepted" && distanceLabel ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-accent">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {distanceLabel}
          </p>
        ) : null}
        <DmMessageStatus
          message={{
            sender_id: senderId,
            created_at: createdAt,
            read_at: readAt,
          }}
          currentUserId={currentUserId}
          isOwnMessage={isOwnMessage}
          className="mt-1.5"
        />
      </div>
    );
  }

  const title = isOwnMessage
    ? t("checkspot.youSent", { partner: displayPartner })
    : t("checkspot.sentYou", { sender: displaySender });

  return (
    <div
      className={`max-w-[85%] rounded-[22px] px-4 py-3 shadow-md shadow-black/20 ${
        isOwnMessage
          ? "rounded-br-md bg-primary/15 text-cyan-50"
          : "rounded-bl-md border border-white/10 bg-[#0B1026] text-slate-100"
      }`}
    >
      <p className="flex items-start gap-2 text-sm font-medium text-white">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <span>{title}</span>
      </p>

      {share.status === "pending" && isRecipient ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{t("checkspot.acceptToSeeDistance")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={resolving}
              onClick={() => void handleAccept()}
              className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-[#050816] transition hover:brightness-110 disabled:opacity-50"
            >
              {resolving ? t("checkspot.gettingDistance") : t("common.accept")}
            </button>
            <button
              type="button"
              disabled={resolving}
              onClick={() => void handleDecline()}
              className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/5 disabled:opacity-50"
            >
              {t("common.decline")}
            </button>
          </div>
        </>
      ) : null}

      {share.status === "pending" && share.sender_id === currentUserId ? (
        <p className="mt-2 text-xs text-muted">{t("checkspot.waitingPartner", { partner: displayPartner })}</p>
      ) : null}

      {share.status === "declined" ? (
        <p className="mt-2 text-xs text-muted">
          {isRecipient
            ? t("checkspot.youDeclined")
            : t("checkspot.partnerDeclined", { partner: displayPartner })}
        </p>
      ) : null}

      {share.status === "accepted" && distanceLabel ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-accent">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {distanceLabel}
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs text-red-300">{localizeUserMessage(t, error) ?? error}</p>
      ) : null}

      <DmMessageStatus
        message={{
          sender_id: senderId,
          created_at: createdAt,
          read_at: readAt,
        }}
        currentUserId={currentUserId}
        isOwnMessage={isOwnMessage}
        className="mt-1.5"
      />
    </div>
  );
}
