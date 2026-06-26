-- Allow authenticated users to update their own profiles row (presence + general self-update).
-- Safe to re-run. Run after database/add-profiles-last-seen-at.sql

alter table if exists public.profiles enable row level security;

drop policy if exists "Users can update own presence" on public.profiles;

create policy "Users can update own presence"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Allow profile update" on public.profiles;

create policy "Allow profile update"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

notify pgrst, 'reload schema';
