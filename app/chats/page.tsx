"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import Shell from "@/components/Shell";
import { getSafeAuthSession } from "@/lib/authSession";
import { publicProfileUsername } from "@/lib/publicProfile";
import { supabase } from "@/lib/supabaseClient";

type DirectMessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
};

type PartnerProfile = {
  id: string;
  username: string;
  avatar_url?: string | null;
};

type ChatConversation = {
  partnerId: string;
  username: string;
  avatarUrl: string | null;
  lastPreview: string;
  lastAt: string;
};

function formatChatTime(createdAt: string) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function truncatePreview(text: string, max = 100) {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }

  return `${trimmed.slice(0, max - 1)}…`;
}

function buildConversations(rows: DirectMessageRow[], userId: string): Map<string, { lastAt: string; preview: string }> {
  const latestByPartner = new Map<string, { lastAt: string; preview: string }>();

  for (const row of rows) {
    const partnerId = row.sender_id === userId ? row.recipient_id : row.sender_id;
    if (!partnerId || partnerId === userId) {
      continue;
    }

    if (!latestByPartner.has(partnerId)) {
      latestByPartner.set(partnerId, {
        lastAt: row.created_at,
        preview: truncatePreview(row.body),
      });
    }
  }

  return latestByPartner;
}

export default function ChatsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingChats, setLoadingChats] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    const loadChats = async () => {
      const userId = session?.user?.id;

      if (!userId) {
        setConversations([]);
        setLoadingChats(false);
        setError(null);
        return;
      }

      setLoadingChats(true);
      setError(null);

      const { data: messageRows, error: messagesError } = await supabase
        .from("direct_messages")
        .select("id, sender_id, recipient_id, body, created_at")
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(500);

      if (messagesError) {
        console.error("Failed to load direct messages:", messagesError);
        setError(messagesError.message);
        setConversations([]);
        setLoadingChats(false);
        return;
      }

      const rows = (messageRows ?? []) as DirectMessageRow[];
      const latestByPartner = buildConversations(rows, userId);
      const partnerIds = [...latestByPartner.keys()];

      if (partnerIds.length === 0) {
        setConversations([]);
        setLoadingChats(false);
        return;
      }

      const { data: profileRows, error: profilesError } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", partnerIds);

      if (profilesError) {
        console.error("Failed to load chat partner profiles:", profilesError);
        setError(profilesError.message);
        setConversations([]);
        setLoadingChats(false);
        return;
      }

      const profilesById = new Map((profileRows as PartnerProfile[] | null)?.map((p) => [p.id, p]) ?? []);

      const list: ChatConversation[] = partnerIds
        .map((partnerId) => {
          const meta = latestByPartner.get(partnerId)!;
          const profile = profilesById.get(partnerId);

          return {
            partnerId,
            username: publicProfileUsername(profile?.username),
            avatarUrl: profile?.avatar_url ?? null,
            lastPreview: meta.preview,
            lastAt: meta.lastAt,
          };
        })
        .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());

      setConversations(list);
      setLoadingChats(false);
    };

    void loadChats();
  }, [session?.user?.id]);

  return (
    <Shell>
      <div className="mx-auto space-y-6 rounded-3xl border border-white/10 bg-slate-900/90 p-4 shadow-xl shadow-black/40 sm:space-y-8 sm:p-8 sm:max-w-5xl">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300">Messages</p>
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">My Chats</h1>
          <p className="text-sm text-slate-400">Direct conversations with people you’ve messaged.</p>
        </header>

        {loadingSession ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-8 text-center text-sm text-slate-400">Loading…</div>
        ) : !session?.user ? (
          <div className="space-y-6 rounded-3xl border border-white/10 bg-slate-950 p-6 sm:p-8">
            <p className="text-slate-300">Sign in to see your direct message chats.</p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/auth/login"
                className="inline-flex rounded-3xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Sign in
              </Link>
              <Link
                href="/search"
                className="inline-flex rounded-3xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Search people
              </Link>
            </div>
          </div>
        ) : loadingChats ? (
          <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-8 text-center text-sm text-slate-400">Loading chats…</div>
        ) : error ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">{error}</div>
        ) : conversations.length === 0 ? (
          <div className="space-y-6 rounded-3xl border border-dashed border-slate-700 bg-slate-950 p-8 text-center">
            <p className="text-lg font-medium text-white">No chats yet</p>
            <p className="text-sm text-slate-400">Find people on Search and open their profile to send a direct message.</p>
            <Link
              href="/search"
              className="inline-flex min-w-[180px] items-center justify-center rounded-3xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Go to Search
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {conversations.map((chat) => (
              <li key={chat.partnerId}>
                <Link
                  href={`/dm/${chat.partnerId}`}
                  className="flex items-center gap-4 rounded-3xl border border-white/10 bg-slate-950 p-4 transition hover:border-cyan-300/40 hover:bg-slate-900 sm:p-5"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-800 text-lg font-semibold text-white sm:h-14 sm:w-14 sm:rounded-3xl">
                    {chat.avatarUrl ? (
                      <img src={chat.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      chat.username.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-semibold text-white">{chat.username}</p>
                      <time className="shrink-0 text-xs text-slate-500">{formatChatTime(chat.lastAt)}</time>
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-400">{chat.lastPreview}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}
