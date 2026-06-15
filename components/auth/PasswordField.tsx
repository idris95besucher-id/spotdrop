"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { authInputClass, authLabelClass } from "@/components/auth/authStyles";

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  hint?: string;
};

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete = "current-password",
  hint,
}: PasswordFieldProps) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  return (
    <label htmlFor={id} className={authLabelClass}>
      {label}
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          className={`${authInputClass} pr-12`}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 transition hover:text-white"
          aria-label={visible ? t("common.hidePassword") : t("common.showPassword")}
        >
          {visible ? <EyeOff className="h-5 w-5" strokeWidth={1.75} aria-hidden /> : <Eye className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
        </button>
      </div>
      {hint ? <span className="mt-1.5 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
