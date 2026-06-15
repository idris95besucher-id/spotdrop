"use client";

import Link from "next/link";
import { useState } from "react";
import AuthShell from "@/components/auth/AuthShell";
import AuthMethodTabs, { type AuthMethod } from "@/components/auth/AuthMethodTabs";
import EmailRegisterForm from "@/components/auth/EmailRegisterForm";
import PhoneAuthForm from "@/components/auth/PhoneAuthForm";
import { useI18n } from "@/components/I18nProvider";

export default function RegisterPage() {
  const { t } = useI18n();
  const [method, setMethod] = useState<AuthMethod>("email");

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
      <AuthMethodTabs value={method} onChange={setMethod} />

      <div className="mt-6">
        {method === "email" ? <EmailRegisterForm /> : <PhoneAuthForm mode="register" />}
      </div>
    </AuthShell>
  );
}
