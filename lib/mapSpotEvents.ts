export const MAP_SPOT_PUBLISHED_EVENT = "spotdrop:map-spot-published";

export type MapSpotPublishedDetail = {
  postId: string;
};

export function dispatchMapSpotPublished(postId: string) {
  if (typeof window === "undefined" || !postId) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<MapSpotPublishedDetail>(MAP_SPOT_PUBLISHED_EVENT, {
      detail: { postId },
    })
  );
}
