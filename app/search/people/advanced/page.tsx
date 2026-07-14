"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy advanced route → combined filters search. */
export default function SearchPeopleAdvancedRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/search/people/filters");
  }, [router]);

  return null;
}
