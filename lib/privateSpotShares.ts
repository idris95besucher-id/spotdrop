import { ensureConversationForOutgoingMessage, touchConversationUpdatedAt } from "@/lib/directConversations";
import { CHATS_INBOX_REFRESH_EVENT } from "@/lib/chatsInbox";
import {
  logCheckSpotReceiverCoords,
  requestCheckSpotGpsReading,
  validateCheckSpotCoordinates,
  type CheckSpotGpsReading,
} from "@/lib/checkSpotGps";
import { calculateCheckSpotDistanceKm } from "@/lib/privateSpotDistance";
import { supabase } from "@/lib/supabaseClient";

export type PrivateSpotShareStatus = "pending" | "accepted" | "declined";

export type DirectMessageType = "text" | "spot_share_request" | "spot_share_accepted";

export type PrivateSpotShare = {
  id: string;
  sender_id: string;
  recipient_id: string;
  sender_latitude?: number | null;
  sender_longitude?: number | null;
  sender_address?: string | null;
  sender_location_accuracy?: number | null;
  sender_location_captured_at?: string | null;
  receiver_latitude?: number | null;
  receiver_longitude?: number | null;
  receiver_location_accuracy?: number | null;
  receiver_location_captured_at?: string | null;
  distance_km?: number | null;
  status: PrivateSpotShareStatus;
  accepted_at?: string | null;
  created_at: string;
};

const SHARE_SELECT =
  "id, sender_id, recipient_id, sender_latitude, sender_longitude, sender_address, sender_location_accuracy, sender_location_captured_at, receiver_latitude, receiver_longitude, receiver_location_accuracy, receiver_location_captured_at, distance_km, status, accepted_at, created_at";

function isMissingPrivateSpotSharesTable(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (message.includes("private_spot_shares") && message.includes("does not exist"))
  );
}

export function formatPrivateSpotShareError(error: { code?: string; message?: string } | null) {
  if (!error?.message) {
    return "Unable to send CheckSpot. Please try again.";
  }

  const message = error.message;
  const lower = message.toLowerCase();

  if (isMissingPrivateSpotSharesTable(error)) {
    return "CheckSpot is not enabled on the server. Run database/setup-private-spot-sharing.sql in the Supabase SQL editor.";
  }

  if (lower.includes("distance_km") || lower.includes("sender_location_accuracy")) {
    return "CheckSpot needs a schema update. Run database/add-checkspot-distance.sql in Supabase.";
  }

  if (lower.includes("message_type") || (error.code === "42703" && lower.includes("direct_messages"))) {
    return "Direct messages need a schema update. Run database/setup-private-spot-sharing.sql in Supabase.";
  }

  if (lower.includes("spot_share_id")) {
    return "Direct messages need spot_share_id. Run database/setup-private-spot-sharing.sql in Supabase.";
  }

  if (lower.includes("row-level security") || lower.includes("policy")) {
    return "Permission denied for CheckSpot. Run database/setup-private-spot-sharing.sql in Supabase (RLS section).";
  }

  if (lower.includes("direct_messages_body_check") || lower.includes("violates check constraint")) {
    return "Message format not supported yet. Run database/setup-private-spot-sharing.sql in Supabase.";
  }

  return message;
}

function mapShareRow(row: Record<string, unknown>): PrivateSpotShare {
  return {
    id: String(row.id),
    sender_id: String(row.sender_id),
    recipient_id: String(row.recipient_id),
    sender_latitude: row.sender_latitude != null ? Number(row.sender_latitude) : null,
    sender_longitude: row.sender_longitude != null ? Number(row.sender_longitude) : null,
    sender_address: (row.sender_address as string | null) ?? null,
    sender_location_accuracy:
      row.sender_location_accuracy != null ? Number(row.sender_location_accuracy) : null,
    sender_location_captured_at: row.sender_location_captured_at
      ? String(row.sender_location_captured_at)
      : null,
    receiver_latitude: row.receiver_latitude != null ? Number(row.receiver_latitude) : null,
    receiver_longitude: row.receiver_longitude != null ? Number(row.receiver_longitude) : null,
    receiver_location_accuracy:
      row.receiver_location_accuracy != null ? Number(row.receiver_location_accuracy) : null,
    receiver_location_captured_at: row.receiver_location_captured_at
      ? String(row.receiver_location_captured_at)
      : null,
    distance_km: row.distance_km != null ? Number(row.distance_km) : null,
    status: row.status as PrivateSpotShareStatus,
    accepted_at: row.accepted_at ? String(row.accepted_at) : null,
    created_at: String(row.created_at),
  };
}

