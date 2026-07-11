import { uploadCityRoomChatImage } from "@/lib/cityRoomChatMedia";
import { createPrivateLocationCardPost } from "@/lib/createPrivateLocationCardPost";
import {
  ensureConversationForOutgoingMessage,
} from "@/lib/directConversations";
import { encodeLocationCardShareMessage } from "@/lib/locationCardShareMessage";
import { resolveCityRoomId } from "@/lib/roomExplore";
import { renderSpotLocationCardFile } from "@/lib/renderSpotLocationCard";
import { sendSpotToRecipient } from "@/lib/sendSpotMessage";
import type { SpotLocationCardFontStyle } from "@/lib/spotLocationCardStyles";
import type { SpotGeoLocation } from "@/lib/spotLocation";
import { supabase } from "@/lib/supabaseClient";

export type PrepareLocationCardShareInput = {
  userId: string;
  cardText: string;
  fontStyle: SpotLocationCardFontStyle;
  locationLabel: string;
  location: SpotGeoLocation;
};

export async function prepareLocationCardShareContent(input: PrepareLocationCardShareInput) {
  const cardFile = await renderSpotLocationCardFile({
    cardText: input.cardText,
    fontStyle: input.fontStyle,
    locationLabel: input.locationLabel,
  });

  const imageUrl = await uploadCityRoomChatImage(input.userId, cardFile);

  return encodeLocationCardShareMessage({
    imageUrl,
    cardText: input.cardText.trim(),
    locationLabel: input.locationLabel,
    latitude: input.location.latitude,
    longitude: input.location.longitude,
    fontStyle: input.fontStyle,
  });
}

export type SendLocationCardToRecipientInput = {
  senderId: string;
  recipientId: string;
  cardText: string;
  fontStyle: SpotLocationCardFontStyle;
  locationLabel: string;
  location: SpotGeoLocation;
  cardFile?: File;
};

export async function sendLocationCardToRecipient(input: SendLocationCardToRecipientInput) {
  if (input.senderId === input.recipientId) {
    return { error: "You cannot send a card to yourself." };
  }

  const ensured = await ensureConversationForOutgoingMessage(input.senderId, input.recipientId);

  if (ensured.sendBlockedReason) {
    return { error: ensured.sendBlockedReason };
  }

  if (ensured.error && !ensured.conversation) {
    return { error: ensured.error };
  }

  const created = await createPrivateLocationCardPost({
    userId: input.senderId,
    cardText: input.cardText,
    fontStyle: input.fontStyle,
    locationLabel: input.locationLabel,
    location: input.location,
    cardFile: input.cardFile,
  });

  if (!created.postId) {
    return { error: created.error ?? "Unable to save card." };
  }

  return sendSpotToRecipient({
    senderId: input.senderId,
    recipientId: input.recipientId,
    postId: created.postId,
  });
}

export async function sendLocationCardToCityRoom(input: {
  userId: string;
  countrySlug: string;
  citySlug: string;
  cardText: string;
  fontStyle: SpotLocationCardFontStyle;
  locationLabel: string;
  location: SpotGeoLocation;
  optionalMessage?: string;
}) {
  const resolved = await resolveCityRoomId(input.countrySlug, input.citySlug);

  if (!resolved.cityId) {
    return { error: resolved.error ?? "City room not found." };
  }

  const encodedContent = await prepareLocationCardShareContent({
    userId: input.userId,
    cardText: input.cardText,
    fontStyle: input.fontStyle,
    locationLabel: input.locationLabel,
    location: input.location,
  });

  const { error: cardError } = await supabase.from("city_messages").insert({
    city_id: resolved.cityId,
    user_id: input.userId,
    content: encodedContent,
  });

  if (cardError) {
    return { error: cardError.message || "Unable to send card to room." };
  }

  const trimmedMessage = input.optionalMessage?.trim();

  if (trimmedMessage) {
    const { error: textError } = await supabase.from("city_messages").insert({
      city_id: resolved.cityId,
      user_id: input.userId,
      content: trimmedMessage,
    });

    if (textError) {
      return { error: textError.message || "Unable to send your message." };
    }
  }

  return { error: null };
}
