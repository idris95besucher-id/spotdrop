-- Per-video audio flag for Spot posts (user chose "Remove sound" before publish).
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS audio_muted boolean NOT NULL DEFAULT false;

ALTER TABLE public.post_media_items
  ADD COLUMN IF NOT EXISTS audio_muted boolean NOT NULL DEFAULT false;
