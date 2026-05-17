"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { Send, UserRound } from "lucide-react";
import ChatDateSeparator from "@/components/ChatDateSeparator";
import Shell from "@/components/Shell";
import { getSafeAuthSession } from "@/lib/authSession";
import { formatChatMessageTime, shouldShowChatDateSeparator } from "@/lib/chatDates";
import { getCountryFlag } from "@/lib/countryFlags";
import { ensureProfileRow } from "@/lib/profile";
import { publicProfileUsername } from "@/lib/publicProfile";
import { supabase } from "@/lib/supabaseClient";

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
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

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
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(realtimeChannel);
    };
  }, [channel?.id, session?.user]);

  useEffect(() => {
    messagesContainerRef.current?.scrollTo({
      top: messagesContainerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSendError(null);

    if (!session?.user || !channel?.id) {
      setSendError("Sign in to send messages.");
      return;
    }

    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    const ensuredProfile = await ensureProfileRow({ user: session.user });
    if (ensuredProfile.error) {
      setSendError(ensuredProfile.needsOnboarding ? "Complete your profile before sending messages." : ensuredProfile.error);
      return;
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
      setSendError(insertError.message || "Unable to send your message.");
      setSending(false);
      return;
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
  };

  const countryFlag = useMemo(
    () => (country ? getCountryFlag(country.slug, country.emoji, country.code) : "🌍"),
    [country]
  );

  return (
    <Shell>
      <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-5xl flex-col gap-3">
        <section className="rounded-3xl border border-white/10 bg-slate-900/90 p-5 shadow-xl shadow-black/20 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="text-4xl">{countryFlag}</div>
              <div className="min-w-0">
                <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Channel</p>
                <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
                  {loading ? "Loading channel..." : channel?.name ?? "Channel not found"}
                </h1>
                {channel?.description ? (
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">{channel.description}</p>
                ) : null}
                {city && country ? (
                  <p className="mt-2 text-sm text-slate-500">
                    {city.name}, {country.name}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link href="/rooms" className="rounded-full bg-white/5 px-3 py-2 text-slate-200 transition hover:bg-white/10">
                Countries
              </Link>
              <Link
                href={`/rooms/${country?.slug ?? countrySlug}/${city?.slug ?? citySlug}`}
                className="rounded-full bg-white/5 px-3 py-2 text-slate-200 transition hover:bg-white/10"
              >
                City room
              </Link>
            </div>
          </div>
        </section>

        <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92)_0%,rgba(8,12,24,0.96)_100%)] shadow-2xl shadow-black/30">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.10),transparent_30%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.10),transparent_28%),radial-gradient(circle_at_bottom,rgba(244,114,182,0.06),transparent_30%)]" />
            <div className="absolute -left-16 top-20 h-52 w-52 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="absolute right-[-3rem] top-1/3 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
          </div>

          <div
            ref={messagesContainerRef}
            className="relative z-10 flex-1 space-y-4 overflow-y-auto bg-slate-950/15 p-4 pb-32 backdrop-blur-[2px]"
          >
            {loading || loadingMessages ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/55 p-8 text-center text-slate-300 backdrop-blur-md">
                Loading messages...
              </div>
            ) : error ? (
              <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">{error}</div>
            ) : messages.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/55 p-8 text-center text-slate-300 backdrop-blur-md">
                No messages yet. Start the channel chat.
              </div>
            ) : (
              messages.map((message, messageIndex) => {
                const previousMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;
                const showDateSeparator = shouldShowChatDateSeparator(previousMessage?.created_at, message.created_at);
                const sender = message.profile;

                return (
                  <Fragment key={message.id}>
                    {showDateSeparator ? <ChatDateSeparator createdAt={message.created_at} /> : null}
                    <article className="flex items-start gap-3">
                      <Link href={`/user/${message.user_id}`} className="shrink-0">
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-800 text-sm font-semibold text-white">
                          {sender?.avatar_url ? (
                            <img src={sender.avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <UserRound className="h-4 w-4 text-slate-500" strokeWidth={1.5} aria-hidden />
                          )}
                        </div>
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
                          <Link href={`/user/${message.user_id}`} className="text-sm font-semibold text-cyan-300 hover:text-cyan-200">
                            {publicProfileUsername(sender?.username)}
                          </Link>
                          <span className="text-[11px] text-slate-500">{formatChatMessageTime(message.created_at)}</span>
                        </div>
                        <div className="w-fit max-w-full rounded-3xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm leading-relaxed text-slate-100 shadow-lg shadow-black/20">
                          {message.content}
                        </div>
                      </div>
                    </article>
                  </Fragment>
                );
              })
            )}
          </div>

          <form
            onSubmit={handleSend}
            className="absolute inset-x-0 bottom-0 z-20 border-t border-white/10 bg-slate-950/88 p-3 backdrop-blur-xl sm:p-4"
          >
            {sendError ? <p className="mb-2 text-xs text-red-300">{sendError}</p> : null}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={session?.user?.id ? "Message this channel..." : "Sign in to chat"}
                rows={1}
                disabled={sending || Boolean(error)}
                className="max-h-28 min-h-11 flex-1 resize-none rounded-3xl border border-white/10 bg-slate-900/95 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={sending || !session?.user?.id || !draft.trim() || Boolean(error)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </form>
        </section>
      </div>
    </Shell>
  );
}
