"use client";

import Link from "next/link";
import { useState } from "react";
import AuthShell from "@/components/auth/AuthShell";
import AuthMethodTabs, { type AuthMethod } from "@/components/auth/AuthMethodTabs";
import EmailRecoveryForm from "@/components/auth/EmailRecoveryForm";
import PhoneRecoveryForm from "@/components/auth/PhoneRecoveryForm";
import { useI18n } from "@/components/I18nProvider";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [method, setMethod] = useState<AuthMethod>("email");

  return (
    <AuthShell
      title={t("auth.resetTitle")}
      subtitle={method === "email" ? t("auth.resetSubtitleEmail") : t("auth.resetSubtitlePhone")}
      footer={
        <Link href="/auth/login" className="font-semibold text-white hover:underline">
          {t("auth.backToLogin")}
        </Link>
      }
    >
      <AuthMethodTabs value={method} onChange={setMethod} />

      <div className="mt-6">
        {method === "email" ? <EmailRecoveryForm /> : <PhoneRecoveryForm />}
      </div>
    </AuthShell>
  );
}
