"use client";

import Link from "next/link";
import { authPrimaryButtonClass, authSecondaryButtonClass } from "@/components/auth/authStyles";
import { useI18n } from "@/components/I18nProvider";
import Shell from "@/components/Shell";

export default function Home() {
  const { t } = useI18n();

  return (
    <Shell showHeader={false}>
      <div className="h-[100dvh] min-h-[100dvh] w-full overflow-hidden">
        <section className="flex h-full min-h-full w-full items-center justify-center rounded-3xl border border-primary/10 bg-card px-6 py-12 shadow-2xl shadow-black/40 sm:px-8">
          <div className="flex w-full max-w-[420px] flex-col items-center">
            <div className="mb-10 text-center">
              <p className="text-3xl font-bold tracking-tight text-white">
                Spot<span className="text-primary">Drop</span>
              </p>
            </div>

            <div className="w-full text-center">
              <h1 className="text-xl font-semibold leading-snug text-white sm:text-2xl">{t("home.continueTitle")}</h1>
            </div>

            <div className="mt-10 flex w-full flex-col gap-3">
              <Link href="/auth/login" className={`${authPrimaryButtonClass} text-center`}>
                {t("home.login")}
              </Link>
              <Link href="/auth/register" className={`${authSecondaryButtonClass} text-center`}>
                {t("home.register")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </Shell>
  );
}
