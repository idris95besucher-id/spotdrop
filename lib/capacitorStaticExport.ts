/** Placeholder paths for Capacitor `output: "export"` — real routes render client-side. */
const PLACEHOLDER = "_";

export function placeholderParams(names: string[]) {
  return [Object.fromEntries(names.map((name) => [name, PLACEHOLDER]))];
}

export const collectionStaticParams = () => placeholderParams(["collectionId"]);
export const postStaticParams = () => placeholderParams(["postId"]);
export const dmUserStaticParams = () => placeholderParams(["userId"]);
export const profileUserStaticParams = () => placeholderParams(["userId"]);
export const publicUserStaticParams = () => placeholderParams(["userId"]);
export const usernameStaticParams = () => placeholderParams(["username"]);
export const countryStaticParams = () => placeholderParams(["country"]);
export const cityStaticParams = () => placeholderParams(["country", "city"]);
export const channelStaticParams = () => placeholderParams(["country", "city", "channelSlug"]);
