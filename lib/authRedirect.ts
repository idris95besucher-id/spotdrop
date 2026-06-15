import { getSafeAuthSession } from "@/lib/authSession";
import { ensureProfileRow } from "@/lib/profile";

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
  } else {
    router.push("/profile");
  }

  return { error: null };
}
