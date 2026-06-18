"use client";

import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import EmailRecoveryForm from "@/components/auth/EmailRecoveryForm";
import { useI18n } from "@/components/I18nProvider";

export default function ForgotPasswordPage() {
  const { t } = useI18n();

  return (
    <AuthShell
      title={t("auth.resetTitle")}
      subtitle={t("auth.resetSubtitleEmail")}
      footer={
        <Link href="/auth/login" className="font-semibold text-white hover:underline">
          {t("auth.backToLogin")}
        </Link>
      }
    >
      <EmailRecoveryForm />
    </AuthShell>
  );
}
