const EMAIL_LIKE_USERNAME = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export const PUBLIC_PROFILE_FALLBACK = "User";

export function isEmailLikeValue(value: unknown): boolean {
  return typeof value === "string" && EMAIL_LIKE_USERNAME.test(value.trim());
}

/** Public-facing label from profiles.username — never returns an email. */
export function publicProfileUsername(username: string | null | undefined): string {
  const trimmed = typeof username === "string" ? username.trim() : "";

  if (!trimmed || isEmailLikeValue(trimmed)) {
    return PUBLIC_PROFILE_FALLBACK;
  }

  return trimmed;
}

export function sanitizePublicProfile<T extends { username?: string | null }>(profile: T): T & { username: string } {
  return {
    ...profile,
    username: publicProfileUsername(profile.username),
  };
}

export function sanitizePublicProfiles<T extends { username?: string | null }>(profiles: T[]): Array<T & { username: string }> {
  return profiles.map(sanitizePublicProfile);
}
