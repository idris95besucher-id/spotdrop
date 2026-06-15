export function normalizeProfileUsername(username: string) {
  return username.trim().toLowerCase().replace(/^@/, "");
}

export function buildProfileSharePath(username: string) {
  const handle = normalizeProfileUsername(username);

  if (!handle) {
    return "/users/spotdrop";
  }

  return `/users/${encodeURIComponent(handle)}`;
}

export function buildProfileShareUrl(username: string, origin?: string) {
  const path = buildProfileSharePath(username);
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");

  return base ? `${base}${path}` : path;
}

export function formatProfileShareHandle(username: string) {
  const handle = normalizeProfileUsername(username);

  return handle ? `@${handle}` : "@spotdrop";
}
