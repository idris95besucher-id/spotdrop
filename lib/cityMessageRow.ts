/**
 * Single canonical shape for a raw `city_messages` row, shared by every sender
 * (text/voice/photo/location) so they can never drift out of sync with each other or with
 * CityRoomView.tsx's own message-list type.
 */
export type CityMessageRawRow = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  edited_at: string | null;
  audio_url: string | null;
  audio_duration_seconds: number | null;
  audio_waveform: number[] | null;
  image_url: string | null;
  live_location_lat: number | null;
  live_location_lng: number | null;
  live_location_updated_at: string | null;
  live_location_expires_at: string | null;
  deleted_at: string | null;
};

export const CITY_MESSAGE_SELECT =
  "id, content, created_at, user_id, edited_at, audio_url, audio_duration_seconds, audio_waveform, image_url, live_location_lat, live_location_lng, live_location_updated_at, live_location_expires_at, deleted_at";
