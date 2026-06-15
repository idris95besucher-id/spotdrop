"use client";

import { useRouter } from "next/navigation";
import PostCommentsSection from "@/components/PostCommentsSection";

type SpotCommentsSheetProps = {
  postId: string | null;
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
};

export default function SpotCommentsSheet({
  postId,
  userId,
  isOpen,
  onClose,
  onCountChange,
}: SpotCommentsSheetProps) {
  const router = useRouter();

  if (!isOpen || !postId) {
    return null;
  }

  return (
    <PostCommentsSection
      postId={postId}
      userId={userId}
      mode="drawer"
      drawerOpen
      onDrawerClose={onClose}
      onCountChange={onCountChange}
      onRequireAuth={() => router.push("/auth/login")}
    />
  );
}
