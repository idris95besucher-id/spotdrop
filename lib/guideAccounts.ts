/** Usernames ending in `_guide` or common typo `_quide`. */
const GUIDE_ACCOUNT_USERNAME_PATTERN = /_(guide|quide)$/i;

const KNOWN_GUIDE_USERNAMES = new Set([
  "bern_guide",
  "swiss_guide",
  "cyprus_guide",
  "bern_quide",
  "swiss_quide",
  "spot_guide",
  "official_ai_guide",
  "ai_guide",
]);

/** Legacy display names (e.g. "Official AI Guide", "Bern Guide"). */
const GUIDE_ACCOUNT_NAME_PATTERN =
  /official\s+(ai\s+)?(swiss\s+|bern\s+)?guide|^(bern|swiss|cyprus)\s+guide$/i;

export function isGuideAccountUsername(username: string | null | undefined): boolean {
  if (typeof username !== "string") {
    return false;
  }

  const trimmed = username.trim();
  if (!trimmed) {
    return false;
  }

  if (KNOWN_GUIDE_USERNAMES.has(trimmed.toLowerCase())) {
    return true;
  }

  return GUIDE_ACCOUNT_USERNAME_PATTERN.test(trimmed);
}

export function isGuideAccountName(name: string | null | undefined): boolean {
  if (typeof name !== "string") {
    return false;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 && GUIDE_ACCOUNT_NAME_PATTERN.test(trimmed);
}

export function isGuideAccountProfile(
  profile: { username?: string | null; name?: string | null } | null | undefined
): boolean {
  if (!profile) {
    return false;
  }

  return isGuideAccountUsername(profile.username) || isGuideAccountName(profile.name);
}

export function excludeGuideProfiles<T extends { username?: string | null; name?: string | null }>(
  profiles: T[]
): T[] {
  return profiles.filter((profile) => !isGuideAccountProfile(profile));
}
