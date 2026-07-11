"use client";

import { useRouter } from "next/navigation";
import PostCommentsSection from "@/components/PostCommentsSection";

type SpotCommentsSheetProps = {
  postId: string | null;
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
  /** Render above fullscreen overlays (e.g. gallery viewer at z-200). */
  elevated?: boolean;
  initialCommentCount?: number;
  skipInitialCountFetch?: boolean;
};

export default function SpotCommentsSheet({
  postId,
  userId,
  isOpen,
  onClose,
  onCountChange,
  elevated = false,
  initialCommentCount,
  skipInitialCountFetch = false,
}: SpotCommentsSheetProps) {
  const router = useRouter();

  if (!postId) {
    return null;
  }

  return (
    <PostCommentsSection
      postId={postId}
      userId={userId}
      mode="drawer"
      drawerOpen={isOpen}
      onDrawerClose={onClose}
      onCountChange={onCountChange}
      onRequireAuth={() => router.push("/auth/login")}
      elevatedOverlay={elevated}
      initialCommentCount={initialCommentCount}
      skipInitialCountFetch={skipInitialCountFetch}
    />
  );
}
