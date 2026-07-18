-- Adds edit/delete support for post_comments (used by My Gallery, other users' galleries,
-- and Spot/post comments — they all render through the same PostCommentsSection/postComments.ts).
--
-- Run this whole file once in the Supabase SQL Editor. Safe to re-run (idempotent).

-- 1) edited_at column ---------------------------------------------------------
alter table if exists public.post_comments
  add column if not exists edited_at timestamptz;

-- 2) RLS: owner-only UPDATE + re-assert owner-only DELETE ---------------------
alter table if exists public.post_comments enable row level security;

drop policy if exists "Users can update own comments" on public.post_comments;
create policy "Users can update own comments"
on public.post_comments
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own comments" on public.post_comments;
create policy "Users can delete own comments"
on public.post_comments
for delete
to authenticated
using (auth.uid() = user_id);

-- 3) Guard trigger: server-side 15-minute edit window, author-only, and lock down
--    which columns an edit is allowed to touch (content + edited_at only). Deleting has no
--    time limit, so there is no equivalent guard on delete — the RLS policy above is enough.
create or replace function public.post_comments_guard_owner_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.post_id is distinct from old.post_id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'cannot change comment identity fields';
  end if;

  if auth.uid() is distinct from old.user_id then
    raise exception 'only the comment author can edit this comment';
  end if;

  if old.created_at < now() - interval '15 minutes' then
    raise exception 'edit window has expired';
  end if;

  return new;
end;
$$;

drop trigger if exists post_comments_guard_owner_edit on public.post_comments;
create trigger post_comments_guard_owner_edit
before update on public.post_comments
for each row
execute function public.post_comments_guard_owner_edit();

notify pgrst, 'reload schema';
