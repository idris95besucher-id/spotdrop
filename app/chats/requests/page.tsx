"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useI18n } from "@/components/I18nProvider";
import MessageRequestItem, { type MessageRequestItemData } from "@/components/MessageRequestItem";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import Shell from "@/components/Shell";
import { getSafeAuthSession } from "@/lib/authSession";
import {
  CHATS_INBOX_REFRESH_EVENT,
  CHATS_INBOX_SILENT_REFRESH_EVENT,
  loadChatsInbox,
} from "@/lib/chatsInbox";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";
import { supabase } from "@/lib/supabaseClient";

export default function ChatRequestsPage() {
  const { t } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requests, setRequests] = useState<MessageRequestItemData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

  useEffect(() => {
    const { data: { subscription } = {} } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    void getSafeAuthSession().then((result) => {
      setSession(result.session);
      if (result.error) {
        setError(result.error);
      }
      setLoadingSession(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onRefresh = () => refresh();

    window.addEventListener(CHATS_INBOX_REFRESH_EVENT, onRefresh);
    window.addEventListener(CHATS_INBOX_SILENT_REFRESH_EVENT, onRefresh);

    return () => {
      window.removeEventListener(CHATS_INBOX_REFRESH_EVENT, onRefresh);
      window.removeEventListener(CHATS_INBOX_SILENT_REFRESH_EVENT, onRefresh);
    };
  }, [refresh]);

  useEffect(() => {
    const loadRequests = async () => {
      const userId = session?.user?.id;

      if (!userId) {
        setRequests([]);
        setLoadingRequests(false);
        setError(null);
        return;
      }

      setLoadingRequests(true);
      setError(null);

      const result = await loadChatsInbox(userId);

      if (result.error) {
        setError(result.error);
        setRequests([]);
      } else {
        setRequests(result.requests);
      }

      setLoadingRequests(false);
    };

    void loadRequests();
  }, [session?.user?.id, reloadKey]);

  return (
    <Shell showHeader={false} flushTop>
      <div className={`mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col ${MOBILE_WIDTH_SAFE_CLASS}`}>
        <MobileSecondaryHeader title={t("chats.requests")} backHref="/chats" />

        {loadingSession ? (
          <div className="px-4 py-12 text-center text-sm text-muted">{t("common.loading")}</div>
        ) : !session?.user ? (
          <div className="space-y-4 px-4 py-12 text-center">
            <p className="text-slate-300">{t("chats.signInPrompt")}</p>
            <Link
              href="/auth/login"
              className="inline-flex rounded-full bg-primary px-6 py-3 text-sm font-semibold text-[#050816]"
            >
              {t("auth.signIn")}
            </Link>
          </div>
        ) : loadingRequests ? (
          <div className="px-4 py-12 text-center text-sm text-muted">{t("common.loading")}</div>
        ) : error ? (
          <div className="mx-4 my-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">
            {localizeUserMessage(t, error) ?? error}
          </div>
        ) : requests.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <p className="text-lg font-semibold text-white">{t("chats.noRequests")}</p>
            <p className="mt-2 text-sm text-muted">{t("chats.noRequestsBody")}</p>
          </div>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-white/[0.06] overflow-y-auto px-2 py-1 sm:px-3">
            {requests.map((request) => (
              <MessageRequestItem
                key={request.conversationId}
                request={request}
                viewerUserId={session.user.id}
                onResolved={refresh}
              />
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}
