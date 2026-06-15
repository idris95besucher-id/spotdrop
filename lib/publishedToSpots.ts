/** Posts that belong on the public Spots explore feed (/feed) and map discovery. */
export function isExplorePublishedSpot(post: {
  content_kind?: string | null;
  visibility?: string | null;
  published_to_spots?: boolean | null;
}) {
  return (
    post.content_kind === "spot" &&
    post.visibility === "public" &&
    post.published_to_spots === true
  );
}
