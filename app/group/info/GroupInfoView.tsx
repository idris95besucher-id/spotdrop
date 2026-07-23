"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, ChevronRight, Crown, Loader2, Pencil, Shield, Users, X } from "lucide-react";
import GroupActionConfirmSheet from "@/components/GroupActionConfirmSheet";
import GroupMemberPicker from "@/components/GroupMemberPicker";
import MobileSecondaryHeader from "@/components/MobileSecondaryHeader";
import ProfileAvatar from "@/components/ProfileAvatar";
import Shell from "@/components/Shell";
import { useAuthSession } from "@/components/AuthSessionProvider";
import { useI18n } from "@/components/I18nProvider";
import { bottomSheetLayout, useBottomSheetScrollLock } from "@/lib/bottomSheetScrollLock";
import { CHATS_INBOX_REFRESH_EVENT } from "@/lib/chatsInbox";
import {
  addGroupMembers,
  deleteGroupChat,
  demoteGroupModerator,
  GROUP_NAME_MAX_LENGTH,
  leaveGroupChat,
  loadGroupChat,
  loadGroupMembers,
  promoteGroupModerator,
  removeGroupMember,
  renameGroupChat,
  transferGroupOwnership,
  updateGroupPhoto,
  type GroupChatDetails,
  type GroupChatMember,
} from "@/lib/groupChats";
import { describeGroupError } from "@/lib/groupChatErrors";
import { groupThreadHref } from "@/lib/groupChatRoutes";
import type { SendSpotRecipient } from "@/lib/sendSpotRecipients";
import { MOBILE_WIDTH_SAFE_CLASS } from "@/lib/mobileLayout";

type MemberActionSheetTarget = {
  member: GroupChatMember;
  canRemove: boolean;
  canPromote: boolean;
  canDemote: boolean;
  canTransfer: boolean;
};

type PendingAction =
  | { kind: "leave" }
  | { kind: "delete" }
  | { kind: "remove"; member: GroupChatMember }
  | { kind: "promote"; member: GroupChatMember }
  | { kind: "demote"; member: GroupChatMember }
  | { kind: "transfer"; member: GroupChatMember };

