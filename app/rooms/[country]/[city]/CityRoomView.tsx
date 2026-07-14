"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { Users } from "lucide-react";
import CityRoomMessageBubble from "@/components/CityRoomMessageBubble";
import { getSafeAuthSession } from "@/lib/authSession";
import { isGuideAccountUsername, publicProfileUsername } from "@/lib/publicProfile";
import { ensureProfileRow } from "@/lib/profile";
import { supabase } from "@/lib/supabaseClient";
import CityRoomChatComposer from "@/components/CityRoomChatComposer";
import { useI18n } from "@/components/I18nProvider";
import ChatDateSeparator from "@/components/ChatDateSeparator";
import ChatNewMessagesPill from "@/components/ChatNewMessagesPill";
import ChatThreadShell from "@/components/ChatThreadShell";
import { useChatNotifications } from "@/components/ChatNotificationsProvider";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import RoomWallpaper from "@/components/RoomWallpaper";
import Shell from "@/components/Shell";
import { getCountryFlag } from "@/lib/countryFlags";
import { shouldShowChatDateSeparator } from "@/lib/chatDates";
import { isCityRoomStructuredMessage } from "@/lib/cityRoomPlaceMessage";
import {
  getCityRoomGroupPosition,
  getCityRoomMessageSpacingClass,
  shouldShowCityRoomSenderName,
} from "@/lib/cityRoomChatGrouping";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";
import { toUserFacingError } from "@/lib/userFacingError";
import { localizeCountryName, localizeCityName } from "@/lib/i18n/localizeGeo";
import { CHATS_INBOX_REFRESH_EVENT } from "@/lib/chatsInbox";
import { markRoomThreadOpened } from "@/lib/chatUnreadSync";
import {
  markRoomAsRead,
  clearRoomReturnNavigation,
  isRoomOpenedFromMessages,
  parseInAppReferrerPath,
  readRoomNavigationFromWindowSearch,
  readRoomReturnNavigation,
  resolveRoomBackHref,
  upsertRoomMembershipOnMessage,
} from "@/lib/roomMemberships";
import { useChatScroll, useChatScrollEffect } from "@/lib/useChatScroll";
import { isOnlineNow } from "@/lib/userPresence";
import { usePresenceOnlineIds } from "@/lib/usePresenceOnlineIds";
import { CITY_ROOM_MESSAGES_FLEX_PADDING } from "@/lib/keyboardSystem";
import { navigateBack } from "@/lib/navigateBack";

type Country = {
  id: string;
  name: string;
  slug: string;
  code?: string | null;
  emoji: string | null;
};

type City = {
  id: string;
  name: string;
  slug: string;
  country_id: string;
};

type SenderProfile = {
  username: string;
  avatar_url?: string | null;
};

type RawCityMessage = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  edited_at?: string | null;
};

type CityMessageWithSender = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  edited_at?: string | null;
  profile: SenderProfile | null;
};

function buildMessage(message: RawCityMessage, profile: SenderProfile | null): CityMessageWithSender {
  return {
    id: message.id,
    content: message.content,
    created_at: message.created_at,
    user_id: message.user_id,
    edited_at: message.edited_at ?? null,
    profile,
  };
}

function applyMessagePatch(
  message: CityMessageWithSender,
  patch: Pick<RawCityMessage, "content" | "edited_at">
): CityMessageWithSender {
  return {
    ...message,
    content: patch.content,
    edited_at: patch.edited_at ?? null,
  };
}

