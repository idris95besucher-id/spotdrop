-- Fix: Spot video uploads failing with HTTP 413 (Payload Too Large).
--
-- Root cause: the post-media bucket was created without an explicit file_size_limit, so every
-- upload fell back to whatever the project's global "Max file size" (Dashboard -> Project
-- Settings -> Storage) happens to be — 50 MB by default. Gallery-picked 4K/60fps footage (or
-- even a full 30s native clip at a high bitrate) can comfortably exceed that.
--
-- This migration raises the *bucket's own* limit to 200 MB. The app itself now compresses
-- videos client-side before ever attempting the upload (see lib/videoCompress.ts), so in
-- practice almost nothing will get close to this — it exists as headroom, not as something
-- uploads are expected to routinely approach.
--
-- IMPORTANT: Supabase Storage enforces whichever is *smaller* of this bucket's file_size_limit
-- and the project-wide "Max file size" setting in Dashboard -> Project Settings -> Storage.
-- Raising only this bucket does nothing if the project-wide setting is still lower — that
-- setting cannot be changed via SQL, only from the dashboard. If uploads still fail with 413
-- after running this, go raise (or confirm) the project-wide limit there too.
--
-- Safe to run multiple times.

update storage.buckets
set file_size_limit = 209715200 -- 200 MB, in bytes
where id = 'post-media';

-- Sanity check — should show 209715200 (or higher, if you've already raised it further).
select id, file_size_limit
from storage.buckets
where id = 'post-media';
