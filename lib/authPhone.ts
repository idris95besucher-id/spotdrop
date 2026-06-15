import {
  INVALID_OTP_MESSAGE,
  mapAuthError,
  PHONE_LOGIN_UNAVAILABLE_MESSAGE,
  PHONE_RECOVERY_UNAVAILABLE_MESSAGE,
} from "@/lib/authMessages";
import { supabase } from "@/lib/supabaseClient";

export function normalizePhoneE164(raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  let normalized = trimmed.replace(/[\s()-]/g, "");

  if (normalized.startsWith("00")) {
    normalized = `+${normalized.slice(2)}`;
  }

  if (!normalized.startsWith("+")) {
    return null;
  }

  const digits = normalized.slice(1);

  if (!/^\d{7,15}$/.test(digits)) {
    return null;
  }

  return `+${digits}`;
}

export function isPhoneAuthUnavailable(error: unknown) {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof (error as { message?: string })?.message === "string"
        ? (error as { message: string }).message.toLowerCase()
        : "";

  return (
    message.includes("phone provider") ||
    message.includes("phone auth") ||
    message.includes("sms provider") ||
    message.includes("otp disabled") ||
    message.includes("phone signups") ||
    message.includes("unsupported phone") ||
    message.includes("phone login is not available") ||
    (message.includes("phone") && message.includes("not enabled"))
  );
}

export function mapPhoneAuthError(error: unknown, fallback = "Unable to continue with phone. Please try again.") {
  if (isPhoneAuthUnavailable(error)) {
    return PHONE_LOGIN_UNAVAILABLE_MESSAGE;
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof (error as { message?: string })?.message === "string"
        ? (error as { message: string }).message.toLowerCase()
        : "";

  if (
    message.includes("invalid otp") ||
    message.includes("token has expired") ||
    message.includes("otp_expired") ||
    message.includes("invalid verification") ||
    message.includes("invalid code")
  ) {
    return INVALID_OTP_MESSAGE;
  }

  return mapAuthError(error, fallback);
}

export function mapPhoneRecoveryError(
  error: unknown,
  fallback = "Unable to continue with phone recovery. Please try again."
) {
  if (isPhoneAuthUnavailable(error)) {
    return PHONE_RECOVERY_UNAVAILABLE_MESSAGE;
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof (error as { message?: string })?.message === "string"
        ? (error as { message: string }).message.toLowerCase()
        : "";

  if (
    message.includes("invalid otp") ||
    message.includes("token has expired") ||
    message.includes("otp_expired") ||
    message.includes("invalid verification") ||
    message.includes("invalid code")
  ) {
    return INVALID_OTP_MESSAGE;
  }

  return mapAuthError(error, fallback);
}

export async function sendPhoneOtp(
  phone: string,
  options?: { username?: string; isRegister?: boolean }
) {
  const e164 = normalizePhoneE164(phone);

  if (!e164) {
    return { error: "Enter a valid phone number with country code, e.g. +41 79 123 45 67." };
  }

  const { error } = await supabase.auth.signInWithOtp({
    phone: e164,
    options: {
      shouldCreateUser: options?.isRegister ?? false,
      data: options?.username ? { username: options.username } : undefined,
    },
  });

  if (error) {
    return { error: mapPhoneAuthError(error), phone: e164 };
  }

  return { error: null, phone: e164 };
}

export async function verifyPhoneOtp(phone: string, token: string) {
  const e164 = normalizePhoneE164(phone);

  if (!e164) {
    return { session: null, error: "Enter a valid phone number with country code." };
  }

  const code = token.trim();

  if (!/^\d{4,8}$/.test(code)) {
    return { session: null, error: INVALID_OTP_MESSAGE };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    phone: e164,
    token: code,
    type: "sms",
  });

  if (error) {
    return { session: null, error: mapPhoneAuthError(error) };
  }

  return { session: data.session, error: null };
}

export async function sendPhoneRecoveryOtp(phone: string) {
  const e164 = normalizePhoneE164(phone);

  if (!e164) {
    return { error: "Enter a valid phone number with country code, e.g. +41 79 123 45 67." };
  }

  const { error } = await supabase.auth.signInWithOtp({
    phone: e164,
    options: { shouldCreateUser: false },
  });

  if (error) {
    return { error: mapPhoneRecoveryError(error), phone: e164 };
  }

  return { error: null, phone: e164 };
}

export async function verifyPhoneRecoveryOtp(phone: string, token: string) {
  const e164 = normalizePhoneE164(phone);

  if (!e164) {
    return { session: null, error: "Enter a valid phone number with country code." };
  }

  const code = token.trim();

  if (!/^\d{4,8}$/.test(code)) {
    return { session: null, error: INVALID_OTP_MESSAGE };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    phone: e164,
    token: code,
    type: "sms",
  });

  if (error) {
    return { session: null, error: mapPhoneRecoveryError(error) };
  }

  return { session: data.session, error: null };
}
