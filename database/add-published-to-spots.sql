-- Explore Spots page: only posts intentionally published to public Spots (not collection-only saves)
-- Run in Supabase SQL editor (idempotent)

alter table public.posts
  add column if not exists published_to_spots boolean not null default true;

create index if not exists idx_posts_explore_spots
  on public.posts (created_at desc)
  where content_kind = 'spot'
    and visibility = 'public'
    and published_to_spots = true;

-- Collection membership = not on public Spots explore
update public.posts p
set published_to_spots = false
from public.collection_spots cs
where cs.post_id = p.id
  and coalesce(p.content_kind, '') = 'spot';

-- Non-public visibility = not on explore
update public.posts
set published_to_spots = false
where coalesce(content_kind, '') = 'spot'
  and coalesce(visibility, 'public') <> 'public';

-- Remaining public spots without collection links stay published_to_spots = true