function mergeMessages(currentMessages: CityMessageWithSender[], incomingMessages: CityMessageWithSender[]) {
  const byId = new Map(currentMessages.map((message) => [message.id, message]));

  for (const message of incomingMessages) {
    byId.set(message.id, message);
  }

  return Array.from(byId.values()).sort(
    (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  );
}

const GUEST_PRESENCE_STORAGE_KEY = "spotdrop_room_presence_guest_id";

function getGuestPresenceKey() {
  if (typeof window === "undefined") {
    return `g:server`;
  }

  let guestId = window.sessionStorage.getItem(GUEST_PRESENCE_STORAGE_KEY);
  if (!guestId) {
    guestId = crypto.randomUUID();
    window.sessionStorage.setItem(GUEST_PRESENCE_STORAGE_KEY, guestId);
  }

  return `g:${guestId}`;
}

function presenceKeyForClient(userId: string | undefined) {
  if (userId) {
    return `u:${userId}`;
  }

  return getGuestPresenceKey();
}

function countPresencePeers(channel: RealtimeChannel) {
  return Object.keys(channel.presenceState()).length;
}

export default function RoomChatPage() {
  const { t, locale } = useI18n();
  const { presenceOnlineIds, freshnessTick } = usePresenceOnlineIds();
  const pathname = usePathname();
  const params = useParams<{ country: string; city: string }>();
  const searchParams = useSearchParams();
  const citySlug = String(params.city ?? "").toLowerCase();
  const countrySlug = String(params.country ?? "").toLowerCase();
  const roomFromParam = searchParams.get("from");
  const roomReturnToParam = searchParams.get("returnTo");
  const [referrerPath] = useState(() =>
    typeof document !== "undefined" ? parseInAppReferrerPath(document.referrer) : null
  );
  const [windowNavigation, setWindowNavigation] = useState(readRoomNavigationFromWindowSearch);
  const [sessionNavigation, setSessionNavigation] = useState(readRoomReturnNavigation);

  useEffect(() => {
    setWindowNavigation(readRoomNavigationFromWindowSearch());
    setSessionNavigation(readRoomReturnNavigation());
  }, [pathname, roomFromParam, roomReturnToParam]);

  const roomFrom = roomFromParam ?? windowNavigation.from;
  const roomReturnTo = roomReturnToParam ?? windowNavigation.returnTo;
  console.log("[Rooms route] city params", { rawCountry: params.country, rawCity: params.city, countrySlug, citySlug });
  const [country, setCountry] = useState<Country | null>(null);
  const [city, setCity] = useState<City | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState<string | null>(null);
  const [cityId, setCityId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CityMessageWithSender[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [showJoinMessage, setShowJoinMessage] = useState(false);
  const [joinMessageRoomId, setJoinMessageRoomId] = useState<string | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
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
  const { refreshUnreadCount } = useChatNotifications();
  const [inRoomCount, setInRoomCount] = useState<number | null>(null);
  const [presenceUsable, setPresenceUsable] = useState(false);
  const [cityOnlineCount, setCityOnlineCount] = useState<number | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingDeleteMessageId, setPendingDeleteMessageId] = useState<string | null>(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    const { session, error: sessionError, expired } = await getSafeAuthSession();
    setSession(session);

    console.log("[Rooms auth] city room", {
      loggedIn: Boolean(session?.user),
      expired,
      sessionError,
      path: typeof window !== "undefined" ? window.location.pathname : "ssr",
    });

    if (sessionError) {
      setError(sessionError);
      setCurrentUsername(null);
      setCurrentUserAvatarUrl(null);
      return;
    }

    if (!session?.user?.id) {
      setCurrentUsername(null);
      setCurrentUserAvatarUrl(null);
      return;
    }

    const ensureProfileResult = await ensureProfileRow({ user: session.user });

    if (ensureProfileResult.error && !ensureProfileResult.needsOnboarding) {
      console.error("Failed to ensure current room profile:", ensureProfileResult.error);
      setCurrentUsername(null);
      setCurrentUserAvatarUrl(null);
      return;
    }

    setCurrentUsername(
      ensureProfileResult.profile?.username
        ? publicProfileUsername(ensureProfileResult.profile.username)
        : null
    );
    setCurrentUserAvatarUrl(ensureProfileResult.profile?.avatar_url ?? null);
  }, []);

  const loadRoomMeta = useCallback(async () => {
    if (!countrySlug || !citySlug) {
      setError("Invalid room parameters.");
      setLoadingRoom(false);
      return;
    }

    const { data: countryData, error: countryError } = await supabase
      .from("countries")
      .select("id, name, slug, emoji")
      .eq("slug", countrySlug)
      .single();

    if (countryError || !countryData) {
      console.error("Failed to load room country:", countryError);
      setError("Country not found.");
      setLoadingRoom(false);
      return;
    }

    const { data: cityData, error: cityError } = await supabase
      .from("cities")
      .select("id, name, slug, country_id")
      .eq("country_id", countryData.id)
      .eq("slug", citySlug)
      .single();

    if (cityError || !cityData) {
      console.error("Failed to load room city:", cityError);
      setError("City not found.");
      setLoadingRoom(false);
      return;
    }

    setCountry(countryData);
    setCity(cityData);
    setCityId(cityData.id);
    setError(null);
    setLoadingRoom(false);
  }, [countrySlug, citySlug]);

  const loadMessages = useCallback(async () => {
    if (!cityId) return;
    setLoadingMessages(true);

    const { data, error: fetchError } = await supabase
      .from("city_messages")
      .select("id, content, created_at, user_id, edited_at")
      .eq("city_id", cityId)
      .order("created_at", { ascending: true });

    if (fetchError) {
      console.error("Failed to load city messages:", fetchError);
      setError(toUserFacingError(fetchError, "Unable to load messages."));
      setMessages([]);
    } else {
      const rawMessages = (data ?? []) as RawCityMessage[];
      const uniqueUserIds = [...new Set(rawMessages.map((message) => message.user_id))];
      let profilesById = new Map<string, SenderProfile>();

      if (uniqueUserIds.length > 0) {
        const { data: profileRows, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", uniqueUserIds);

        if (profileError) {
          console.error("Failed to load chat message profiles:", profileError);
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

      setMessages(
        rawMessages
          .filter((message) => {
            const profile = profilesById.get(message.user_id);
            return !profile || !isGuideAccountUsername(profile.username);
          })
          .map((message) => buildMessage(message, profilesById.get(message.user_id) ?? null))
      );
      setError(null);
    }

    setLoadingMessages(false);
  }, [cityId]);

  useEffect(() => {
    const loadInitialRoom = async () => {
      await loadSession();
      await loadRoomMeta();
    };

    void loadInitialRoom();
  }, [loadSession, loadRoomMeta]);

  useEffect(() => {
    if (!session?.user?.id || !countrySlug || !citySlug) {
      return;
    }

    void markRoomThreadOpened(session.user.id, countrySlug, citySlug, refreshUnreadCount);
  }, [session?.user?.id, countrySlug, citySlug, refreshUnreadCount]);

  useEffect(() => {
    if (cityId) {
      const loadInitialMessages = async () => {
        await loadMessages();
      };

      void loadInitialMessages();

      const channel = supabase
        .channel(`city_messages_${cityId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "city_messages", filter: `city_id=eq.${cityId}` },
          async (payload) => {
            const insertedMessage = payload.new as RawCityMessage;

            let senderProfile: SenderProfile | null = null;

            if (insertedMessage.user_id === session?.user?.id && currentUsername) {
              senderProfile = {
                username: currentUsername,
                avatar_url: currentUserAvatarUrl,
              };
            } else {
              const { data: profileRow, error: profileError } = await supabase
                .from("profiles")
                .select("username, avatar_url")
                .eq("id", insertedMessage.user_id)
                .maybeSingle();

              if (profileError) {
                console.error("Failed to load realtime sender profile:", profileError);
              } else if (profileRow) {
                if (isGuideAccountUsername(profileRow.username)) {
                  return;
                }

                senderProfile = {
                  username: publicProfileUsername(profileRow.username),
                  avatar_url: profileRow.avatar_url ?? null,
                };
              }

              if (session?.user?.id && countrySlug && citySlug) {
                void markRoomAsRead(session.user.id, countrySlug, citySlug);
              }
            }

            if (senderProfile && isGuideAccountUsername(senderProfile.username)) {
              return;
            }

            setMessages((currentMessages) =>
              mergeMessages(currentMessages, [buildMessage(insertedMessage, senderProfile)])
            );

            if (insertedMessage.user_id === session?.user?.id) {
              markForceScroll();
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "city_messages", filter: `city_id=eq.${cityId}` },
          (payload) => {
            const updatedMessage = payload.new as RawCityMessage;

            setMessages((currentMessages) =>
              currentMessages.map((message) =>
                message.id === updatedMessage.id
                  ? applyMessagePatch(message, {
                      content: updatedMessage.content,
                      edited_at: updatedMessage.edited_at,
                    })
                  : message
              )
            );
          }
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "city_messages", filter: `city_id=eq.${cityId}` },
          (payload) => {
            const deletedId = (payload.old as { id?: string }).id;
            if (!deletedId) {
              return;
            }

            setMessages((currentMessages) => currentMessages.filter((message) => message.id !== deletedId));
            setPendingDeleteMessageId((current) => (current === deletedId ? null : current));
            setEditingMessageId((current) => {
              if (current === deletedId) {
                setEditDraft("");
                setEditError(null);
                return null;
              }
              return current;
            });
          }
        )
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    }
  }, [cityId, loadMessages, markForceScroll, session?.user?.id, currentUsername, currentUserAvatarUrl, countrySlug, citySlug]);

  useEffect(() => {
    if (!cityId) {
      const resetCityOnline = async () => {
        setCityOnlineCount(null);
      };

      void resetCityOnline();
      return;
    }

    let cancelled = false;

    const loadCityOnline = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, is_online, last_seen_at")
        .eq("city_id", cityId);

      if (cancelled) {
        return;
      }

      if (error) {
        console.error("Failed to load city online count:", error);
        setCityOnlineCount(null);
        return;
      }

      const count =
        data?.filter((profile) =>
          isOnlineNow({
            screen: "city-room",
            userId: profile.id,
            isOnlineFlag: profile.is_online,
            lastSeenAt: profile.last_seen_at,
            presenceOnline: presenceOnlineIds.has(profile.id),
          })
        ).length ?? 0;

      setCityOnlineCount(count);
    };

    void loadCityOnline();

    return () => {
      cancelled = true;
    };
  }, [cityId, freshnessTick, presenceOnlineIds]);

  useEffect(() => {
    if (!cityId) {
      const resetPresence = async () => {
        setInRoomCount(null);
        setPresenceUsable(false);
      };

      void resetPresence();
      return;
    }

    const resetPresenceForRoom = async () => {
      setPresenceUsable(false);
      setInRoomCount(null);
    };

    void resetPresenceForRoom();

    let channel: RealtimeChannel | null = null;

    try {
      const presenceKey = presenceKeyForClient(session?.user?.id);

      channel = supabase.channel(`city_room:${cityId}`, {
        config: {
          presence: {
            key: presenceKey,
          },
        },
      });
    } catch (caught) {
      console.error("Room presence channel setup failed:", caught);
      const resetFailedPresence = async () => {
        setPresenceUsable(false);
        setInRoomCount(null);
      };

      void resetFailedPresence();
      return;
    }

    if (!channel) {
      return;
    }

    const presenceChannel = channel;

    const applyPresenceCount = () => {
      try {
        setInRoomCount(countPresencePeers(presenceChannel));
      } catch (caught) {
        console.error("Room presence count failed:", caught);
        setPresenceUsable(false);
        setInRoomCount(null);
      }
    };

    const handlePresenceEvent = () => {
      setPresenceUsable(true);
      applyPresenceCount();
    };

    presenceChannel
      .on("presence", { event: "sync" }, handlePresenceEvent)
      .on("presence", { event: "join" }, handlePresenceEvent)
      .on("presence", { event: "leave" }, handlePresenceEvent)
      .subscribe(async (status) => {
        try {
          if (status === "SUBSCRIBED") {
            setPresenceUsable(true);
            const trackResult = await presenceChannel.track({ joined_at: Date.now() });
            if (trackResult !== "ok") {
              console.error("Room presence track failed:", trackResult);
              setPresenceUsable(false);
              setInRoomCount(null);
              return;
            }
            applyPresenceCount();
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setPresenceUsable(false);
            setInRoomCount(null);
          }
        } catch (caught) {
          console.error("Room presence subscribe handler failed:", caught);
          setPresenceUsable(false);
          setInRoomCount(null);
        }
      });

    return () => {
      try {
        void presenceChannel.untrack();
      } catch {
        /* ignore */
      }
      void supabase.removeChannel(presenceChannel);
    };
  }, [cityId, session?.user?.id]);

  useEffect(() => {
    if (!city || !session?.user?.id || joinMessageRoomId === city.id) {
      return;
    }

    const presenceVerbs = ["visited", "joined", "entered"] as const;
    const joinName = publicProfileUsername(
      currentUsername ??
        (typeof session.user.user_metadata?.username === "string"
          ? session.user.user_metadata.username
          : null)
    );
    const seedSource = `${joinName}-${city.name}`;
    const seed = seedSource.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
    const verb = presenceVerbs[seed % presenceVerbs.length];

    const showJoinNotice = async () => {
      const cityLabel = city
        ? localizeCityName(locale, {
            slug: city.slug,
            name: city.name,
            countrySlug: country?.slug ?? countrySlug,
          })
        : t("rooms.cityRoom");
      setJoinMessage(t(`rooms.presence.${verb}`, { name: joinName, city: cityLabel }));
      setShowJoinMessage(true);
      setJoinMessageRoomId(city.id);
    };

    void showJoinNotice();

    const timer = window.setTimeout(() => {
      setShowJoinMessage(false);
    }, 3000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [city, country?.slug, countrySlug, currentUsername, joinMessageRoomId, locale, session?.user?.id, session?.user?.user_metadata?.username, t]);

  const chatLoading = loadingRoom || loadingMessages;

  useLayoutEffect(() => {
    resetChatScroll();
  }, [citySlug, countrySlug, resetChatScroll]);

  useChatScrollEffect(syncMessagesScroll, messages.length, chatLoading, scrollRequestId);

  useEffect(() => {
    if (showJoinMessage) {
      return;
    }

    const removeTimer = window.setTimeout(() => {
      setJoinMessage(null);
    }, 180);

    return () => {
      window.clearTimeout(removeTimer);
    };
  }, [showJoinMessage]);

  const sendRoomContent = async (content: string) => {
    setError(null);
    setSendError(null);

    if (sending) {
      return;
    }

    if (!session?.user?.id || !cityId) {
      const nextError = "You must sign in to send messages.";
      setSendError(nextError);
      throw new Error(nextError);
    }

    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    const ensureProfileResult = await ensureProfileRow({ user: session.user });

    if (ensureProfileResult.error) {
      const nextError = ensureProfileResult.needsOnboarding
        ? "Complete your profile first."
        : toUserFacingError(ensureProfileResult.error, "Unable to send your message.");
      setSendError(nextError);
      throw new Error(nextError);
    }

    setCurrentUsername(
      publicProfileUsername(ensureProfileResult.profile?.username ?? currentUsername)
    );
    setCurrentUserAvatarUrl(ensureProfileResult.profile?.avatar_url ?? currentUserAvatarUrl);

    setSending(true);

    const { data: insertedMessage, error: insertError } = await supabase
      .from("city_messages")
      .insert({
        city_id: cityId,
        user_id: session.user.id,
        content: trimmed,
      })
      .select("id, content, created_at, user_id, edited_at")
      .single();

    if (insertError) {
      console.error("Failed to send city message:", insertError.code ?? "unknown");
      const nextError = toUserFacingError(insertError, "Unable to send your message.");
      setSendError(nextError);
      setSending(false);
      throw new Error(nextError);
    }

    const appendedMessage = buildMessage(insertedMessage as RawCityMessage, {
      username: publicProfileUsername(ensureProfileResult.profile?.username ?? currentUsername),
      avatar_url: ensureProfileResult.profile?.avatar_url ?? currentUserAvatarUrl,
    });

    setMessages((currentMessages) => mergeMessages(currentMessages, [appendedMessage]));
    setNewMessage("");
    setSending(false);
    markForceScroll();

    const membershipCountrySlug = country?.slug ?? countrySlug;
    const membershipCitySlug = city?.slug ?? citySlug;
    const membershipResult = await upsertRoomMembershipOnMessage(
      session.user.id,
      membershipCountrySlug,
      membershipCitySlug
    );

    if (membershipResult.error) {
      console.error("[CityRoomView] room membership upsert failed:", membershipResult.error);
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
    }
  };

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (sending || !newMessage.trim()) {
      return;
    }

    await sendRoomContent(newMessage);
  };

  const countryFlag = useMemo(
    () => (country ? getCountryFlag(country.slug, country.emoji, country.code) : "🌍"),
    [country]
  );
  const onlineIndicator = useMemo((): { kind: "count"; n: number } | { kind: "unknown" } => {
    if (presenceUsable && inRoomCount !== null) {
      return { kind: "count", n: inRoomCount };
    }

    if (cityOnlineCount !== null) {
      return { kind: "count", n: cityOnlineCount };
    }

    return { kind: "unknown" };
  }, [presenceUsable, inRoomCount, cityOnlineCount]);
  const isSendDisabled = sending || !session?.user?.id || !newMessage.trim();
  const localizedError = localizeUserMessage(t, error);

  const startEditingMessage = (message: CityMessageWithSender) => {
    if (isCityRoomStructuredMessage(message.content)) {
      return;
    }

    setDeleteError(null);
    setPendingDeleteMessageId(null);
    setEditError(null);
    setEditingMessageId(message.id);
    setEditDraft(message.content);
  };

  const cancelEditingMessage = () => {
    setEditError(null);
    setEditingMessageId(null);
    setEditDraft("");
  };

  const saveEditedMessage = async () => {
    if (!session?.user?.id || !editingMessageId) {
      return;
    }

    const trimmed = editDraft.trim();
    if (!trimmed) {
      setEditError("Message cannot be empty.");
      return;
    }

    const targetMessage = messages.find((message) => message.id === editingMessageId);
    if (!targetMessage || targetMessage.user_id !== session.user.id) {
      setEditError("You can only edit your own messages.");
      return;
    }

    if (trimmed === targetMessage.content) {
      cancelEditingMessage();
      return;
    }

    setSavingEdit(true);
    setEditError(null);

    const editedAt = new Date().toISOString();
    const { data: updatedMessage, error: updateError } = await supabase
      .from("city_messages")
      .update({
        content: trimmed,
        edited_at: editedAt,
      })
      .eq("id", editingMessageId)
      .eq("user_id", session.user.id)
      .select("id, content, created_at, user_id, edited_at")
      .single();

    if (updateError) {
      console.error("Failed to update city message:", updateError);
      setEditError(updateError.message || "Unable to save your edit.");
      setSavingEdit(false);
      return;
    }

    const patch = updatedMessage as RawCityMessage;

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === patch.id ? applyMessagePatch(message, { content: patch.content, edited_at: patch.edited_at }) : message
      )
    );

    cancelEditingMessage();
    setSavingEdit(false);
  };

  const requestDeleteMessage = (message: CityMessageWithSender) => {
    if (message.user_id !== session?.user?.id) {
      return;
    }

    setDeleteError(null);
    cancelEditingMessage();
    setPendingDeleteMessageId(message.id);
  };

  const cancelDeleteMessage = () => {
    setDeleteError(null);
    setPendingDeleteMessageId(null);
  };

  const confirmDeleteMessage = async () => {
    if (!session?.user?.id || !pendingDeleteMessageId) {
      return;
    }

    const targetMessage = messages.find((message) => message.id === pendingDeleteMessageId);
    if (!targetMessage || targetMessage.user_id !== session.user.id) {
      setDeleteError("You can only delete your own messages.");
      return;
    }

    setDeletingMessage(true);
    setDeleteError(null);

    const messageId = pendingDeleteMessageId;
    const { error: deleteErrorResult } = await supabase
      .from("city_messages")
      .delete()
      .eq("id", messageId)
      .eq("user_id", session.user.id);

    if (deleteErrorResult) {
      console.error("Failed to delete city message:", deleteErrorResult);
      setDeleteError(deleteErrorResult.message || "Unable to delete your message.");
      setDeletingMessage(false);
      return;
    }

    setMessages((currentMessages) => currentMessages.filter((message) => message.id !== messageId));
    setPendingDeleteMessageId(null);
    setDeletingMessage(false);
  };

  const openedFromMessages = useMemo(
    () =>
      isRoomOpenedFromMessages({
        from: roomFrom,
        returnTo: roomReturnTo,
        referrerPath,
        sessionReturnSource: sessionNavigation.sessionReturnSource,
      }),
    [referrerPath, roomFrom, roomReturnTo, sessionNavigation.sessionReturnSource]
  );

  const roomBackHref = useMemo(
    () =>
      resolveRoomBackHref({
        from: roomFrom,
        returnTo: roomReturnTo,
        countrySlug: country?.slug ?? countrySlug,
        referrerPath,
        sessionReturnSource: sessionNavigation.sessionReturnSource,
        sessionReturnHref: sessionNavigation.sessionReturnHref,
      }),
    [
      country?.slug,
      countrySlug,
      referrerPath,
      roomFrom,
      roomReturnTo,
      sessionNavigation.sessionReturnHref,
      sessionNavigation.sessionReturnSource,
    ]
  );

  const localizedCountryName = useMemo(
    () =>
      country
        ? localizeCountryName(locale, { slug: country.slug, name: country.name, countryCode: country.code })
        : localizeCountryName(locale, { name: countrySlug, slug: countrySlug }),
    [country, countrySlug, locale]
  );

  const localizedCityName = useMemo(
    () =>
      city
        ? localizeCityName(locale, {
            slug: city.slug,
            name: city.name,
            countrySlug: country?.slug ?? countrySlug,
          })
        : null,
    [city, country?.slug, countrySlug, locale]
  );

  const roomHeaderTitle = openedFromMessages
    ? t("chats.title")
    : localizedCountryName;

  const router = useRouter();

  const handleRoomBack = useCallback(() => {
    clearRoomReturnNavigation();
    // Always use the explicit parent: country city list, or Messages when opened from inbox.
    navigateBack(router, roomBackHref, { preferFallback: true });
  }, [router, roomBackHref]);

  return (
    <Shell chatThread>
      <ChatThreadShell>
        <MobileSecondaryHeader
          title={roomHeaderTitle}
          backHref={roomBackHref}
          onBack={handleRoomBack}
          preferFallback
        />

        <div className="shrink-0 border-b border-white/10 bg-slate-900/95 px-4 py-2.5 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <div className="text-2xl leading-none">{countryFlag}</div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-base font-semibold text-white">
                  {localizedCityName ?? t("rooms.cityRoom")}
                </h1>
                <div
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/70 px-2 py-0.5 text-[10px] font-medium text-slate-300"
                  title="Uses live room presence when enabled; otherwise profiles marked online in this city."
                >
                  <Users className="h-3 w-3 shrink-0 text-slate-500" strokeWidth={1.75} aria-hidden />
                  {onlineIndicator.kind === "count" ? (
                    <span className="tabular-nums">{t("rooms.onlineCount", { count: onlineIndicator.n })}</span>
                  ) : (
                    <span className="text-slate-400">{t("common.online")}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#070b14]">
          <RoomWallpaper citySlug={citySlug} countrySlug={countrySlug} />

          {joinMessage && showJoinMessage ? (
            <div className="relative z-10 shrink-0 px-4 pt-3">
              <div className="mx-auto w-fit rounded-full border border-white/10 bg-slate-950/45 px-4 py-2 text-xs font-medium text-slate-200 shadow-lg shadow-black/20 backdrop-blur-md join-message-fade">
                {joinMessage}
              </div>
            </div>
          ) : null}

          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className={`relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3 ${CITY_ROOM_MESSAGES_FLEX_PADDING}`}
          >
            {chatLoading ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/55 p-8 text-center text-slate-300 backdrop-blur-md">
                {t("rooms.loadingMessages")}
              </div>
            ) : localizedError ? (
              <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">{localizedError}</div>
            ) : messages.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/55 p-8 text-center text-slate-300 backdrop-blur-md">
                {t("rooms.emptyMessages")}
              </div>
            ) : (
              <>
                {messages.map((message, messageIndex) => {
                  const isOwnMessage = message.user_id === session?.user?.id;
                  const isEditing = editingMessageId === message.id;
                  const isConfirmingDelete = pendingDeleteMessageId === message.id;
                  const previousMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;
                  const showDateSeparator = shouldShowChatDateSeparator(
                    previousMessage?.created_at,
                    message.created_at
                  );
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
                          isEditing={isEditing}
                          isConfirmingDelete={isConfirmingDelete}
                          editDraft={editDraft}
                          editError={editError}
                          deleteError={deleteError}
                          savingEdit={savingEdit}
                          deletingMessage={deletingMessage}
                          onStartEdit={() => startEditingMessage(message)}
                          onCancelEdit={cancelEditingMessage}
                          onSaveEdit={() => void saveEditedMessage()}
                          onEditDraftChange={setEditDraft}
                          onRequestDelete={() => requestDeleteMessage(message)}
                          onCancelDelete={cancelDeleteMessage}
                          onConfirmDelete={() => void confirmDeleteMessage()}
                        />
                      </div>
                    </Fragment>
                  );
                })}
              </>
            )}
            {!chatLoading ? (
              <div ref={messagesEndRef} aria-hidden className="h-px w-full shrink-0" />
            ) : null}
          </div>

          <div className="relative z-20 shrink-0">
            {showNewMessages ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-full z-30 mb-2 flex justify-center px-4">
                <ChatNewMessagesPill
                  onClick={() => scrollToBottom("smooth")}
                  className="pointer-events-auto"
                />
              </div>
            ) : null}

            <CityRoomChatComposer
            value={newMessage}
            onChange={setNewMessage}
            onSubmit={handleSend}
            sending={sending}
            sendDisabled={isSendDisabled}
            sendError={sendError}
            inputDisabled={!session?.user?.id}
            placeholder={session?.user?.id ? t("rooms.messagePlaceholder") : t("rooms.signInToChat")}
            textareaRef={composerTextareaRef}
            footer={
              !session?.user?.id ? (
                <p className="mt-2 text-center text-xs text-slate-400">
                  <Link href="/auth/login" className="font-semibold text-cyan-300 hover:text-cyan-200">
                    {t("auth.signIn")}
                  </Link>{" "}
                  {t("rooms.signInToPost")}
                </p>
              ) : null
            }
            />
          </div>
        </section>
      </ChatThreadShell>
      <style jsx>{`
        @keyframes joinBadgeFade {
          0% {
            opacity: 0;
            transform: translateY(-6px);
          }
          12%,
          78% {
            opacity: 1;
            transform: translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateY(-10px);
          }
        }

        .join-message-fade {
          animation: joinBadgeFade 3s ease forwards;
        }
      `}</style>
    </Shell>
  );
}
