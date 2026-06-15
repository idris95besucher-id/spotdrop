import type { StoryRow } from "@/lib/stories";

export const STORY_IMAGE_DURATION_MS = 5000;

export function filterActiveStories(stories: StoryRow[]) {
  const now = Date.now();

  return stories.filter((story) => {
    const expiresAt = new Date(story.expires_at).getTime();

    return Number.isFinite(expiresAt) && expiresAt > now;
  });
}

export function sortStoriesForViewer(stories: StoryRow[]) {
  return filterActiveStories(stories).sort(
    (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  );
}
