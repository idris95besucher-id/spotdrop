"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Camera, Check, ChevronLeft, Loader2, Users, X } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import { useAuthSession } from "@/components/AuthSessionProvider";
import { useI18n } from "@/components/I18nProvider";
import GroupMemberPicker from "@/components/GroupMemberPicker";
import Shell from "@/components/Shell";
import { describeGroupError } from "@/lib/groupChatErrors";
import { createGroupChat, GROUP_NAME_MAX_LENGTH } from "@/lib/groupChats";
import { groupThreadHref } from "@/lib/groupChatRoutes";
import { dmThreadHref } from "@/lib/chatThreadRoutes";
import { MOBILE_SAFE_AREA_INSET_TOP } from "@/lib/mobileLayout";
import { navigateBack } from "@/lib/navigateBack";
import type { SendSpotRecipient } from "@/lib/sendSpotRecipients";

type WizardStep = "search" | "group-picker" | "group-setup";

function WizardHeader({
  title,
  onBack,
  backLabel,
  trailing,
}: {
  title: string;
  onBack: () => void;
  backLabel: string;
  trailing?: React.ReactNode;
}) {
  return (
    <header
      className={`relative z-[80] flex shrink-0 items-center gap-1 border-b border-white/[0.08] bg-[#050816] px-2 pb-2.5 ${MOBILE_SAFE_AREA_INSET_TOP} sm:px-3`}
    >
      <button
        type="button"
        onClick={onBack}
        aria-label={backLabel}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 active:scale-95"
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-white">{title}</h1>
      {trailing}
    </header>
  );
}

export default function NewMessageView() {
  const { t } = useI18n();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? null;

  const [step, setStep] = useState<WizardStep>("search");
  const [selected, setSelected] = useState<Map<string, SendSpotRecipient>>(new Map());
  const [groupName, setGroupName] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const selectedList = useMemo(() => Array.from(selected.values()), [selected]);

  const handleDirectMessageSelect = (recipient: SendSpotRecipient) => {
    router.push(dmThreadHref(recipient.id));
  };

  const handlePhotoChange = (file: File | null) => {
    setPhotoFile(file);

    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }

    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleCreateGroup = async () => {
    if (!userId || creating) {
      return;
    }

    const trimmedName = groupName.trim();

    if (!trimmedName) {
      setCreateError(t("group.nameRequired"));
      return;
    }

    if (selectedList.length === 0) {
      setCreateError(t("group.needAtLeastOneMember"));
      return;
    }

    setCreating(true);
    setCreateError(null);

    const result = await createGroupChat({
      name: trimmedName,
      memberIds: selectedList.map((recipient) => recipient.id),
      photoFile,
    });

    setCreating(false);

    if (!result.groupId) {
      // Intentionally show the real Supabase/Postgres error here (not the sanitized
      // localizeUserMessage helper) — see lib/groupChatErrors.ts. The full error is
      // also console.error'd from lib/groupChats.ts with message/code/details/hint.
      console.error("[new-message] create_group_chat failed", result.error);
      setCreateError(describeGroupError(result.error, t("group.createFailed")));
      return;
    }

    router.replace(groupThreadHref(result.groupId));
  };

  if (!userId) {
    return (
      <Shell chatThread>
        <div className="absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-[#050816] text-white">
          <WizardHeader
            title={t("newMessage.title")}
            backLabel={t("common.back")}
            onBack={() => navigateBack(router, "/chats", { preferFallback: true })}
          />
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted">
            {t("chats.signInPrompt")}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell chatThread>
      <div className="absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-[#050816] text-white">
        {step === "search" ? (
          <>
            <WizardHeader
              title={t("newMessage.title")}
              backLabel={t("common.close")}
              onBack={() => navigateBack(router, "/chats", { preferFallback: true })}
            />

            <div className="flex min-h-0 flex-1 flex-col">
              <button
                type="button"
                onClick={() => setStep("group-picker")}
                className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3.5 text-left transition hover:bg-white/[0.03]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Users className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{t("newMessage.groupChat")}</p>
                  <p className="truncate text-xs text-muted">{t("newMessage.groupChatHint")}</p>
                </div>
              </button>

              <GroupMemberPicker
                userId={userId}
                selected={new Map()}
                onChange={() => {}}
                onSelectSingle={handleDirectMessageSelect}
                searchPlaceholder={t("newMessage.searchPlaceholder")}
                hideChips
              />
            </div>
          </>
        ) : step === "group-picker" ? (
          <>
            <WizardHeader
              title={t("group.selectMembers")}
              backLabel={t("common.back")}
              onBack={() => setStep("search")}
            />

            <div className="flex min-h-0 flex-1 flex-col">
              <p className="shrink-0 px-4 pt-3 text-xs text-muted">{t("group.selectMembersHint")}</p>
              <GroupMemberPicker
                userId={userId}
                selected={selected}
                onChange={setSelected}
                searchPlaceholder={t("newMessage.searchPlaceholder")}
              />
              <div className="shrink-0 border-t border-white/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  disabled={selectedList.length === 0}
                  onClick={() => setStep("group-setup")}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-[#050816] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {selectedList.length > 0
                    ? t("group.selectedCount", { count: selectedList.length })
                    : t("group.next")}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <WizardHeader
              title={t("group.setupTitle")}
              backLabel={t("common.back")}
              onBack={() => setStep("group-picker")}
              trailing={
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void handleCreateGroup()}
                  className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-[#050816] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {creating ? t("group.creating") : t("group.create")}
                </button>
              }
            />

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
              <div className="flex flex-col items-center gap-3">
                <label className="group relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.06]">
                  {photoPreview ? (
                    <img src={photoPreview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Camera className="h-7 w-7 text-slate-400" strokeWidth={1.5} aria-hidden />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => handlePhotoChange(event.target.files?.[0] ?? null)}
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-[11px] font-medium text-transparent transition group-hover:bg-black/40 group-hover:text-white">
                    {photoPreview ? t("group.changePhoto") : t("group.addPhoto")}
                  </span>
                </label>
                {photoPreview ? (
                  <button
                    type="button"
                    onClick={() => handlePhotoChange(null)}
                    className="inline-flex items-center gap-1 text-xs text-slate-400 transition hover:text-white"
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    {t("common.delete")}
                  </button>
                ) : null}
              </div>

              <label className="mt-6 block">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">{t("group.nameLabel")}</span>
                <input
                  type="text"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value.slice(0, GROUP_NAME_MAX_LENGTH))}
                  placeholder={t("group.namePlaceholder")}
                  maxLength={GROUP_NAME_MAX_LENGTH}
                  className="w-full rounded-2xl border border-white/10 bg-[#0d1322] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-primary/45"
                />
              </label>

              <div className="mt-6">
                <p className="mb-2 text-xs font-medium text-slate-400">
                  {t("group.membersCountMany", { count: selectedList.length + 1 })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-200">
                    <Check className="h-3 w-3 text-primary" strokeWidth={2.5} aria-hidden />
                    {t("group.you")}
                  </span>
                  {selectedList.map((recipient) => (
                    <span
                      key={recipient.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-200"
                    >
                      <ProfileAvatar
                        src={recipient.avatar_url}
                        sizeClassName="h-4 w-4"
                        iconClassName="h-2.5 w-2.5"
                        iconStrokeWidth={2}
                        className="bg-slate-800"
                      />
                      @{recipient.username}
                    </span>
                  ))}
                </div>
              </div>

              {createError ? <p className="mt-4 text-sm text-red-300">{createError}</p> : null}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
