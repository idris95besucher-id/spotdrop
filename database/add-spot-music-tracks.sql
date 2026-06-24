-- Spot editor music library (metadata catalog for Spot drafts).
-- v1: SpotDrop-owned / licensed-ready rows only — not a full commercial catalog.
-- Future: add provider column + sync from licensed API without changing client search UI.

create table if not exists public.spot_music_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null,
  audio_url text,
  cover_url text,
  duration integer check (duration is null or duration > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_spot_music_tracks_active on public.spot_music_tracks (is_active) where is_active = true;
create index if not exists idx_spot_music_tracks_title on public.spot_music_tracks using gin (to_tsvector('simple', title));
create index if not exists idx_spot_music_tracks_artist on public.spot_music_tracks using gin (to_tsvector('simple', artist));

alter table public.spot_music_tracks enable row level security;

drop policy if exists "Active spot music readable" on public.spot_music_tracks;
create policy "Active spot music readable"
on public.spot_music_tracks for select
using (is_active = true);

-- Seed SpotDrop library tracks (replace audio_url / cover_url when assets are hosted).
insert into public.spot_music_tracks (id, title, artist, audio_url, cover_url, duration, is_active)
values
  ('a1000001-0000-4000-8000-000000000001', 'Morning Walk', 'SpotDrop', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', null, 60, true),
  ('a1000001-0000-4000-8000-000000000002', 'City Lights', 'SpotDrop Studio', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', null, 45, true),
  ('a1000001-0000-4000-8000-000000000003', 'Soft Groove', 'SpotDrop Beats', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', null, 52, true),
  ('a1000001-0000-4000-8000-000000000004', 'Open Road', 'SpotDrop', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', null, 48, true),
  ('a1000001-0000-4000-8000-000000000005', 'Alpine Air', 'Local Sounds', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', null, 55, true),
  ('a1000001-0000-4000-8000-000000000006', 'Bern Sunset', 'Swiss Vibes', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', null, 42, true),
  ('a1000001-0000-4000-8000-000000000007', 'Night Drive', 'SpotDrop Beats', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', null, 58, true),
  ('a1000001-0000-4000-8000-000000000008', 'Coffee Break', 'Acoustic Lab', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', null, 39, true),
  ('a1000001-0000-4000-8000-000000000009', 'Lake Reflection', 'Calm Collective', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3', null, 64, true),
  ('a1000001-0000-4000-8000-000000000010', 'Urban Steps', 'SpotDrop Studio', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3', null, 47, true),
  ('a1000001-0000-4000-8000-000000000011', 'Golden Hour', 'Horizon Line', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3', null, 51, true),
  ('a1000001-0000-4000-8000-000000000012', 'Rainy Window', 'Ambient Room', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3', null, 70, true),
  ('a1000001-0000-4000-8000-000000000013', 'Weekend Walk', 'SpotDrop', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3', null, 44, true),
  ('a1000001-0000-4000-8000-000000000014', 'Neon Alley', 'City Pulse', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3', null, 53, true),
  ('a1000001-0000-4000-8000-000000000015', 'Quiet Park', 'Green Notes', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3', null, 49, true),
  ('a1000001-0000-4000-8000-000000000016', 'Travel Diary', 'SpotDrop Beats', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3', null, 56, true),
  ('a1000001-0000-4000-8000-000000000017', 'Snowfall', 'Nordic Tone', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', null, 62, true),
  ('a1000001-0000-4000-8000-000000000018', 'Rooftop View', 'Skyline', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', null, 46, true),
  ('a1000001-0000-4000-8000-000000000019', 'Market Day', 'Local Sounds', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', null, 41, true),
  ('a1000001-0000-4000-8000-000000000020', 'Starlit Path', 'SpotDrop', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', null, 68, true)
on conflict (id) do nothing;

-- Backfill distinct preview URLs for rows seeded before audio_url was set.
update public.spot_music_tracks as t
set audio_url = v.audio_url
from (values
  ('a1000001-0000-4000-8000-000000000001'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'),
  ('a1000001-0000-4000-8000-000000000002'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3'),
  ('a1000001-0000-4000-8000-000000000003'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'),
  ('a1000001-0000-4000-8000-000000000004'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3'),
  ('a1000001-0000-4000-8000-000000000005'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3'),
  ('a1000001-0000-4000-8000-000000000006'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3'),
  ('a1000001-0000-4000-8000-000000000007'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3'),
  ('a1000001-0000-4000-8000-000000000008'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3'),
  ('a1000001-0000-4000-8000-000000000009'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3'),
  ('a1000001-0000-4000-8000-000000000010'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3'),
  ('a1000001-0000-4000-8000-000000000011'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3'),
  ('a1000001-0000-4000-8000-000000000012'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3'),
  ('a1000001-0000-4000-8000-000000000013'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3'),
  ('a1000001-0000-4000-8000-000000000014'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3'),
  ('a1000001-0000-4000-8000-000000000015'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3'),
  ('a1000001-0000-4000-8000-000000000016'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3'),
  ('a1000001-0000-4000-8000-000000000017'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'),
  ('a1000001-0000-4000-8000-000000000018'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3'),
  ('a1000001-0000-4000-8000-000000000019'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'),
  ('a1000001-0000-4000-8000-000000000020'::uuid, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3')
) as v(id, audio_url)
where t.id = v.id
  and (t.audio_url is null or t.audio_url = 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3');
