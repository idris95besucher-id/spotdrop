"use client";

import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import { useI18n } from "@/components/I18nProvider";
import { authPrimaryButtonClass, authSecondaryButtonClass } from "@/components/auth/authStyles";

export default function AuthPage() {
  const { t } = useI18n();

  return (
    <AuthShell subtitle={t("auth.tagline")}>
      <div className="space-y-3">
        <Link href="/auth/login" className={`${authPrimaryButtonClass} block text-center no-underline`}>
          {t("auth.logIn")}
        </Link>
        <Link href="/auth/register" className={`${authSecondaryButtonClass} block text-center no-underline`}>
          {t("auth.createAccount")}
        </Link>
      </div>
    </AuthShell>
  );
}
