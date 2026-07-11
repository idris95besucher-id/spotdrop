"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthShell from "@/components/auth/AuthShell";
import EmailLoginForm from "@/components/auth/EmailLoginForm";
import { useI18n } from "@/components/I18nProvider";
import { consumeAuthNotice } from "@/lib/authSession";
import { localizeUserMessage } from "@/lib/i18n/localizeUserMessage";

export default function LoginPage() {
  const { t } = useI18n();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const authNotice = consumeAuthNotice();

    if (authNotice) {
      setNotice(authNotice);
    }
  }, []);

  return (
    <AuthShell
      title={t("auth.logIn")}
      footer={
        <>
          {t("auth.noAccount")}{" "}
          <Link href="/auth/register" className="font-semibold text-white hover:underline">
            {t("auth.createAccount")}
          </Link>
        </>
      }
    >
      {notice ? (
        <p className="mb-4 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {localizeUserMessage(t, notice) ?? notice}
        </p>
      ) : null}

      <EmailLoginForm />
    </AuthShell>
  );
}
