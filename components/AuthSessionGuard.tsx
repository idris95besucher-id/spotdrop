"use client";

import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import type { ReactNode } from "react";

type AuthSessionGuardProps = {
  children: ReactNode;
};

/** @deprecated Use AuthSessionProvider directly. Kept for AppProviders wiring. */
export default function AuthSessionGuard({ children }: AuthSessionGuardProps) {
  return <AuthSessionProvider>{children}</AuthSessionProvider>;
}
