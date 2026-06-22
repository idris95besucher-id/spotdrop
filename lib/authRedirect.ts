import { getSafeAuthSession } from "@/lib/authSession";
import { ensureProfileRow } from "@/lib/profile";

/**
 * Return the `returnTo` search parameter from the current page URL, if it
 * contains a safe same-site relative path (starts with `/`, not `//`).
 * Rejects any value that could be an external URL to prevent open-redirect.
 */
function consumeReturnTo(): string | null {
  if (typeof window === "undefined") return null;

  const raw = new URLSearchParams(window.location.search).get("returnTo");

  if (!raw) return null;

  // Accept only relative paths that start with a single slash.
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }

  return null;
}

export async function completeAuthRedirect(router: { push: (path: string) => void }) {
  const { session, error: sessionError } = await getSafeAuthSession();

  if (sessionError) {
    return { error: sessionError };
  }

  if (!session?.user?.id) {
    return { error: "Unable to sign in. Please try again." };
  }

  const ensuredProfile = await ensureProfileRow({ user: session.user });

  if (ensuredProfile.error && !ensuredProfile.needsOnboarding) {
    return { error: ensuredProfile.error };
  }

  if (!ensuredProfile.profile?.username) {
    router.push("/onboarding");
    return { error: null };
  }

  // Honor returnTo from expired-session redirect, fall back to /profile.
  const returnTo = consumeReturnTo();
  router.push(returnTo ?? "/profile");

  return { error: null };
}
