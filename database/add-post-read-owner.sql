-- Ensure post owners can always read their own posts (run in Supabase SQL editor)

drop policy if exists "Allow post owner read" on public.posts;

create policy "Allow post owner read"
on public.posts
for select
to authenticated
using (auth.uid() = user_id);
