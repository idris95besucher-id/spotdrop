"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { Map as MapIcon, MessageSquare, Pencil, Trash2, Users } from "lucide-react";
import BernDiscoveryMap from "@/components/BernDiscoveryMap";
import { isBernDiscoveryRoom } from "@/lib/discoveryMap";
import { getSafeAuthSession } from "@/lib/authSession";
import { publicProfileUsername } from "@/lib/publicProfile";
import { ensureProfileRow } from "@/lib/profile";
import { supabase } from "@/lib/supabaseClient";
import ChatDateSeparator from "@/components/ChatDateSeparator";
import Shell from "@/components/Shell";
import { getCountryFlag } from "@/lib/countryFlags";
import { formatChatMessageTime, shouldShowChatDateSeparator } from "@/lib/chatDates";

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

const EMOJI_OPTIONS = [
  "😀",
  "😄",
  "😊",
  "😍",
  "🥳",
  "😎",
  "🤝",
  "👏",
  "🔥",
  "✨",
  "🌍",
  "🗺️",
  "📍",
  "🏙️",
  "🌆",
  "🏞️",
  "☕",
  "🍕",
  "🍣",
  "🍷",
  "🌮",
  "🥐",
  "❤️",
  "👍",
];

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
  const params = useParams<{ country: string; city: string }>();
  const searchParams = useSearchParams();
  const citySlug = String(params.city ?? "").toLowerCase();
  const countrySlug = String(params.country ?? "").toLowerCase();
  const bernByUrl = isBernDiscoveryRoom(countrySlug, citySlug, null);
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
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiPickerRef = useRef<HTMLFormElement | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
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
  const tabFromUrl = searchParams.get("tab");
  const isBernRoom = useMemo(
    () => isBernDiscoveryRoom(countrySlug, citySlug, city?.name),
    [countrySlug, citySlug, city?.name]
  );
  const showBernMapUi = bernByUrl || isBernRoom;

  const initialRoomView: "chat" | "map" = showBernMapUi
    ? tabFromUrl === "chat"
      ? "chat"
      : "map"
    : "chat";
  const [roomView, setRoomView] = useState<"chat" | "map">(initialRoomView);

  const switchRoomView = useCallback((view: "chat" | "map") => {
    setRoomView(view);
  }, []);

  useEffect(() => {
    if (!showBernMapUi) {
      setRoomView("chat");
      return;
    }

    if (tabFromUrl === "chat") {
      setRoomView("chat");
      return;
    }

    setRoomView("map");
  }, [tabFromUrl, showBernMapUi]);

  const loadSession = useCallback(async () => {
    const { session, error: sessionError } = await getSafeAuthSession();
    setSession(session);

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
      setError(fetchError.message);
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
        rawMessages.map((message) => buildMessage(message, profilesById.get(message.user_id) ?? null))
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
                senderProfile = {
                  username: publicProfileUsername(profileRow.username),
                  avatar_url: profileRow.avatar_url ?? null,
                };
              }
            }

            setMessages((currentMessages) =>
              mergeMessages(currentMessages, [buildMessage(insertedMessage, senderProfile)])
            );
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
  }, [cityId, loadMessages, session?.user?.id, currentUsername, currentUserAvatarUrl]);

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
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("city_id", cityId)
        .eq("is_online", true);

      if (cancelled) {
        return;
      }

      if (error) {
        console.error("Failed to load city online count:", error);
        setCityOnlineCount(null);
        return;
      }

      setCityOnlineCount(count ?? 0);
    };

    void loadCityOnline();

    return () => {
      cancelled = true;
    };
  }, [cityId]);

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

    const verbs = ["visited", "joined", "entered"];
    const joinName = publicProfileUsername(
      currentUsername ??
        (typeof session.user.user_metadata?.username === "string"
          ? session.user.user_metadata.username
          : null)
    );
    const seedSource = `${joinName}-${city.name}`;
    const seed = seedSource.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
    const verb = verbs[seed % verbs.length];

    const showJoinNotice = async () => {
      setJoinMessage(`${joinName} ${verb} ${city.name}`);
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
  }, [city, currentUsername, session?.user?.id, session?.user?.user_metadata?.username, joinMessageRoomId]);

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

  useEffect(() => {
    if (!showEmojiPicker) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!emojiPickerRef.current?.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [showEmojiPicker]);

  useEffect(() => {
    const container = messagesContainerRef.current;

    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSendError(null);

    if (!session?.user?.id || !cityId) {
      const nextError = "You must sign in to send messages.";
      console.error(nextError, { authenticated: Boolean(session?.user?.id), cityId });
      setSendError(nextError);
      return;
    }

    const trimmed = newMessage.trim();
    if (!trimmed) {
      return;
    }

    const ensureProfileResult = await ensureProfileRow({ user: session.user });

    if (ensureProfileResult.error) {
      const nextError = ensureProfileResult.needsOnboarding
        ? "Complete your profile before sending city messages."
        : ensureProfileResult.error;
      console.error("Profile verification failed before sending city message:", nextError);
      setSendError(nextError);
      return;
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
      console.error("Failed to send city message:", insertError);
      setSendError(insertError.message || "Unable to send your message.");
      setSending(false);
      return;
    }

    const appendedMessage = buildMessage(insertedMessage as RawCityMessage, {
      username: publicProfileUsername(ensureProfileResult.profile?.username ?? currentUsername),
      avatar_url: ensureProfileResult.profile?.avatar_url ?? currentUserAvatarUrl,
    });

    setMessages((currentMessages) => mergeMessages(currentMessages, [appendedMessage]));
    setNewMessage("");
    setSending(false);
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

  const startEditingMessage = (message: CityMessageWithSender) => {
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

  const insertEmoji = (emoji: string) => {
    const textarea = composerTextareaRef.current;

    if (!textarea) {
      setNewMessage((current) => `${current}${emoji}`);
      setShowEmojiPicker(false);
      return;
    }

    const start = textarea.selectionStart ?? newMessage.length;
    const end = textarea.selectionEnd ?? newMessage.length;
    const nextMessage = `${newMessage.slice(0, start)}${emoji}${newMessage.slice(end)}`;
    const nextCursorPosition = start + emoji.length;

    setNewMessage(nextMessage);
    setShowEmojiPicker(false);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  };

  return (
    <Shell>
      <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-5xl flex-col gap-3">
        {showBernMapUi ? (
          <div
            className="rounded-2xl border-4 border-yellow-300 bg-yellow-300 px-4 py-4 text-center shadow-lg shadow-yellow-500/30"
            role="status"
          >
            <p className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">MAP VERSION 2 IS LIVE</p>
          </div>
        ) : null}
        <section className="rounded-3xl border border-white/10 bg-slate-900/90 p-5 shadow-xl shadow-black/20 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="text-4xl">{countryFlag}</div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">Local discovery room</p>
                  <div
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[11px] font-medium text-slate-300 shadow-inner shadow-black/20 sm:text-xs"
                    title="Uses live room presence when enabled; otherwise profiles marked online in this city."
                  >
                    <Users className="h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={1.75} aria-hidden />
                    {onlineIndicator.kind === "count" ? (
                      <span className="tabular-nums">
                        {onlineIndicator.n} online
                      </span>
                    ) : (
                      <span className="text-slate-400">Online</span>
                    )}
                  </div>
                </div>
                <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">{city?.name ?? "City room"}</h1>
                <p className="mt-2 text-base text-slate-300">{country?.name ?? "Country"}</p>
                {showBernMapUi ? (
                  <p className="mt-2 text-sm font-medium text-cyan-300">Bern discovery map — Map tab is selected by default</p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link href="/rooms" className="rounded-full bg-white/5 px-3 py-2 text-slate-200 transition hover:bg-white/10">
                Countries
              </Link>
              <Link
                href={`/rooms/${country?.slug ?? countrySlug}`}
                className="rounded-full bg-white/5 px-3 py-2 text-slate-200 transition hover:bg-white/10"
              >
                {country?.name ?? "Country"}
              </Link>
            </div>
          </div>

          {showBernMapUi ? (
            <div className="mt-5 flex w-full gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-1.5">
              <button
                type="button"
                onClick={() => switchRoomView("chat")}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  roomView === "chat"
                    ? "bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <MessageSquare className="h-4 w-4" aria-hidden />
                Chat
              </button>
              <button
                type="button"
                onClick={() => switchRoomView("map")}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  roomView === "map"
                    ? "bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <MapIcon className="h-4 w-4" aria-hidden />
                Map
              </button>
            </div>
          ) : null}
        </section>

        <section className="relative flex min-h-[520px] flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92)_0%,rgba(8,12,24,0.96)_100%)] shadow-2xl shadow-black/30">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.10),transparent_30%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.10),transparent_28%),radial-gradient(circle_at_bottom,rgba(244,114,182,0.06),transparent_30%)]" />
            <div className="absolute -left-16 top-20 h-52 w-52 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="absolute right-[-3rem] top-1/3 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="absolute bottom-[-4rem] left-1/4 h-72 w-72 rounded-full bg-fuchsia-500/5 blur-3xl" />
            <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:28px_28px]" />
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.02),transparent_38%,rgba(255,255,255,0.015)_62%,transparent)]" />
          </div>

          {showBernMapUi && roomView === "map" ? (
            <div className="relative z-20 w-full">
              <BernDiscoveryMap userId={session?.user?.id ?? null} />
            </div>
          ) : (
            <>
          {joinMessage && showJoinMessage ? (
            <div className="relative z-10 px-4 pt-4">
              <div className="mx-auto w-fit rounded-full border border-white/10 bg-slate-950/45 px-4 py-2 text-xs font-medium text-slate-200 shadow-lg shadow-black/20 backdrop-blur-md join-message-fade">
                {joinMessage}
              </div>
            </div>
          ) : null}

          <div
            ref={messagesContainerRef}
            className="relative z-10 flex-1 space-y-4 overflow-y-auto bg-slate-950/15 p-4 pb-32 backdrop-blur-[2px]"
          >
            {loadingRoom || loadingMessages ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/55 p-8 text-center text-slate-300 backdrop-blur-md">
                Loading messages...
              </div>
            ) : error ? (
              <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">{error}</div>
            ) : messages.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/55 p-8 text-center text-slate-300 backdrop-blur-md">
                No messages yet. Be the first to share a spot.
              </div>
            ) : (
              <>
                {messages.map((message, messageIndex) => {
                  const sender = message.profile;
                  const isOwnMessage = message.user_id === session?.user?.id;
                  const isEditing = editingMessageId === message.id;
                  const isConfirmingDelete = pendingDeleteMessageId === message.id;
                  const previousMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;
                  const showDateSeparator = shouldShowChatDateSeparator(
                    previousMessage?.created_at,
                    message.created_at
                  );

                  return (
                    <Fragment key={message.id}>
                      {showDateSeparator ? <ChatDateSeparator createdAt={message.created_at} /> : null}
                      <article className="flex items-start gap-3">
                      <Link href={`/user/${message.user_id}`} className="shrink-0">
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-800 text-sm font-semibold text-white">
                          {sender?.avatar_url ? (
                            <img src={sender.avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            publicProfileUsername(sender?.username).charAt(0).toUpperCase()
                          )}
                        </div>
                      </Link>
                      <div className="min-w-0 max-w-[88%] flex-1 sm:max-w-[82%]">
                        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
                          <Link href={`/user/${message.user_id}`} className="text-sm font-semibold text-cyan-300 hover:text-cyan-200">
                            {publicProfileUsername(sender?.username)}
                          </Link>
                          <span className="text-[11px] text-slate-500">{formatChatMessageTime(message.created_at)}</span>
                          {message.edited_at ? (
                            <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">edited</span>
                          ) : null}
                          {isOwnMessage && !isEditing && !isConfirmingDelete ? (
                            <span className="inline-flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => startEditingMessage(message)}
                                className="inline-flex items-center rounded-md p-0.5 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
                                aria-label="Edit message"
                              >
                                <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                              </button>
                              <button
                                type="button"
                                onClick={() => requestDeleteMessage(message)}
                                className="inline-flex items-center rounded-md p-0.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"
                                aria-label="Delete message"
                              >
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                              </button>
                            </span>
                          ) : null}
                        </div>
                        {isConfirmingDelete ? (
                          <div className="rounded-[26px] border border-red-500/25 bg-slate-900/85 p-4 shadow-lg shadow-black/20 backdrop-blur-xl">
                            <p className="text-sm font-medium text-slate-200">Delete this message?</p>
                            {deleteError ? <p className="mt-2 text-xs text-red-300">{deleteError}</p> : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void confirmDeleteMessage()}
                                disabled={deletingMessage}
                                className="rounded-full bg-red-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {deletingMessage ? "Deleting…" : "Delete"}
                              </button>
                              <button
                                type="button"
                                onClick={cancelDeleteMessage}
                                disabled={deletingMessage}
                                className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : isEditing ? (
                          <div className="rounded-[26px] border border-cyan-400/30 bg-slate-900/80 p-3 shadow-lg shadow-black/20 backdrop-blur-xl">
                            <textarea
                              value={editDraft}
                              onChange={(event) => setEditDraft(event.target.value)}
                              disabled={savingEdit}
                              rows={3}
                              className="w-full resize-none rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-[15px] leading-6 text-white outline-none transition focus:border-cyan-400/50 disabled:opacity-60"
                            />
                            {editError ? <p className="mt-2 text-xs text-red-300">{editError}</p> : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void saveEditedMessage()}
                                disabled={savingEdit || !editDraft.trim()}
                                className="rounded-full bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {savingEdit ? "Saving…" : "Save"}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditingMessage}
                                disabled={savingEdit}
                                className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-[26px] border border-white/10 bg-slate-900/68 px-4 py-3 text-slate-100 shadow-lg shadow-black/20 backdrop-blur-xl">
                            <p className="whitespace-pre-wrap break-words text-[15px] leading-6">{message.content}</p>
                          </div>
                        )}
                      </div>
                      </article>
                    </Fragment>
                  );
                })}
              </>
            )}
          </div>
            </>
          )}
        </section>

        {(!showBernMapUi || roomView === "chat") ? (
        <section className="sticky bottom-4 z-20">
          <form
            ref={emojiPickerRef}
            className="rounded-3xl border border-white/10 bg-slate-900/70 p-3 shadow-2xl shadow-black/30 backdrop-blur-xl"
            onSubmit={handleSend}
          >
            {showEmojiPicker ? (
              <div className="mb-3 rounded-3xl border border-white/10 bg-slate-950/90 p-3 shadow-xl shadow-black/30 backdrop-blur-xl">
                <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => insertEmoji(emoji)}
                      className="flex h-11 w-full items-center justify-center rounded-2xl bg-white/5 text-xl transition hover:bg-white/10"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex items-end gap-3">
              <button
                type="button"
                onClick={() => setShowEmojiPicker((current) => !current)}
                className="shrink-0 rounded-full border border-white/10 bg-slate-950/75 p-4 text-slate-200 transition hover:bg-slate-900/90 hover:text-white"
                aria-label="Open emoji picker"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 fill-none stroke-current stroke-2"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M8.5 10h.01" />
                  <path d="M15.5 10h.01" />
                  <path d="M8 14c1.2 1.5 2.5 2 4 2s2.8-.5 4-2" />
                </svg>
              </button>
              <textarea
                ref={composerTextareaRef}
                name="spotdrop-room-message"
                autoComplete="off"
                value={newMessage}
                onChange={(event) => setNewMessage(event.target.value)}
                disabled={!session?.user?.id}
                placeholder="Send a message..."
                className="min-h-[56px] max-h-36 w-full rounded-[28px] border border-white/10 bg-slate-950/75 px-4 py-4 text-white outline-none transition focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isSendDisabled}
                className="shrink-0 rounded-full bg-cyan-500 px-5 py-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              {sendError ? <p className="text-red-300">{sendError}</p> : <div />}
              {!session?.user?.id ? (
                <Link href="/auth/login" className="font-semibold text-cyan-300 hover:text-cyan-200">
                  Sign in to post
                </Link>
              ) : (
                <p>Your message will be visible to everyone in this city room.</p>
              )}
            </div>
          </form>
        </section>
        ) : null}
      </div>
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
