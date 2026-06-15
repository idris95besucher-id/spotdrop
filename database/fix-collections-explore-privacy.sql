-- Keep private / friends / invite collection spots off Explore (public discovery).
-- Run after add-collections.sql.

update public.posts p
set visibility = 'private',
    published_to_spots = false
from public.collection_spots cs
inner join public.collections c on c.id = cs.collection_id
where cs.post_id = p.id
  and c.visibility <> 'public'
  and coalesce(p.content_kind, '') = 'spot'
  and coalesce(p.visibility, 'public') = 'public';

-- Any spot in a collection must not appear on public Spots explore
update public.posts p
set published_to_spots = false
from public.collection_spots cs
where cs.post_id = p.id
  and coalesce(p.content_kind, '') = 'spot';
