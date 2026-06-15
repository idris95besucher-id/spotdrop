import { shareHasCoordinates, type PrivateSpotShare } from "@/lib/privateSpotShares";
import { publicProfileUsername } from "@/lib/publicProfile";
import { supabase } from "@/lib/supabaseClient";

export type MapLocationSharePin = {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  latitude: number;
  longitude: number;
  label: string;
  shared_at: string;
};

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

export async function loadMapLocationSharePins(userId: string) {
  const { data, error } = await supabase
    .from("private_spot_shares")
    .select(
      "id, sender_id, recipient_id, sender_latitude, sender_longitude, sender_address, status, accepted_at, created_at"
    )
    .eq("status", "accepted")
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("accepted_at", { ascending: false })
    .limit(40);

  if (error) {
    if (isMissingPrivateSpotSharesTable(error)) {
      return { pins: [] as MapLocationSharePin[], error: null };
    }

    return { pins: [] as MapLocationSharePin[], error: error.message };
  }

  const shares = (data ?? [])
    .map((row) => ({
      id: String(row.id),
      sender_id: String(row.sender_id),
      recipient_id: String(row.recipient_id),
      sender_latitude: row.sender_latitude != null ? Number(row.sender_latitude) : null,
      sender_longitude: row.sender_longitude != null ? Number(row.sender_longitude) : null,
      sender_address: (row.sender_address as string | null) ?? null,
      status: row.status as PrivateSpotShare["status"],
      accepted_at: row.accepted_at ? String(row.accepted_at) : null,
      created_at: String(row.created_at),
    }))
    .filter(shareHasCoordinates);

  if (shares.length === 0) {
    return { pins: [] as MapLocationSharePin[], error: null };
  }

  const profileIds = Array.from(
    new Set(shares.flatMap((share) => [share.sender_id, share.recipient_id]))
  );

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", profileIds);

  const profileById = new Map(
    (profiles ?? []).map((profile) => [
      String(profile.id),
      {
        username: publicProfileUsername(profile.username),
        avatar_url: (profile.avatar_url as string | null) ?? null,
      },
    ])
  );

  const pins: MapLocationSharePin[] = [];

  for (const share of shares) {
    const latitude = share.sender_latitude!;
    const longitude = share.sender_longitude!;
    const senderProfile = profileById.get(share.sender_id);
    const isOwnShare = share.sender_id === userId;

    pins.push({
      id: share.id,
      user_id: share.sender_id,
      username: senderProfile?.username ?? "User",
      avatar_url: senderProfile?.avatar_url ?? null,
      latitude,
      longitude,
      label: share.sender_address?.trim() || (isOwnShare ? "Your shared location" : `${senderProfile?.username ?? "Friend"}'s location`),
      shared_at: share.accepted_at ?? share.created_at,
    });
  }

  return { pins, error: null };
}