function mapShareJson(payload: unknown): PrivateSpotShare | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  return mapShareRow(payload as Record<string, unknown>);
}

export function shareHasCoordinates(share: PrivateSpotShare) {
  const lat = share.sender_latitude;
  const lon = share.sender_longitude;

  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return false;
  }

  return validateCheckSpotCoordinates(lat, lon).ok;
}

function stripCoordinatesFromShare(share: PrivateSpotShare): PrivateSpotShare {
  return {
    ...share,
    sender_latitude: null,
    sender_longitude: null,
    sender_address: null,
    sender_location_accuracy: null,
    sender_location_captured_at: null,
    receiver_latitude: null,
    receiver_longitude: null,
    receiver_location_accuracy: null,
    receiver_location_captured_at: null,
    distance_km: null,
  };
}

/** Hide lat/long from recipient until they accept (client-side safety net). */
export function sanitizeShareForViewer(
  share: PrivateSpotShare,
  viewerId: string | null
): PrivateSpotShare {
  if (!viewerId) {
    return stripCoordinatesFromShare(share);
  }

  if (share.recipient_id === viewerId && share.status === "pending") {
    return stripCoordinatesFromShare(share);
  }

  return share;
}

async function fetchPrivateSpotShareFallback(
  shareId: string,
  viewerId: string | null
): Promise<{ share: PrivateSpotShare | null; error: string | null }> {
  const { data, error } = await supabase.from("private_spot_shares").select(SHARE_SELECT).eq("id", shareId).maybeSingle();

  if (error) {
    return { share: null, error: formatPrivateSpotShareError(error) };
  }

  if (!data) {
    return { share: null, error: "CheckSpot not found." };
  }

  const share = sanitizeShareForViewer(mapShareRow(data as Record<string, unknown>), viewerId);

  return { share, error: null };
}

export async function fetchPrivateSpotShare(
  shareId: string,
  viewerId?: string | null
): Promise<{ share: PrivateSpotShare | null; error: string | null }> {
  const { data, error } = await supabase.rpc("fetch_private_spot_share", {
    p_share_id: shareId,
  });

  if (!error) {
    const share = mapShareJson(data);

    if (share && viewerId) {
      return { share: sanitizeShareForViewer(share, viewerId), error: null };
    }

    return { share, error: null };
  }

  const rpcMissing =
    error.code === "42883" ||
    error.message?.toLowerCase().includes("fetch_private_spot_share");

  if (rpcMissing) {
    const session = viewerId
      ? { user: { id: viewerId } }
      : (await supabase.auth.getSession()).data.session;
    return fetchPrivateSpotShareFallback(shareId, session?.user?.id ?? null);
  }

  return { share: null, error: formatPrivateSpotShareError(error) };
}

export async function loadPrivateSpotSharesByIds(shareIds: string[]) {
  if (shareIds.length === 0) {
    return { shares: new Map<string, PrivateSpotShare>(), error: null as string | null };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const viewerId = sessionData.session?.user?.id ?? null;

  const entries = await Promise.all(
    shareIds.map(async (shareId) => {
      const result = await fetchPrivateSpotShare(shareId, viewerId);

      return [shareId, result.share] as const;
    })
  );

  const shares = new Map<string, PrivateSpotShare>();

  for (const [shareId, share] of entries) {
    if (share) {
      shares.set(shareId, share);
    }
  }

  return { shares, error: null };
}

export async function sendPrivateSpotShare(input: {
  senderId: string;
  recipientId: string;
  gps: CheckSpotGpsReading;
}) {
  if (input.senderId === input.recipientId) {
    return { share: null, error: "You cannot send a CheckSpot to yourself." };
  }

  const validated = validateCheckSpotCoordinates(input.gps.latitude, input.gps.longitude);

  if (!validated.ok) {
    return { share: null, error: "Location unavailable." };
  }

  console.log("[CheckSpot] sender coords", input.gps);

  const ensured = await ensureConversationForOutgoingMessage(input.senderId, input.recipientId);

  if (ensured.sendBlockedReason) {
    return { share: null, error: ensured.sendBlockedReason };
  }

  if (ensured.error && !ensured.conversation) {
    return { share: null, error: ensured.error };
  }

  const { data: shareRow, error: shareError } = await supabase
    .from("private_spot_shares")
    .insert({
      sender_id: input.senderId,
      recipient_id: input.recipientId,
      sender_latitude: validated.latitude,
      sender_longitude: validated.longitude,
      sender_location_accuracy: input.gps.accuracyMeters,
      sender_location_captured_at: input.gps.capturedAt,
      status: "pending",
    })
    .select("id, sender_id, recipient_id, status, created_at")
    .single();

  if (shareError) {
    return { share: null, error: formatPrivateSpotShareError(shareError) };
  }

  const shareId = String(shareRow.id);
  const createdAt = new Date().toISOString();

  const { data: messageRow, error: messageError } = await supabase
    .from("direct_messages")
    .insert({
      sender_id: input.senderId,
      recipient_id: input.recipientId,
      message_type: "spot_share_request",
      spot_share_id: shareId,
      body: null,
      created_at: createdAt,
    })
    .select("id, sender_id, recipient_id, message_type, spot_share_id")
    .single();

  if (messageError || !messageRow) {
    await supabase.from("private_spot_shares").delete().eq("id", shareId);
    return { share: null, error: formatPrivateSpotShareError(messageError) };
  }

  if (
    messageRow.message_type !== "spot_share_request" ||
    String(messageRow.spot_share_id) !== shareId
  ) {
    console.error("Spot share DM row mismatch after insert:", messageRow);
  }

  await touchConversationUpdatedAt(input.senderId, input.recipientId);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHATS_INBOX_REFRESH_EVENT));
  }

  const loaded = await fetchPrivateSpotShare(shareId, input.senderId);

  return {
    share:
      loaded.share ?? {
        id: shareId,
        sender_id: input.senderId,
        recipient_id: input.recipientId,
        status: "pending",
        created_at: createdAt,
      },
    error: null,
  };
}

