export function logSpotMediaFirstPhotoAdded(detail?: Record<string, unknown>) {
  console.log("[Spot media] first photo added", detail ?? "");
}

export function logSpotMediaAddVideoSelected(detail?: Record<string, unknown>) {
  console.log("[Spot media] add video selected", detail ?? "");
}

export function logSpotMediaAddPhotoSelected(detail?: Record<string, unknown>) {
  console.log("[Spot media] add photo selected", detail ?? "");
}

export function logSpotMediaItemsCount(count: number, detail?: Record<string, unknown>) {
  console.log("[Spot media] mediaItems count", count, detail ?? "");
}

export function logSpotMediaSharePreviewItems(
  items: Array<{ id: string; mediaType: string; previewUrl: string }>
) {
  console.log("[Spot media] share preview items", items);
}

export function logSpotPublishMediaItemsPayload(
  items: Array<{ mediaType: string; fileSize: number; fileName: string }>
) {
  console.log("[Spot publish] mediaItems payload", items);
}

export function logSpotPublishUploadedMediaItems(
  items: Array<{ mediaType: string; mediaUrl: string; sortOrder: number }>
) {
  console.log("[Spot publish] uploaded media items", items);
}

export function logSpotPublishPostMediaItemsInsertResult(result: {
  ok: boolean;
  error?: string | null;
  itemCount?: number;
}) {
  console.log("[Spot publish] post_media_items insert result", result);
}
