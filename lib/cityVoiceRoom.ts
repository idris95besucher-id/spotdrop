"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export type CityVoiceRoomStatus = "active" | "ended";
export type CityVoiceParticipantRole = "host" | "speaker" | "listener";

export type CityVoiceRoom = {
  id: string;
  country_slug: string;
  city_slug: string;
  host_id: string;
  status: CityVoiceRoomStatus;
  started_at: string;
  ended_at: string | null;
};

export type CityVoiceParticipant = {
  id: string;
  voice_room_id: string;
  user_id: string;
  role: CityVoiceParticipantRole;
  joined_at: string;
  left_at: string | null;
};

export async function fetchActiveCityVoiceRoom(countrySlug: string, citySlug: string) {
  const { data, error } = await supabase
    .from("city_voice_rooms")
    .select("id, country_slug, city_slug, host_id, status, started_at, ended_at")
    .eq("country_slug", countrySlug)
    .eq("city_slug", citySlug)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as CityVoiceRoom | null) ?? null;
}

export async function countActiveVoiceListeners(voiceRoomId: string) {
  const { count, error } = await supabase
    .from("city_voice_participants")
    .select("id", { count: "exact", head: true })
    .eq("voice_room_id", voiceRoomId)
    .eq("role", "listener")
    .is("left_at", null);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function fetchMyActiveVoiceParticipation(voiceRoomId: string, userId: string) {
  const { data, error } = await supabase
    .from("city_voice_participants")
    .select("id, voice_room_id, user_id, role, joined_at, left_at")
    .eq("voice_room_id", voiceRoomId)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as CityVoiceParticipant | null) ?? null;
}

export async function startCityVoiceRoom(countrySlug: string, citySlug: string, hostId: string) {
  const { data, error } = await supabase
    .from("city_voice_rooms")
    .insert({
      country_slug: countrySlug,
      city_slug: citySlug,
      host_id: hostId,
      status: "active",
    })
    .select("id, country_slug, city_slug, host_id, status, started_at, ended_at")
    .single();

  if (error) {
    throw error;
  }

  const room = data as CityVoiceRoom;

  const { data: participant, error: participantError } = await supabase
    .from("city_voice_participants")
    .insert({
      voice_room_id: room.id,
      user_id: hostId,
      role: "host",
    })
    .select("id, voice_room_id, user_id, role, joined_at, left_at")
    .single();

  if (participantError) {
    throw participantError;
  }

  return { room, participant: participant as CityVoiceParticipant };
}

export async function joinCityVoiceRoom(
  voiceRoomId: string,
  userId: string,
  role: Exclude<CityVoiceParticipantRole, "host"> = "listener"
) {
  const existing = await fetchMyActiveVoiceParticipation(voiceRoomId, userId);
  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("city_voice_participants")
    .insert({
      voice_room_id: voiceRoomId,
      user_id: userId,
      role,
    })
    .select("id, voice_room_id, user_id, role, joined_at, left_at")
    .single();

  if (error) {
    throw error;
  }

  return data as CityVoiceParticipant;
}

export async function leaveCityVoiceParticipation(participantId: string) {
  const { error } = await supabase
    .from("city_voice_participants")
    .update({ left_at: new Date().toISOString() })
    .eq("id", participantId);

  if (error) {
    throw error;
  }
}

export async function endCityVoiceRoom(voiceRoomId: string, hostId: string) {
  const endedAt = new Date().toISOString();

  const { error: roomError } = await supabase
    .from("city_voice_rooms")
    .update({ status: "ended", ended_at: endedAt })
    .eq("id", voiceRoomId)
    .eq("host_id", hostId)
    .eq("status", "active");

  if (roomError) {
    throw roomError;
  }

  const { error: participantsError } = await supabase
    .from("city_voice_participants")
    .update({ left_at: endedAt })
    .eq("voice_room_id", voiceRoomId)
    .is("left_at", null);

  if (participantsError) {
    throw participantsError;
  }
}

type VoiceRoomSubscription = {
  channel: RealtimeChannel;
  unsubscribe: () => void;
};

export function subscribeToCityVoiceRoom(
  countrySlug: string,
  citySlug: string,
  voiceRoomId: string | null,
  handlers: {
    onRoomChange: (room: CityVoiceRoom | null) => void;
    onListenerCountChange: (count: number) => void;
    onParticipationChange: (participant: CityVoiceParticipant | null) => void;
  },
  userId: string | null
) {
  const channelName = `city_voice_${countrySlug}_${citySlug}_${voiceRoomId ?? "none"}`;
  const channel = supabase.channel(channelName);

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "city_voice_rooms",
      filter: `country_slug=eq.${countrySlug}`,
    },
    async () => {
      const room = await fetchActiveCityVoiceRoom(countrySlug, citySlug);
      handlers.onRoomChange(room);
      if (room) {
        handlers.onListenerCountChange(await countActiveVoiceListeners(room.id));
      } else {
        handlers.onListenerCountChange(0);
      }
    }
  );

  if (voiceRoomId) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "city_voice_participants",
        filter: `voice_room_id=eq.${voiceRoomId}`,
      },
      async () => {
        handlers.onListenerCountChange(await countActiveVoiceListeners(voiceRoomId));
        if (userId) {
          handlers.onParticipationChange(await fetchMyActiveVoiceParticipation(voiceRoomId, userId));
        }
      }
    );
  }

  void channel.subscribe();

  return {
    channel,
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    },
  } satisfies VoiceRoomSubscription;
}

export function buildLiveKitRoomName(countrySlug: string, citySlug: string, voiceRoomId: string) {
  return `city-${countrySlug}-${citySlug}-${voiceRoomId}`;
}
