"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { Plus, SquarePen, FolderOpen, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import SpotDropSpotsIcon from "@/components/icons/SpotDropSpotsIcon";
import CreateSpotForm from "@/components/CreateSpotForm";
import CreatePostForm from "@/components/CreatePostForm";
import SpotDraftsProvider, { useSpotDrafts } from "@/components/SpotDraftsProvider";
import { getSafeAuthSession } from "@/lib/authSession";
import { dispatchProfileContentRefresh } from "@/lib/profileContentRefresh";
import { supabase } from "@/lib/supabaseClient";

type CreateFlow = "spot" | "post" | null;

type CreateMenuContextValue = {
  openCreateMenu: () => void;
};

const CreateMenuContext = createContext<CreateMenuContextValue | null>(null);

export function useCreateMenu() {
  const context = useContext(CreateMenuContext);

  if (!context) {
    throw new Error("useCreateMenu must be used within CreateMenuProvider");
  }

  return context;
}

function CreateMenuSheet({
  onClose,
  onSelect,
  draftCount,
  onOpenDrafts,
}: {
  onClose: () => void;
  onSelect: (flow: Exclude<CreateFlow, null>) => void;
  draftCount: number;
  onOpenDrafts: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const draftDescription =
    draftCount > 0
      ? draftCount === 1
        ? t("menu.spotDraftsDescOne")
        : t("menu.spotDraftsDescMany", { count: draftCount })
      : t("menu.spotDraftsDescEmpty");

  const options = [
    {
      id: "spot" as const,
      label: t("create.spot"),
      description: t("create.spotDesc"),
      icon: SpotDropSpotsIcon,
      iconClass: "text-cyan-300",
    },
    {
      id: "post" as const,
      label: t("create.post"),
      description: t("create.postDesc"),
      icon: SquarePen,
      iconClass: "text-white",
    },
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label={t("create.closeMenu")}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-menu-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-t-3xl border border-white/10 bg-[#0B1026] shadow-2xl shadow-black/50 sm:rounded-3xl"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 id="create-menu-title" className="text-base font-semibold text-white">
            {t("create.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-1 p-2">
          {options.map((option) => {
            const Icon = option.icon;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onSelect(option.id)}
                className="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left transition hover:bg-white/5 active:bg-white/10"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5">
                  <Icon className={`h-5 w-5 ${option.iconClass}`} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">{option.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">
                    {option.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-white/10 p-2">
          <button
            type="button"
            onClick={() => {
              onOpenDrafts();
              onClose();
            }}
            className="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left transition hover:bg-white/5 active:bg-white/10"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5">
              <FolderOpen className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-white">{t("create.drafts")}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">{draftDescription}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

type CreateMenuProviderInnerProps = {
  children: ReactNode;
  onCreateFlowOpenChange: (open: boolean) => void;
  registerEditDraftHandler: (handler: (draftId: string) => void) => void;
};

function CreateMenuProviderInner({
  children,
  onCreateFlowOpenChange,
  registerEditDraftHandler,
}: CreateMenuProviderInnerProps) {
  const router = useRouter();
  const { refreshDrafts, openDraftSheet, drafts } = useSpotDrafts();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFlow, setActiveFlow] = useState<CreateFlow>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    onCreateFlowOpenChange(activeFlow !== null);
  }, [activeFlow, onCreateFlowOpenChange]);

  const handleEditDraft = useCallback((draftId: string) => {
    setEditingDraftId(draftId);
    setMenuOpen(false);
    setActiveFlow("spot");
  }, []);

  useEffect(() => {
    registerEditDraftHandler(handleEditDraft);
  }, [handleEditDraft, registerEditDraftHandler]);

  useEffect(() => {
    let active = true;

    void getSafeAuthSession().then((result) => {
      if (active) {
        setSession(result.session);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const closeAll = useCallback(() => {
    setMenuOpen(false);
    setActiveFlow(null);
    setEditingDraftId(null);
  }, []);

  const openCreateMenu = useCallback(async () => {
    let activeSession = session;

    if (!activeSession?.user) {
      const result = await getSafeAuthSession();

      if (result.session) {
        setSession(result.session);
        activeSession = result.session;
      }
    }

    if (!activeSession?.user) {
      router.push("/auth/login");
      return;
    }

    setEditingDraftId(null);
    setActiveFlow(null);
    setMenuOpen(true);
  }, [router, session]);

  const handleSelectFlow = useCallback((flow: Exclude<CreateFlow, null>) => {
    setEditingDraftId(null);
    setMenuOpen(false);
    setActiveFlow(flow);
  }, []);

  const handleContentCreated = useCallback(() => {
    dispatchProfileContentRefresh();
    closeAll();
    void refreshDrafts();
  }, [closeAll, refreshDrafts]);

  const handleDraftChanged = useCallback(() => {
    void refreshDrafts();
  }, [refreshDrafts]);

  const userId = session?.user?.id;

  return (
    <CreateMenuContext.Provider value={{ openCreateMenu }}>
      {children}

      {menuOpen ? (
        <CreateMenuSheet
          onClose={closeAll}
          onSelect={handleSelectFlow}
          draftCount={drafts.length}
          onOpenDrafts={openDraftSheet}
        />
      ) : null}

      {activeFlow === "spot" && userId ? (
        <CreateSpotForm
          userId={userId}
          isOpen
          draftId={editingDraftId}
          onClose={closeAll}
          onCreated={handleContentCreated}
          onDraftChanged={handleDraftChanged}
        />
      ) : null}

      {activeFlow === "post" && userId ? (
        <CreatePostForm
          userId={userId}
          isOpen
          onClose={closeAll}
          onCreated={handleContentCreated}
        />
      ) : null}
    </CreateMenuContext.Provider>
  );
}

export default function CreateMenuProvider({ children }: { children: ReactNode }) {
  const editDraftHandlerRef = useRef<(draftId: string) => void>(() => {});

  const registerEditDraftHandler = useCallback((handler: (draftId: string) => void) => {
    editDraftHandlerRef.current = handler;
  }, []);

  return (
    <SpotDraftsProvider onEditDraft={(draftId) => editDraftHandlerRef.current(draftId)}>
      <CreateMenuProviderInner
        onCreateFlowOpenChange={() => {}}
        registerEditDraftHandler={registerEditDraftHandler}
      >
        {children}
      </CreateMenuProviderInner>
    </SpotDraftsProvider>
  );
}

export function CreateNavButton({ className = "" }: { className?: string }) {
  const { openCreateMenu } = useCreateMenu();
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={openCreateMenu}
      className={`group flex select-none touch-manipulation flex-col items-center justify-center gap-1 px-1 py-2 ${className}`}
      aria-label={t("nav.create")}
    >
      <span className="pointer-events-none relative -top-2 flex h-[3.25rem] w-[3.25rem] select-none items-center justify-center rounded-full bg-primary text-[#050816] shadow-lg shadow-primary/25 ring-4 ring-[#0B1026] transition group-active:scale-95">
        <Plus className="pointer-events-none h-7 w-7 select-none" strokeWidth={2.5} aria-hidden />
      </span>
    </button>
  );
}
