"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { normalizePostId } from "@/lib/postIds";

type PostMediaLinkProps = {
  postId: unknown;
  children: ReactNode;
  className?: string;
};

export default function PostMediaLink({ postId, children, className }: PostMediaLinkProps) {
  const id = normalizePostId(postId);

  if (!id) {
    console.warn("PostMediaLink skipped: missing post.id", { postId });
    return <div className={className}>{children}</div>;
  }

  const href = `/posts/${encodeURIComponent(id)}`;

  const handleClick = () => {
    console.log("clicked post.id:", id);
  };

  return (
    <Link href={href} className={className} scroll onClick={handleClick}>
      {children}
    </Link>
  );
}
