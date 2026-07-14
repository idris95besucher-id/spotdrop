"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { supabase } from "@/lib/supabaseClient";

function MapDynamicLoader() {
  const { t } = useI18n();
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#050816] text-sm text-slate-400">
      {t("map.loading")}
    </div>
  );
}

const SpotLiveMap = dynamic(() => import("@/components/SpotLiveMap"), {
  ssr: false,
  loading: () => <MapDynamicLoader />,
});

export default function VisitMapPanel() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const focusMarkId = searchParams.get("mark");
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUserId(user?.id ?? null);
      setAuthChecked(true);
    };

    void load();
  }, []);

  if (!authChecked) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#050816] text-sm text-slate-400">
        {t("map.loading")}
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[#050816] p-6 text-center">
        <p className="text-base font-medium text-white">{t("map.error.notLoggedIn")}</p>
        <Link
          href="/auth/login"
          className="inline-flex rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
        >
          {t("auth.signIn")}
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 w-full">
      <SpotLiveMap userId={userId} embedded focusMarkId={focusMarkId} />
    </div>
  );
}
