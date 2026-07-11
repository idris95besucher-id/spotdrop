"use client";

import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import EmailRegisterForm from "@/components/auth/EmailRegisterForm";
import { useI18n } from "@/components/I18nProvider";

export default function RegisterPage() {
  const { t } = useI18n();

  return (
    <AuthShell
      title={t("auth.createAccount")}
      footer={
        <>
          {t("auth.hasAccount")}{" "}
          <Link href="/auth/login" className="font-semibold text-white hover:underline">
            {t("auth.logIn")}
          </Link>
        </>
      }
    >
      <EmailRegisterForm />
    </AuthShell>
  );
}
