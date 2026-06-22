"use client";

import { useParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import CityRoomChatComposer from "@/components/CityRoomChatComposer";
import { useI18n } from "@/components/I18nProvider";
import CityRoomMessageBubble from "@/components/CityRoomMessageBubble";
import ChatDateSeparator from "@/components/ChatDateSeparator";
import ChatNewMessagesPill from "@/components/ChatNewMessagesPill";
import ChatThreadShell from "@/components/ChatThreadShell";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import RoomWallpaper from "@/components/RoomWallpaper";
import Shell from "@/components/Shell";
import { getSafeAuthSession } from "@/lib/authSession";
import { shouldShowChatDateSeparator } from "@/lib/chatDates";
import {
  getCityRoomGroupPosition,
  getCityRoomMessageSpacingClass,
  shouldShowCityRoomSenderName,
} from "@/lib/cityRoomChatGrouping";
import { getCountryFlag } from "@/lib/countryFlags";
import { ensureProfileRow } from "@/lib/profile";
import { publicProfileUsername } from "@/lib/publicProfile";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { supabase } from "@/lib/supabaseClient";
import { useChatScroll, useChatScrollEffect, CHAT_MESSAGES_BOTTOM_PADDING } from "@/lib/useChatScroll";

type Country = {
  id: string;
  name: string;
  slug: string;
  code: string;
  emoji: string | null;
};

type City = {
  id: string;
  name: string;
  slug: string;
  country_id: string;
};

type CityChannel = {
  id: string;
  city_id: string;
  created_by: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: string;
  created_at: string;
};

type SenderProfile = {
  username: string;
  avatar_url?: string | null;
};

type RawChannelMessage = {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type ChannelMessage = RawChannelMessage & {
  profile: SenderProfile | null;
};

function buildMessage(message: RawChannelMessage, profile: SenderProfile | null): ChannelMessage {
  return {
    ...message,
    profile,
  };
}

function mergeMessages(currentMessages: ChannelMessage[], incomingMessages: ChannelMessage[]) {
  const byId = new Map(currentMessages.map((message) => [message.id, message]));

  for (const message of incomingMessages) {
    byId.set(message.id, message);
  }

  return Array.from(byId.values()).sort(
    (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  );
}

export default function CityChannelPage() {
  const { t } = useI18n();
  const params = useParams<{ country: string; city: string; channelSlug: string }>();
  const countrySlug = String(params.country ?? "").toLowerCase();
  const citySlug = String(params.city ?? "").toLowerCase();
  const channelSlug = String(params.channelSlug ?? "").toLowerCase();

  const [session, setSession] = useState<Session | null>(null);
  const [country, setCountry] = useState<Country | null>(null);
  const [city, setCity] = useState<City | null>(null);
  const [channel, setChannel] = useState<CityChannel | null>(null);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const {
    messagesContainerRef,
    messagesEndRef,
    showNewMessages,
    scrollToBottom,
    handleScroll,
    syncMessagesScroll,
    markForceScroll,
    resetChatScroll,
    scrollRequestId,
  } = useChatScroll();

  const loadMessages = useCallback(async (channelId: string) => {
    setLoadingMessages(true);

    const { data, error: messagesError } = await supabase
      .from("city_channel_messages")
      .select("id, channel_id, user_id, content, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("Failed to load channel messages:", JSON.stringify(messagesError, null, 2));
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    const rawMessages = (data ?? []) as RawChannelMessage[];
    const uniqueUserIds = [...new Set(rawMessages.map((message) => message.user_id))];
    let profilesById = new Map<string, SenderProfile>();

    if (uniqueUserIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", uniqueUserIds);

      if (profileError) {
        console.error("Failed to load channel message profiles:", JSON.stringify(profileError, null, 2));
      } else {
        profilesById = new Map(
          (profileRows ?? []).map((profile) => [
            profile.id,
            {
              username: publicProfileUsername(profile.username),
              avatar_url: profile.avatar_url ?? null,
            },
          ])
        );
      }
    }

    setMessages(rawMessages.map((message) => buildMessage(message, profilesById.get(message.user_id) ?? null)));
    setLoadingMessages(false);
  }, []);

  useEffect(() => {
    const loadChannelPage = async () => {
      setLoading(true);
      setError(null);
      setChannel(null);
      setMessages([]);

      const { session: nextSession, error: sessionError } = await getSafeAuthSession();
      setSession(nextSession);

      if (sessionError) {
        setError(sessionError);
        setLoading(false);
        return;
      }

      const { data: countryData, error: countryError } = await supabase
        .from("countries")
        .select("id, name, slug, code, emoji")
        .eq("slug", countrySlug)
        .maybeSingle();

      if (countryError) {
        console.error("Failed to load channel country:", JSON.stringify(countryError, null, 2));
        setError(countryError.message || "Channel not found");
        setLoading(false);
        return;
      }

      if (!countryData) {
        setError("Channel not found");
        setLoading(false);
        return;
      }

      const { data: cityData, error: cityError } = await supabase
        .from("cities")
        .select("id, name, slug, country_id")
        .eq("country_id", countryData.id)
        .eq("slug", citySlug)
        .maybeSingle();

      if (cityError) {
        console.error("Failed to load channel city:", JSON.stringify(cityError, null, 2));
        setError(cityError.message || "Channel not found");
        setLoading(false);
        return;
      }

      if (!cityData) {
        setError("Channel not found");
        setLoading(false);
        return;
      }

      const { data: channelData, error: channelError } = await supabase
        .from("city_channels")
        .select("id, city_id, created_by, name, slug, description, visibility, created_at")
        .eq("city_id", cityData.id)
        .eq("slug", channelSlug)
        .maybeSingle();

      if (channelError) {
        console.error("Failed to load city channel:", JSON.stringify(channelError, null, 2));
        setError(channelError.message || "Channel not found");
        setLoading(false);
        return;
      }

      if (!channelData) {
        setError("Channel not found");
        setLoading(false);
        return;
      }

      setCountry(countryData);
      setCity(cityData);
      setChannel(channelData as CityChannel);
      setLoading(false);
      await loadMessages(channelData.id);
    };

    void loadChannelPage();
  }, [channelSlug, citySlug, countrySlug, loadMessages]);

  useEffect(() => {
    if (!channel?.id) {
      return;
    }

    const realtimeChannel = supabase
      .channel(`city_channel_messages_${channel.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "city_channel_messages", filter: `channel_id=eq.${channel.id}` },
        async (payload) => {
          const insertedMessage = payload.new as RawChannelMessage;
          let senderProfile: SenderProfile | null = null;

          if (insertedMessage.user_id === session?.user?.id) {
            const ensuredProfile = session?.user ? await ensureProfileRow({ user: session.user }) : null;
            senderProfile = {
              username: publicProfileUsername(ensuredProfile?.profile?.username),
              avatar_url: ensuredProfile?.profile?.avatar_url ?? null,
            };
          } else {
            const { data: profileRow, error: profileError } = await supabase
              .from("profiles")
              .select("username, avatar_url")
              .eq("id", insertedMessage.user_id)
              .maybeSingle();

            if (profileError) {
              console.error("Failed to load realtime channel sender:", JSON.stringify(profileError, null, 2));
            } else if (profileRow) {
              senderProfile = {
                username: publicProfileUsername(profileRow.username),
                avatar_url: profileRow.avatar_url ?? null,
              };
            }
          }

          setMessages((currentMessages) => mergeMessages(currentMessages, [buildMessage(insertedMessage, senderProfile)]));

          if (insertedMessage.user_id === session?.user?.id) {
            markForceScroll();
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(realtimeChannel);
    };
  }, [channel?.id, markForceScroll, session?.user]);

  const chatLoading = loading || loadingMessages;

  useLayoutEffect(() => {
    resetChatScroll();
  }, [channelSlug, citySlug, countrySlug, resetChatScroll]);

  useChatScrollEffect(syncMessagesScroll, messages.length, chatLoading, scrollRequestId);

  const sendChannelContent = async (content: string) => {
    setSendError(null);

    if (!session?.user || !channel?.id) {
      const nextError = "You must sign in to send messages.";
      setSendError(nextError);
      throw new Error(nextError);
    }

    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    const ensuredProfile = await ensureProfileRow({ user: session.user });
    if (ensuredProfile.error) {
      const nextError = ensuredProfile.needsOnboarding
        ? "Complete your profile first."
        : ensuredProfile.error;
      setSendError(nextError);
      throw new Error(nextError);
    }

    setSending(true);

    const { data: insertedMessage, error: insertError } = await supabase
      .from("city_channel_messages")
      .insert({
        channel_id: channel.id,
        user_id: session.user.id,
        content: trimmed,
      })
      .select("id, channel_id, user_id, content, created_at")
      .single();

    if (insertError) {
      console.error("Failed to send channel message:", JSON.stringify(insertError, null, 2));
      const nextError = insertError.message || "Unable to send your message.";
      setSendError(nextError);
      setSending(false);
      throw new Error(nextError);
    }

    setMessages((currentMessages) =>
      mergeMessages(currentMessages, [
        buildMessage(insertedMessage as RawChannelMessage, {
          username: publicProfileUsername(ensuredProfile.profile?.username),
          avatar_url: ensuredProfile.profile?.avatar_url ?? null,
        }),
      ])
    );
    setDraft("");
    setSending(false);
    markForceScroll();
  };

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!draft.trim()) {
      return;
    }

    await sendChannelContent(draft);
  };

  const countryFlag = useMemo(
    () => (country ? getCountryFlag(country.slug, country.emoji, country.code) : "🌍"),
    [country]
  );

  const localizedError = localizeUserMessage(t, error);

  return (
    <Shell chatThread>
      <ChatThreadShell>
        <MobileSecondaryHeader
          title={city?.name ?? citySlug}
          backHref={`/rooms/${country?.slug ?? countrySlug}/${city?.slug ?? citySlug}`}
        />

        <div className="shrink-0 border-b border-white/10 bg-slate-900/95 px-4 py-2.5 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <div className="text-2xl leading-none">{countryFlag}</div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300">{t("rooms.channel")}</p>
              <h1 className="truncate text-base font-semibold text-white">
                {loading ? t("rooms.loadingChannel") : channel?.name ?? t("rooms.channel")}
              </h1>
              {city && country ? (
                <p className="truncate text-xs text-slate-400">
                  {city.name}, {country.name}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#080c18]">
          <RoomWallpaper citySlug={citySlug} countrySlug={countrySlug} />

          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className={`relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3 ${CHAT_MESSAGES_BOTTOM_PADDING}`}
          >
            {chatLoading ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/55 p-8 text-center text-slate-300 backdrop-blur-md">
                {t("rooms.loadingMessages")}
              </div>
            ) : localizedError ? (
              <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">{localizedError}</div>
            ) : messages.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/55 p-8 text-center text-slate-300 backdrop-blur-md">
                {t("rooms.channelEmpty")}
              </div>
            ) : (
              messages.map((message, messageIndex) => {
                const previousMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;
                const showDateSeparator = shouldShowChatDateSeparator(previousMessage?.created_at, message.created_at);
                const isOwnMessage = message.user_id === session?.user?.id;
                const showSenderName = shouldShowCityRoomSenderName(previousMessage, message);
                const spacingClass = getCityRoomMessageSpacingClass(previousMessage, message, showDateSeparator);
                const { isFirstInGroup, isLastInGroup } = getCityRoomGroupPosition(messages, messageIndex);

                return (
                  <Fragment key={message.id}>
                    {showDateSeparator ? <ChatDateSeparator createdAt={message.created_at} /> : null}
                    <div className={spacingClass}>
                      <CityRoomMessageBubble
                        message={message}
                        isOwnMessage={isOwnMessage}
                        showSenderName={showSenderName}
                        showAvatar={isFirstInGroup}
                        isFirstInGroup={isFirstInGroup}
                        isLastInGroup={isLastInGroup}
                      />
                    </div>
                  </Fragment>
                );
              })
            )}
            {!chatLoading && messages.length > 0 ? (
              <div ref={messagesEndRef} aria-hidden className="h-px w-full shrink-0" />
            ) : null}
          </div>

          {showNewMessages ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-30 flex justify-center px-4">
              <ChatNewMessagesPill
                onClick={() => scrollToBottom("smooth")}
                className="pointer-events-auto"
              />
            </div>
          ) : null}

          <CityRoomChatComposer
            value={draft}
            onChange={setDraft}
            onSubmit={handleSend}
            sending={sending}
            sendDisabled={sending || !session?.user?.id || !draft.trim() || Boolean(error)}
            sendError={sendError}
            inputDisabled={sending || Boolean(error)}
            placeholder={session?.user?.id ? t("rooms.channelPlaceholder") : t("rooms.signInToChat")}
          />
        </section>
      </ChatThreadShell>
    </Shell>
  );
}