function MemberActionSheet({
  target,
  onClose,
  onAction,
}: {
  target: MemberActionSheetTarget | null;
  onClose: () => void;
  onAction: (action: PendingAction) => void;
}) {
  const { t } = useI18n();

  useBottomSheetScrollLock(Boolean(target));

  if (!target || typeof document === "undefined") {
    return null;
  }

  const { member, canRemove, canPromote, canDemote, canTransfer } = target;

  return createPortal(
    <div className={bottomSheetLayout.overlay} role="presentation">
      <button type="button" className={bottomSheetLayout.backdrop} aria-label={t("common.close")} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        data-bottom-sheet-panel=""
        className={`${bottomSheetLayout.panel} select-none touch-manipulation`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-2">
          <p className="truncate text-sm font-semibold text-white">@{member.username}</p>
        </div>
        <div className="space-y-1 px-2 pb-4">
          {canPromote ? (
            <button
              type="button"
              onClick={() => onAction({ kind: "promote", member })}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-white transition hover:bg-white/[0.06]"
            >
              <Shield className="h-4 w-4 text-primary" strokeWidth={1.75} aria-hidden />
              {t("group.promoteToModerator")}
            </button>
          ) : null}
          {canDemote ? (
            <button
              type="button"
              onClick={() => onAction({ kind: "demote", member })}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-white transition hover:bg-white/[0.06]"
            >
              <Shield className="h-4 w-4 text-slate-400" strokeWidth={1.75} aria-hidden />
              {t("group.demoteModerator")}
            </button>
          ) : null}
          {canTransfer ? (
            <button
              type="button"
              onClick={() => onAction({ kind: "transfer", member })}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-white transition hover:bg-white/[0.06]"
            >
              <Crown className="h-4 w-4 text-amber-400" strokeWidth={1.75} aria-hidden />
              {t("group.transferOwnership")}
            </button>
          ) : null}
          {canRemove ? (
            <button
              type="button"
              onClick={() => onAction({ kind: "remove", member })}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-red-300 transition hover:bg-red-500/10"
            >
              <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {t("group.removeMember")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="mt-1 flex w-full items-center justify-center rounded-xl px-3 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06]"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function GroupInfoView() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = searchParams.get("id") ?? "";
  const { session } = useAuthSession();
  const currentUserId = session?.user?.id ?? null;

  const [group, setGroup] = useState<GroupChatDetails | null>(null);
  const [members, setMembers] = useState<GroupChatMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [addSelection, setAddSelection] = useState<Map<string, SendSpotRecipient>>(new Map());
  const [addingMembers, setAddingMembers] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [menuTarget, setMenuTarget] = useState<MemberActionSheetTarget | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionWorking, setActionWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    if (!groupId) {
      setError(t("group.error.notFound"));
      setLoading(false);
      return;
    }

    const [groupResult, membersResult] = await Promise.all([loadGroupChat(groupId), loadGroupMembers(groupId)]);

    if (!groupResult.group) {
      setError(groupResult.error ?? t("group.error.notFound"));
      setLoading(false);
      return;
    }

    setGroup(groupResult.group);
    setMembers(membersResult.members);
    setError(membersResult.error ? describeGroupError(membersResult.error, t("group.error.load")) : null);
    setLoading(false);
  }, [groupId, t]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  const currentMember = members.find((member) => member.userId === currentUserId) ?? null;
  const isOwner = currentMember?.role === "owner";
  const isModOrOwner = currentMember?.role === "owner" || currentMember?.role === "moderator";

  const excludeIdsForAdd = useMemo(() => members.map((member) => member.userId), [members]);

  const handleStartRename = () => {
    setNameDraft(group?.name ?? "");
    setNameError(null);
    setIsEditingName(true);
  };

  const handleSaveName = async () => {
    const trimmed = nameDraft.trim();

    if (!trimmed) {
      setNameError(t("group.nameRequired"));
      return;
    }

    setSavingName(true);
    setNameError(null);

    const result = await renameGroupChat(groupId, trimmed);

    setSavingName(false);

    if (result.error) {
      console.error("[group-info] rename_group_chat failed", result.error);
      setNameError(describeGroupError(result.error, t("group.error.generic")));
      return;
    }

    setGroup((current) => (current ? { ...current, name: trimmed } : current));
    setIsEditingName(false);
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  };

  const handlePhotoChange = async (file: File | null) => {
    if (!file) return;

    setUploadingPhoto(true);
    setPhotoError(null);

    const result = await updateGroupPhoto(groupId, file);

    setUploadingPhoto(false);

    if (result.error || !result.url) {
      console.error("[group-info] update_group_photo failed", result.error);
      setPhotoError(describeGroupError(result.error, t("group.error.generic")));
      return;
    }

    setGroup((current) => (current ? { ...current, photoUrl: result.url } : current));
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  };

  const handleConfirmAddMembers = async () => {
    const memberIds = Array.from(addSelection.keys());

    if (memberIds.length === 0) {
      setIsAddingMembers(false);
      return;
    }

    setAddingMembers(true);
    setAddError(null);

    const result = await addGroupMembers(groupId, memberIds);

    setAddingMembers(false);

    if (result.error) {
      console.error("[group-info] add_group_members failed", result.error);
      setAddError(describeGroupError(result.error, t("group.error.generic")));
      return;
    }

    setAddSelection(new Map());
    setIsAddingMembers(false);
    await reload();
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  };

  const memberActionTarget = (member: GroupChatMember): MemberActionSheetTarget => ({
    member,
    canRemove: isModOrOwner && member.role !== "owner" && (member.role !== "moderator" || isOwner),
    canPromote: isOwner && member.role === "member",
    canDemote: isOwner && member.role === "moderator",
    canTransfer: isOwner && member.userId !== currentUserId,
  });

  const runPendingAction = async () => {
    if (!pendingAction) return;

    setActionWorking(true);
    setActionError(null);

    let result: { error: string | null } = { error: null };

    if (pendingAction.kind === "leave") {
      result = await leaveGroupChat(groupId);
    } else if (pendingAction.kind === "delete") {
      result = await deleteGroupChat(groupId);
    } else if (pendingAction.kind === "remove") {
      result = await removeGroupMember(groupId, pendingAction.member.userId);
    } else if (pendingAction.kind === "promote") {
      result = await promoteGroupModerator(groupId, pendingAction.member.userId);
    } else if (pendingAction.kind === "demote") {
      result = await demoteGroupModerator(groupId, pendingAction.member.userId);
    } else if (pendingAction.kind === "transfer") {
      result = await transferGroupOwnership(groupId, pendingAction.member.userId);
    }

    setActionWorking(false);

    if (result.error) {
      console.error(`[group-info] ${pendingAction.kind} action failed`, result.error);
      setActionError(describeGroupError(result.error, t("group.error.generic")));
      return;
    }

    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
    setPendingAction(null);

    if (pendingAction.kind === "leave" || pendingAction.kind === "delete") {
      router.replace("/chats");
      return;
    }

    await reload();
  };

  if (isAddingMembers) {
    return (
      <Shell chatThread>
        <div className="absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-[#050816] text-white">
          <MobileSecondaryHeader
            title={t("group.addMembers")}
            onBack={() => setIsAddingMembers(false)}
            trailing={
              <button
                type="button"
                disabled={addSelection.size === 0 || addingMembers}
                onClick={() => void handleConfirmAddMembers()}
                className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-[#050816] transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                {addingMembers ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : t("group.addMembersAction")}
              </button>
            }
          />
          <GroupMemberPicker
            userId={currentUserId ?? ""}
            excludeUserIds={excludeIdsForAdd}
            selected={addSelection}
            onChange={setAddSelection}
            searchPlaceholder={t("newMessage.searchPlaceholder")}
          />
          {addError ? <p className="shrink-0 px-4 pb-3 text-sm text-red-300">{addError}</p> : null}
        </div>
      </Shell>
    );
  }

  return (
    <Shell showHeader={false} flushTop>
      <div className={`mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col ${MOBILE_WIDTH_SAFE_CLASS}`}>
        <MobileSecondaryHeader title={t("group.chatInfo")} backHref={groupThreadHref(groupId)} preferFallback />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-12 text-center text-sm text-muted">{t("common.loading")}</div>
          ) : error ? (
            <div className="mx-4 my-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">
              {error}
            </div>
          ) : (
            <>
              <section className="flex flex-col items-center gap-3 px-4 py-6">
                <label
                  className={`group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/[0.06] ${
                    isModOrOwner ? "cursor-pointer" : ""
                  }`}
                >
                  {group?.photoUrl ? (
                    <img src={group.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Users className="h-9 w-9 text-primary" strokeWidth={1.5} aria-hidden />
                  )}
                  {isModOrOwner ? (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(event) => void handlePhotoChange(event.target.files?.[0] ?? null)}
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-transparent transition group-hover:bg-black/40 group-hover:text-white">
                        {uploadingPhoto ? (
                          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                        ) : (
                          <Camera className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                        )}
                      </span>
                    </>
                  ) : null}
                </label>
                {photoError ? <p className="text-xs text-red-300">{photoError}</p> : null}

                {isEditingName ? (
                  <div className="w-full max-w-xs space-y-2">
                    <input
                      type="text"
                      autoFocus
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value.slice(0, GROUP_NAME_MAX_LENGTH))}
                      maxLength={GROUP_NAME_MAX_LENGTH}
                      className="w-full rounded-xl border border-white/15 bg-[#0d1322] px-3 py-2 text-center text-base font-semibold text-white outline-none focus:border-primary/50"
                    />
                    {nameError ? <p className="text-center text-xs text-red-300">{nameError}</p> : null}
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditingName(false)}
                        disabled={savingName}
                        className="rounded-full px-4 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveName()}
                        disabled={savingName}
                        className="inline-flex min-w-[4.5rem] items-center justify-center rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-[#050816] transition disabled:opacity-50"
                      >
                        {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : t("group.renameSave")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={isModOrOwner ? handleStartRename : undefined}
                    disabled={!isModOrOwner}
                    className="flex items-center gap-1.5 text-lg font-bold text-white disabled:cursor-default"
                  >
                    <span className="truncate">{group?.name}</span>
                    {isModOrOwner ? <Pencil className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} aria-hidden /> : null}
                  </button>
                )}

                <p className="text-sm text-muted">
                  {members.length === 1
                    ? t("group.membersCountOne")
                    : t("group.membersCountMany", { count: members.length })}
                </p>
              </section>

              <section className="border-t border-white/[0.06] px-4 py-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("group.members")}</h2>
                  {isModOrOwner ? (
                    <button
                      type="button"
                      onClick={() => setIsAddingMembers(true)}
                      className="text-xs font-semibold text-primary"
                    >
                      {t("group.addMembers")}
                    </button>
                  ) : null}
                </div>
              </section>

              <ul className="divide-y divide-white/[0.06] px-2 pb-6">
                {members.map((member) => {
                  const isSelf = member.userId === currentUserId;
                  const target = memberActionTarget(member);
                  const canOpenMenu = target.canRemove || target.canPromote || target.canDemote || target.canTransfer;

                  return (
                    <li key={member.id}>
                      <button
                        type="button"
                        onClick={canOpenMenu ? () => setMenuTarget(target) : undefined}
                        disabled={!canOpenMenu}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-white/[0.04] disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <ProfileAvatar
                          src={member.avatarUrl}
                          sizeClassName="h-10 w-10"
                          iconClassName="h-4 w-4"
                          className="border border-white/10"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">
                            @{member.username} {isSelf ? <span className="text-slate-500">({t("group.you")})</span> : null}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {member.role === "owner"
                              ? t("group.role.owner")
                              : member.role === "moderator"
                                ? t("group.role.moderator")
                                : t("group.role.member")}
                          </p>
                        </div>
                        {canOpenMenu ? (
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={1.75} aria-hidden />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <section className="space-y-1 border-t border-white/[0.06] px-2 py-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={() => setPendingAction({ kind: "leave" })}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-red-300 transition hover:bg-red-500/10"
                >
                  {t("group.leaveGroup")}
                </button>
                {isOwner ? (
                  <button
                    type="button"
                    onClick={() => setPendingAction({ kind: "delete" })}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-red-400 transition hover:bg-red-500/10"
                  >
                    {t("group.deleteGroup")}
                  </button>
                ) : null}
              </section>
            </>
          )}
        </div>
      </div>

      <MemberActionSheet
        target={menuTarget}
        onClose={() => setMenuTarget(null)}
        onAction={(action) => {
          setMenuTarget(null);
          setActionError(null);
          setPendingAction(action);
        }}
      />

      <GroupActionConfirmSheet
        isOpen={pendingAction?.kind === "leave"}
        title={t("group.leaveConfirmTitle")}
        body={t("group.leaveConfirmBody")}
        confirmLabel={t("group.leaveConfirmAction")}
        destructive
        working={actionWorking}
        error={actionError}
        onClose={() => (actionWorking ? undefined : setPendingAction(null))}
        onConfirm={() => void runPendingAction()}
      />

      <GroupActionConfirmSheet
        isOpen={pendingAction?.kind === "delete"}
        title={t("group.deleteConfirmTitle")}
        body={t("group.deleteConfirmBody")}
        confirmLabel={t("group.deleteConfirmAction")}
        destructive
        working={actionWorking}
        error={actionError}
        onClose={() => (actionWorking ? undefined : setPendingAction(null))}
        onConfirm={() => void runPendingAction()}
      />

      <GroupActionConfirmSheet
        isOpen={pendingAction?.kind === "remove"}
        title={t("group.removeMemberConfirmTitle")}
        body={
          pendingAction?.kind === "remove"
            ? t("group.removeMemberConfirmBody", { name: `@${pendingAction.member.username}` })
            : ""
        }
        confirmLabel={t("group.removeMemberConfirmAction")}
        destructive
        working={actionWorking}
        error={actionError}
        onClose={() => (actionWorking ? undefined : setPendingAction(null))}
        onConfirm={() => void runPendingAction()}
      />

      <GroupActionConfirmSheet
        isOpen={pendingAction?.kind === "transfer"}
        title={t("group.transferOwnershipConfirmTitle")}
        body={
          pendingAction?.kind === "transfer"
            ? t("group.transferOwnershipConfirmBody", { name: `@${pendingAction.member.username}` })
            : ""
        }
        confirmLabel={t("group.transferOwnershipConfirmAction")}
        working={actionWorking}
        error={actionError}
        onClose={() => (actionWorking ? undefined : setPendingAction(null))}
        onConfirm={() => void runPendingAction()}
      />

      <GroupActionConfirmSheet
        isOpen={pendingAction?.kind === "promote"}
        title={t("group.promoteToModerator")}
        body={
          pendingAction?.kind === "promote"
            ? t("group.system.promoted", { actor: t("common.you"), targets: `@${pendingAction.member.username}` })
            : ""
        }
        confirmLabel={t("group.promoteToModerator")}
        working={actionWorking}
        error={actionError}
        onClose={() => (actionWorking ? undefined : setPendingAction(null))}
        onConfirm={() => void runPendingAction()}
      />

      <GroupActionConfirmSheet
        isOpen={pendingAction?.kind === "demote"}
        title={t("group.demoteModerator")}
        body={
          pendingAction?.kind === "demote"
            ? t("group.system.demoted", { actor: t("common.you"), targets: `@${pendingAction.member.username}` })
            : ""
        }
        confirmLabel={t("group.demoteModerator")}
        destructive
        working={actionWorking}
        error={actionError}
        onClose={() => (actionWorking ? undefined : setPendingAction(null))}
        onConfirm={() => void runPendingAction()}
      />
    </Shell>
  );
}
