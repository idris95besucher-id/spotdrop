"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { UserRound } from "lucide-react";
import ChatDateSeparator from "@/components/ChatDateSeparator";
import Shell from "@/components/Shell";
import { getSafeAuthSession } from "@/lib/authSession";
import { formatChatMessageTime, shouldShowChatDateSeparator } from "@/lib/chatDates";
import { publicProfileUsername } from "@/lib/publicProfile";
import { supabase } from "@/lib/supabaseClient";

type PartnerProfile = {
  id: string;
  username: string;
  avatar_url?: string | null;
};

type DirectMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
};

export default function DirectMessagePage() {
  const params = useParams<{ userId: string }>();
  const partnerId = params.userId;

  const [session, setSession] = useState<Session | null>(null);
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const currentUserId = session?.user?.id ?? null;
  const isSelfConversation = Boolean(currentUserId && partnerId && currentUserId === partnerId);

  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    void getSafeAuthSession().then((result) => {
      setSession(result.session);
      if (result.error) {
        setError(result.error);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadConversation = async () => {
      if (!partnerId) {
        setLoading(false);
        setError("Invalid conversation.");
        return;
      }

      setLoading(true);
      setError(null);
      setSendError(null);

      if (currentUserId && partnerId === currentUserId) {
        setError("You cannot message yourself.");
        setPartner(null);
        setMessages([]);
        setLoading(false);
        return;
      }

      const { data: partnerRow, error: partnerError } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .eq("id", partnerId)
        .maybeSingle();

      if (partnerError) {
        console.error("Failed to load DM partner:", JSON.stringify(partnerError, null, 2));
        setError(partnerError.message || "Unable to load conversation.");
        setPartner(null);
        setMessages([]);
        setLoading(false);
        return;
      }

      if (!partnerRow) {
        setError("User not found.");
        setPartner(null);
        setMessages([]);
        setLoading(false);
        return;
      }

      setPartner(partnerRow as PartnerProfile);

      if (!currentUserId) {
        setMessages([]);
        setLoading(false);
        return;
      }

      const { data: messageRows, error: messagesError } = await supabase
        .from("direct_messages")
        .select("id, sender_id, recipient_id, body, created_at")
        .or(
          `and(sender_id.eq.${currentUserId},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${currentUserId})`
        )
        .order("created_at", { ascending: true });

      if (messagesError) {
        console.error("Failed to load direct messages:", JSON.stringify(messagesError, null, 2));
        setError(messagesError.message || "Unable to load messages.");
        setMessages([]);
      } else {
        setMessages((messageRows ?? []) as DirectMessage[]);
      }

      setLoading(false);
    };

    void loadConversation();
  }, [partnerId, currentUserId]);

  useEffect(() => {
    if (!loading && messages.length > 0) {
      scrollToBottom();
    }
  }, [loading, messages, scrollToBottom]);

  useEffect(() => {
    if (!currentUserId || !partnerId || isSelfConversation) {
      return;
    }

    const channel = supabase
      .channel(`direct_messages_${currentUserId}_${partnerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
        },
        (payload) => {
          const incoming = payload.new as DirectMessage;
          const isThreadMessage =
            (incoming.sender_id === currentUserId && incoming.recipient_id === partnerId) ||
            (incoming.sender_id === partnerId && incoming.recipient_id === currentUserId);

          if (!isThreadMessage) {
            return;
          }

          setMessages((current) => {
            if (current.some((message) => message.id === incoming.id)) {
              return current;
            }

            return [...current, incoming].sort(
              (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
            );
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, isSelfConversation, partnerId]);

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSendError(null);

    const trimmed = draft.trim();

    if (!trimmed || !currentUserId || !partnerId) {
      return;
    }

    if (currentUserId === partnerId) {
      setSendError("You cannot message yourself.");
      return;
    }

    setSending(true);
    const createdAt = new Date().toISOString();

    const { data: inserted, error: insertError } = await supabase
      .from("direct_messages")
      .insert({
        sender_id: currentUserId,
        recipient_id: partnerId,
        body: trimmed,
        created_at: createdAt,
      })
      .select("id, sender_id, recipient_id, body, created_at")
      .single();

    setSending(false);

    if (insertError) {
      console.error("Failed to send direct message:", JSON.stringify(insertError, null, 2));
      setSendError(insertError.message || "Unable to send message.");
      return;
    }

    if (inserted) {
      setMessages((current) => {
        if (current.some((message) => message.id === inserted.id)) {
          return current;
        }

        return [...current, inserted as DirectMessage];
      });
    }

    setDraft("");
    requestAnimationFrame(scrollToBottom);
  };

  const isSendDisabled = sending || !draft.trim() || !currentUserId || isSelfConversation;

  return (
    <Shell>
      <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-4">
        <section className="rounded-3xl border border-white/10 bg-slate-900/90 p-4 shadow-xl shadow-black/20 sm:p-5">
          <div className="flex items-center gap-3">
            <Link
              href="/chats"
              className="text-sm font-medium text-slate-400 transition hover:text-cyan-300"
            >
              ← Chats
            </Link>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800">
              {partner?.avatar_url ? (
                <img src={partner.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-5 w-5 text-slate-400" strokeWidth={1.5} aria-hidden />
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/90">Direct message</p>
              <h1 className="text-xl font-semibold text-white">
                {partner ? publicProfileUsername(partner.username) : "Chat"}
              </h1>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/40 shadow-xl shadow-black/20">
          <div
            ref={messagesContainerRef}
            className="flex-1 space-y-3 overflow-y-auto p-4 pb-28"
          >
            {!currentUserId && !loading ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/55 p-6 text-center text-sm text-slate-300">
                <Link href="/auth/login" className="font-semibold text-cyan-300 hover:text-cyan-200">
                  Sign in
                </Link>{" "}
                to send messages.
              </div>
            ) : isSelfConversation ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/55 p-6 text-center text-sm text-slate-300">
                You cannot message yourself.
              </div>
            ) : loading ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/55 p-6 text-center text-sm text-slate-300">
                Loading messages…
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">{error}</div>
            ) : messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/55 p-6 text-center text-sm text-slate-300">
                No messages yet. Say hello.
              </div>
            ) : (
              messages.map((message, messageIndex) => {
                const isOwnMessage = message.sender_id === currentUserId;
                const previousMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;
                const showDateSeparator = shouldShowChatDateSeparator(
                  previousMessage?.created_at,
                  message.created_at
                );

                return (
                  <Fragment key={message.id}>
                    {showDateSeparator ? <ChatDateSeparator createdAt={message.created_at} /> : null}
                    <div className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-[22px] px-4 py-2.5 shadow-md shadow-black/20 ${
                          isOwnMessage
                            ? "rounded-br-md bg-cyan-500/20 text-cyan-50"
                            : "rounded-bl-md border border-white/10 bg-slate-900/85 text-slate-100"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words text-[15px] leading-6">{message.body}</p>
                        <p
                          className={`mt-1 text-[10px] ${isOwnMessage ? "text-cyan-200/70" : "text-slate-500"}`}
                        >
                          {formatChatMessageTime(message.created_at)}
                        </p>
                      </div>
                    </div>
                  </Fragment>
                );
              })
            )}
          </div>

          <form
            onSubmit={(event) => void handleSend(event)}
            className="sticky bottom-0 border-t border-white/10 bg-slate-900/80 p-3 backdrop-blur-xl"
          >
            <div className="flex items-end gap-2">
              <textarea
                name="spotdrop-dm-message"
                autoComplete="off"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={!currentUserId || isSelfConversation}
                placeholder={isSelfConversation ? "You cannot message yourself." : "Message…"}
                rows={1}
                className="min-h-[48px] max-h-32 w-full resize-none rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isSendDisabled}
                className="shrink-0 rounded-2xl bg-cyan-400 px-4 py-3 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? "…" : "Send"}
              </button>
            </div>
            {sendError ? <p className="mt-2 text-xs text-red-300">{sendError}</p> : null}
          </form>
        </section>
      </div>
    </Shell>
  );
}
