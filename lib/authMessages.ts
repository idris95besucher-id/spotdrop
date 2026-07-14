export const INVALID_CREDENTIALS_MESSAGE = "Email or password is incorrect.";
export const SESSION_EXPIRED_MESSAGE = "Session expired. Please log in again.";
export const AUTH_CONNECTION_ERROR_MESSAGE = "Connection problem. Please try again.";
export const SAME_PASSWORD_MESSAGE =
  "Please choose a new password different from the old one.";
export const PASSWORD_MISMATCH_MESSAGE = "Passwords do not match.";
export const PASSWORD_TOO_SHORT_MESSAGE = "Password must be at least 8 characters.";
export const RESET_LINK_INVALID_MESSAGE =
  "This reset link is invalid or expired. Please request a new password reset email.";
export const RESET_EMAIL_SENT_MESSAGE =
  "We sent a secure link to your email. Open it to create a new password.";
export const PASSWORD_UPDATED_SUCCESS_MESSAGE =
  "Your password has been updated. You can now log in.";

const INTENTIONAL_SIGNOUT_KEY = "spotdrop_intentional_signout";

function errorText(error: unknown) {
  if (typeof error === "string") {
    return error.toLowerCase();
  }

  if (error instanceof Error) {
    return error.message.toLowerCase();
  }

  const maybe = error as { message?: unknown };

  return typeof maybe?.message === "string" ? maybe.message.toLowerCase() : "";
}

/** Stale refresh token / revoked session — not wrong password on the login form. */
export function isStaleSessionError(error: unknown) {
  const message = errorText(error);

  if (!message) {
    return false;
  }

  return (
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found") ||
    message.includes("jwt expired") ||
    message.includes("session not found") ||
    message.includes("user not found") ||
    message.includes("user_not_found") ||
    message.includes("user from sub claim") ||
    message.includes("sub claim in jwt does not exist") ||
    message.includes("token is invalid") ||
    message.includes("invalid claim") ||
    message.includes("refresh_token") ||
    message.includes("session has expired")
  );
}

/** Account deleted / removed while a local session still exists. */
export function isDeletedAccountError(error: unknown) {
  const message = errorText(error);

  return (
    message.includes("user from sub claim") ||
    message.includes("sub claim in jwt does not exist") ||
    message.includes("user_not_found") ||
    (message.includes("user not found") && message.includes("jwt"))
  );
}

export function isInvalidCredentialsError(error: unknown) {
  const message = errorText(error);

  return (
    message.includes("invalid login credentials") ||
    message.includes("invalid email or password") ||
    message.includes("invalid credentials")
  );
}

export function isSamePasswordError(error: unknown) {
  const message = errorText(error);

  return (
    message.includes("different from the old") ||
    message.includes("same as the old") ||
    message.includes("should be different") ||
    message.includes("reuse") ||
    message.includes("same password")
  );
}

export function shouldLogAuthError(error: unknown) {
  return !isStaleSessionError(error) && !isInvalidCredentialsError(error);
}

export function mapAuthError(error: unknown, fallback = AUTH_CONNECTION_ERROR_MESSAGE) {
  if (error instanceof Error && error.message === "Load failed") {
    return AUTH_CONNECTION_ERROR_MESSAGE;
  }

  if (isInvalidCredentialsError(error)) {
    return INVALID_CREDENTIALS_MESSAGE;
  }

  if (isStaleSessionError(error)) {
    return SESSION_EXPIRED_MESSAGE;
  }

  if (isSamePasswordError(error)) {
    return SAME_PASSWORD_MESSAGE;
  }

  const message = errorText(error);

  if (message.includes("email not confirmed")) {
    return "Confirm your email before signing in. Check your inbox for the confirmation link.";
  }

  if (message.includes("user already registered") || message.includes("already been registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }

  if (message.includes("password should be at least") || message.includes("weak password")) {
    return PASSWORD_TOO_SHORT_MESSAGE;
  }

  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  if (message.includes("invalid email")) {
    return "Enter a valid email address.";
  }

  if (message.includes("signup is disabled")) {
    return "Registration is temporarily unavailable. Please try again later.";
  }

  if (
    message.includes("resolve_login_email") ||
    (message.includes("function") && message.includes("does not exist"))
  ) {
    return "Sign in with your email address for now.";
  }

  return fallback;
}

export function markIntentionalSignOut() {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.setItem(INTENTIONAL_SIGNOUT_KEY, "1");
}

export function consumeIntentionalSignOut() {
  if (typeof window === "undefined") {
    return false;
  }

  const value = sessionStorage.getItem(INTENTIONAL_SIGNOUT_KEY) === "1";

  if (value) {
    sessionStorage.removeItem(INTENTIONAL_SIGNOUT_KEY);
  }

  return value;
}
