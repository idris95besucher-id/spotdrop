"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { markIntentionalSignOut } from "@/lib/authMessages";
import { unregisterPushBeforeSignOut } from "@/lib/nativePush";
import { supabase } from "@/lib/supabaseClient";

type SignOutButtonProps = {
  className?: string;
};

export default function SignOutButton({ className = "" }: SignOutButtonProps) {
  const router = useRouter();
  const { t } = useI18n();

  const handleSignOut = async () => {
    markIntentionalSignOut();

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    if (userId) {
      await unregisterPushBeforeSignOut(userId);
    }

    await supabase.auth.signOut();
    router.replace("/auth/login");
  };

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      className={
        className ||
        "inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-slate-300 transition hover:border-red-500/25 hover:bg-red-500/10 hover:text-red-200"
      }
    >
      <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
      {t("auth.signOut")}
    </button>
  );
}
