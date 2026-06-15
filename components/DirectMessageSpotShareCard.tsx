"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { formatChatMessageTime } from "@/lib/chatDates";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { approximateDistanceBetween } from "@/lib/privateSpotDistance";
import {
  acceptPrivateSpotShare,
  declinePrivateSpotShare,
  fetchPrivateSpotShare,
  resolveLocationForSpotShare,
  shareHasCoordinates,
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
  initialShare = null,
  onShareUpdated,
}: DirectMessageSpotShareCardProps) {
  const { t } = useI18n();
  const [share, setShare] = useState<PrivateSpotShare | null>(initialShare);
  const [distanceLabel, setDistanceLabel] = useState<string | null>(null);
  const [loadingShare, setLoadingShare] = useState(!initialShare);
  const [loadingDistance, setLoadingDistance] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRecipient = share?.recipient_id === currentUserId;
  const isSender = share?.sender_id === currentUserId;
  const displayPartner = publicProfileUsername(partnerUsername);
  const displaySender = publicProfileUsername(senderUsername);

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

  const handleShowDistance = async () => {
    if (!share || share.status !== "accepted" || !shareHasCoordinates(share)) {
      return;
    }

    setLoadingDistance(true);
    setError(null);

    const { location, error: locationError } = await resolveLocationForSpotShare();

    if (locationError || !location) {
      setError(locationError ?? t("checkspot.locationRequired"));
      setLoadingDistance(false);
      return;
    }

    const label = approximateDistanceBetween(
      location.latitude,
      location.longitude,
      share.sender_latitude!,
      share.sender_longitude!,
      t
    );

    setDistanceLabel(label);
    setLoadingDistance(false);
  };

  const handleAccept = async () => {
    setResolving(true);
    setError(null);

    const result = await acceptPrivateSpotShare(shareId, currentUserId);

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
        ) : share.status === "accepted" && shareHasCoordinates(share) ? (
          <button
            type="button"
            disabled={loadingDistance}
            onClick={() => void handleShowDistance()}
            className="mt-2 text-sm font-semibold text-primary transition hover:text-cyan-200 disabled:opacity-50"
          >
            {loadingDistance ? t("checkspot.gettingDistance") : t("checkspot.showDistance")}
          </button>
        ) : null}
        <p className={`mt-1.5 text-[10px] ${isOwnMessage ? "text-primary/70" : "text-muted"}`}>
          {formatChatMessageTime(createdAt)}
        </p>
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
              {t("common.accept")}
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

      {share.status === "pending" && isSender ? (
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
      ) : share.status === "accepted" && shareHasCoordinates(share) ? (
        <button
          type="button"
          disabled={loadingDistance}
          onClick={() => void handleShowDistance()}
          className="mt-2 text-sm font-semibold text-primary transition hover:text-cyan-200 disabled:opacity-50"
        >
          {loadingDistance ? t("checkspot.gettingDistance") : t("checkspot.showDistance")}
        </button>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs text-red-300">{localizeUserMessage(t, error) ?? error}</p>
      ) : null}

      <p className={`mt-1.5 text-[10px] ${isOwnMessage ? "text-primary/70" : "text-muted"}`}>
        {formatChatMessageTime(createdAt)}
      </p>
    </div>
  );
}
