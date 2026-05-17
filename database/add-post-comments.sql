-- Post comments (run in Supabase SQL editor)
-- Note: posts.id is uuid in SpotDrop; post_id must be uuid (not bigint).

create table if not exists public.post_comments (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamp with time zone default now()
);

alter table public.post_comments enable row level security;

drop policy if exists "Post comments readable" on public.post_comments;
drop policy if exists "Users can create own comments" on public.post_comments;
drop policy if exists "Users can delete own comments" on public.post_comments;

create policy "Post comments readable"
on public.post_comments
for select
to authenticated
using (true);

create policy "Users can create own comments"
on public.post_comments
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can delete own comments"
on public.post_comments
for delete
to authenticated
using (auth.uid() = user_id);
