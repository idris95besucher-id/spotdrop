"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CollectionPage from "./[collectionId]/CollectionView";

function CollectionPageContent() {
  const searchParams = useSearchParams();
  const collectionId = searchParams.get("id") ?? "";
  return <CollectionPage collectionIdOverride={collectionId} />;
}

export default function CollectionsPage() {
  return (
    <Suspense>
      <CollectionPageContent />
    </Suspense>
  );
}
