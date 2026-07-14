"use client";

import { useEffect, useState } from "react";
import {
  loadPeopleSearchCatalog,
  type PeopleSearchCatalog,
} from "@/lib/peopleSearch";

const EMPTY_CATALOG: PeopleSearchCatalog = {
  countries: [],
  cities: [],
  profiles: [],
};

export function usePeopleSearchCatalog() {
  const [catalog, setCatalog] = useState<PeopleSearchCatalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void loadPeopleSearchCatalog().then((result) => {
      if (!active) {
        return;
      }

      setCatalog(result.catalog);
      setError(result.error);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  return { catalog, loading, error };
}
