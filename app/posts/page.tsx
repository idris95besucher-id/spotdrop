"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PostDetailPage from "./[postId]/PostDetailView";

function PostPageContent() {
  const searchParams = useSearchParams();
  const postId = searchParams.get("id") ?? "";
  return <PostDetailPage postIdOverride={postId} />;
}

export default function PostPage() {
  return (
    <Suspense>
      <PostPageContent />
    </Suspense>
  );
}
