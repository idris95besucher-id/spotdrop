-- Read-only diagnostic — run this in the Supabase SQL Editor while logged in as the account
-- that's seeing the cross-photo bug, and share the output. It does not modify anything.
--
-- Purpose: determine whether the bug is a DATA problem (rows in post_comments/post_reactions
-- are actually stored against the wrong post_id, or duplicated) or a DISPLAY problem (the data is
-- correct but the app is showing the wrong rows).

-- 1) Your gallery photos, oldest first, with their real post_id and how many comments/likes each
--    one ACTUALLY has in the database right now.
select
  p.id as post_id,
  p.created_at,
  p.content,
  (select count(*) from public.post_comments c where c.post_id = p.id) as comment_count,
  (select count(*) from public.post_reactions r where r.post_id = p.id and r.reaction_type = 'like') as like_count
from public.posts p
where p.user_id = auth.uid()
  and p.content_kind = 'post'
order by p.created_at asc;

-- 2) Every comment you've posted, with which photo it's actually attached to. If two comments
--    you intended for two different photos show the SAME post_id here, that's the smoking gun —
--    the wrong id was sent at insert time.
select
  c.id as comment_id,
  c.post_id,
  c.content,
  c.created_at
from public.post_comments c
where c.user_id = auth.uid()
order by c.created_at desc
limit 50;

-- 3) Every like you've placed, same idea.
select
  r.id as reaction_id,
  r.post_id,
  r.reaction_type,
  r.created_at
from public.post_reactions r
where r.user_id = auth.uid()
order by r.created_at desc
limit 50;

-- 4) Duplicate-key check — more than one reaction row for the exact same (post_id, user_id,
--    reaction_type). This inflates a photo's OWN like count but does not, by itself, move a like
--    onto a different photo.
select post_id, user_id, reaction_type, count(*)
from public.post_reactions
group by post_id, user_id, reaction_type
having count(*) > 1;
