"use client";

import { useI18n } from "@/components/I18nProvider";

export type AuthMethod = "email" | "phone";

type AuthMethodTabsProps = {
  value: AuthMethod;
  onChange: (method: AuthMethod) => void;
};

export default function AuthMethodTabs({ value, onChange }: AuthMethodTabsProps) {
  const { t } = useI18n();

  const methods: { id: AuthMethod; label: string }[] = [
    { id: "email", label: t("auth.methodEmail") },
    { id: "phone", label: t("auth.methodPhone") },
  ];

  return (
    <div className="grid w-full min-w-0 max-w-full grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
      {methods.map((method) => (
        <button
          key={method.id}
          type="button"
          onClick={() => onChange(method.id)}
          className={`rounded-lg py-2.5 text-sm font-semibold transition ${
            value === method.id ? "bg-white text-black shadow-sm" : "text-slate-400 hover:text-white"
          }`}
        >
          {method.label}
        </button>
      ))}
    </div>
  );
}
