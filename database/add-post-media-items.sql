-- Carousel media for multi-item Spots (Instagram-style).
--
-- Requires: public.posts.id is bigint (SpotDrop production schema).
-- Do not use uuid for post_id — FK will fail with ERROR 42804.

CREATE TABLE IF NOT EXISTS public.post_media_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id bigint NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  sort_order integer NOT NULL,
  media_url text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  video_cover_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_media_items_post_sort
  ON public.post_media_items (post_id, sort_order);

ALTER TABLE public.post_media_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_media_items_select_public"
  ON public.post_media_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_media_items.post_id
        AND (p.visibility = 'public' OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "post_media_items_insert_own"
  ON public.post_media_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_media_items.post_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "post_media_items_delete_own"
  ON public.post_media_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_media_items.post_id
        AND p.user_id = auth.uid()
    )
  );