export async function acceptPrivateSpotShare(
  shareId: string,
  recipientId: string,
  receiverGps: CheckSpotGpsReading
) {
  const receiverValidated = validateCheckSpotCoordinates(receiverGps.latitude, receiverGps.longitude);

  if (!receiverValidated.ok) {
    return { share: null, error: "Location unavailable." };
  }

  logCheckSpotReceiverCoords(receiverGps);

  const { data: pendingShare, error: pendingError } = await supabase
    .from("private_spot_shares")
    .select(SHARE_SELECT)
    .eq("id", shareId)
    .eq("recipient_id", recipientId)
    .eq("status", "pending")
    .maybeSingle();

  if (pendingError) {
    return { share: null, error: formatPrivateSpotShareError(pendingError) };
  }

  if (!pendingShare) {
    return { share: null, error: "This CheckSpot is no longer pending." };
  }

  const senderLat = Number(pendingShare.sender_latitude);
  const senderLng = Number(pendingShare.sender_longitude);

  const distanceKm = calculateCheckSpotDistanceKm({
    shareId,
    senderLatitude: senderLat,
    senderLongitude: senderLng,
    receiverLatitude: receiverValidated.latitude,
    receiverLongitude: receiverValidated.longitude,
  });

  const acceptedAt = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("private_spot_shares")
    .update({
      status: "accepted",
      accepted_at: acceptedAt,
      receiver_latitude: receiverValidated.latitude,
      receiver_longitude: receiverValidated.longitude,
      receiver_location_accuracy: receiverGps.accuracyMeters,
      receiver_location_captured_at: receiverGps.capturedAt,
      distance_km: distanceKm,
    })
    .eq("id", shareId)
    .eq("recipient_id", recipientId)
    .eq("status", "pending")
    .select(SHARE_SELECT)
    .maybeSingle();

  if (updateError) {
    return { share: null, error: formatPrivateSpotShareError(updateError) };
  }

  if (!updated) {
    return { share: null, error: "This CheckSpot is no longer pending." };
  }

  const senderId = String(updated.sender_id);

  const { error: messageError } = await supabase.from("direct_messages").insert({
    sender_id: recipientId,
    recipient_id: senderId,
    message_type: "spot_share_accepted",
    spot_share_id: shareId,
    body: null,
    created_at: acceptedAt,
  });

  if (messageError) {
    return { share: null, error: messageError.message };
  }

  const loaded = await fetchPrivateSpotShare(shareId, recipientId);

  return { share: loaded.share, error: loaded.error };
}

export async function declinePrivateSpotShare(shareId: string, recipientId: string) {
  const { error } = await supabase
    .from("private_spot_shares")
    .update({ status: "declined" })
    .eq("id", shareId)
    .eq("recipient_id", recipientId)
    .eq("status", "pending");

  if (error) {
    return { error: formatPrivateSpotShareError(error) };
  }

  return { error: null };
}

export { requestCheckSpotGpsReading };
