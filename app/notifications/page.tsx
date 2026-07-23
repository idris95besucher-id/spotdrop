"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Bell, MessageCircle, MessageSquare, UserPlus } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import { useNotifications } from "@/components/NotificationsProvider";
import ProfileAvatar from "@/components/ProfileAvatar";
import Shell from "@/components/Shell";
import { getSafeAuthSession } from "@/lib/authSession";
import {
  buildNotificationCopy,
  dispatchNotificationsRefresh,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATIONS_REFRESH_EVENT,
  type NotificationRow,
} from "@/lib/notifications";
import { publicProfileUsername } from "@/lib/publicProfile";
import { supabase } from "@/lib/supabaseClient";

function formatNotificationTime(createdAt: string) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function notificationIcon(type: NotificationRow["type"]) {
  const className = "h-5 w-5 shrink-0 text-primary";

  switch (type) {
    case "direct_message":
      return <MessageCircle className={className} strokeWidth={1.75} aria-hidden />;
    case "new_follower":
      return <UserPlus className={className} strokeWidth={1.75} aria-hidden />;
    case "post_comment":
      return <MessageSquare className={className} strokeWidth={1.75} aria-hidden />;
    case "room_message":
      return <Bell className={className} strokeWidth={1.75} aria-hidden />;
    default:
      return <Bell className={className} strokeWidth={1.75} aria-hidden />;
  }
}

function NotificationListItem({
  notification,
  copy,
  onOpen,
}: {
  notification: NotificationRow;
  copy: { title: string; body: string };
  onOpen: (notification: NotificationRow) => void;
}) {
  const unread = !notification.read_at;
  const isComment = notification.type === "post_comment";
  const actorName = publicProfileUsername(
    notification.actorUsername || copy.title || "Someone"
  );
  const useActorAvatar =
    notification.type === "post_comment" || Boolean(notification.actor_id) || Boolean(notification.actorAvatarUrl);

  return (
    <li>
      <Link
        href={notification.href}
        onClick={() => onOpen(notification)}
        className={`flex items-start gap-3 px-4 py-3.5 transition sm:gap-4 sm:px-5 sm:py-4 ${
          unread ? "bg-primary/[0.06]" : "hover:bg-white/[0.03]"
        }`}
      >
        <div className="relative mt-0.5 shrink-0">
          {useActorAvatar ? (
            <ProfileAvatar
              src={notification.actorAvatarUrl}
              sizeClassName="h-11 w-11"
              iconClassName="h-5 w-5"
              className="bg-white/[0.06]"
            />
          ) : (
            <span className="inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white/[0.06]">
              {notificationIcon(notification.type)}
            </span>
          )}
          {unread ? (
            <span
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-[#070b1a]"
              aria-hidden
            />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={`truncate text-[15px] sm:text-base ${
                unread ? "font-bold text-white" : "font-semibold text-white"
              }`}
            >
              {isComment ? actorName : copy.title}
            </p>
            <time
              className={`shrink-0 text-xs ${unread ? "font-semibold text-primary" : "text-muted"}`}
            >
              {formatNotificationTime(notification.created_at)}
            </time>
          </div>
          <p
            className={`mt-0.5 line-clamp-2 text-sm ${
              unread ? "font-medium text-slate-200" : "text-muted"
            }`}
          >
            {copy.body}
          </p>
        </div>

        {isComment && notification.postThumbnailUrl ? (
          <div className="mt-0.5 h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white/[0.06] ring-1 ring-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={notification.postThumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}
      </Link>
    </li>
  );
}

export default function NotificationsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { refreshUnreadCount } = useNotifications();
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const userId = session?.user?.id ?? null;

  const load = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await fetchNotifications(userId);

    setNotifications(result.notifications);
    setError(result.error);
    setLoading(false);
    void refreshUnreadCount();
  }, [refreshUnreadCount, userId]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    void getSafeAuthSession().then((result) => {
      setSession(result.session);
      setLoadingSession(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (loadingSession) {
      return;
    }

    if (!userId) {
      router.replace("/auth/login");
      return;
    }

    void load();
  }, [load, loadingSession, reloadKey, router, userId]);

  useEffect(() => {
    const handleRefresh = () => {
      setReloadKey((current) => current + 1);
    };

    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, handleRefresh);

    return () => {
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, handleRefresh);
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(`notifications_page_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          setReloadKey((current) => current + 1);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const handleOpen = (notification: NotificationRow) => {
    if (!notification.read_at) {
      void markNotificationRead(notification.id).then(() => {
        dispatchNotificationsRefresh();
        void refreshUnreadCount();
      });
    }
  };

  const handleMarkAllRead = () => {
    if (!userId) {
      return;
    }

    void markAllNotificationsRead(userId).then(() => {
      dispatchNotificationsRefresh();
      void refreshUnreadCount();
      setReloadKey((current) => current + 1);
    });
  };

  const hasUnread = notifications.some((notification) => !notification.read_at);

  return (
    <Shell flushTop>
      <MobileSecondaryHeader title={t("notifications.title")} backHref="/profile" preferFallback />

      <div className="mx-auto w-full max-w-2xl">
        <div className="hidden items-center justify-between border-b border-white/10 px-4 py-4 md:flex">
          <h1 className="text-xl font-bold text-white">{t("notifications.title")}</h1>
          {hasUnread ? (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-sm font-semibold text-primary transition hover:text-cyan-300"
            >
              {t("notifications.markAllRead")}
            </button>
          ) : null}
        </div>

        {hasUnread ? (
          <div className="flex justify-end border-b border-white/10 px-4 py-2 md:hidden">
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-sm font-semibold text-primary transition hover:text-cyan-300"
            >
              {t("notifications.markAllRead")}
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-muted">{t("notifications.loading")}</p>
        ) : error ? (
          <p className="mx-4 mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <Bell className="mx-auto h-10 w-10 text-muted" strokeWidth={1.5} aria-hidden />
            <p className="mt-4 text-base font-semibold text-white">{t("notifications.empty")}</p>
            <p className="mt-2 text-sm text-muted">{t("notifications.emptyBody")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/10">
            {notifications.map((notification) => {
              const copy = buildNotificationCopy(notification, t);

              return (
                <NotificationListItem
                  key={notification.id}
                  notification={notification}
                  copy={copy}
                  onOpen={handleOpen}
                />
              );
            })}
          </ul>
        )}
      </div>
    </Shell>
  );
}
