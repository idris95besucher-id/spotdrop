-- Allow a followed user to remove someone from their followers list.
-- Existing policy only lets the follower delete their own follow row (unfollow).

drop policy if exists "Allow followed user remove follower" on public.follows;

create policy "Allow followed user remove follower"
on public.follows
for delete
to authenticated
using (auth.uid() = following_id);
