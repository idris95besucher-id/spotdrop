"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy age-only route → combined filters search. */
export default function SearchPeopleAgeRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/search/people/filters");
  }, [router]);

  return null;
}
