-- Ensure authenticated users can read/write live map locations (safe to re-run).

grant select, insert, update, delete on table public.user_live_locations to authenticated;

drop policy if exists "Authenticated users can read live locations" on public.user_live_locations;
create policy "Authenticated users can read live locations"
on public.user_live_locations for select
to authenticated
using (true);

drop policy if exists "Users can insert own live location" on public.user_live_locations;
create policy "Users can insert own live location"
on public.user_live_locations for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own live location" on public.user_live_locations;
create policy "Users can update own live location"
on public.user_live_locations for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own live location" on public.user_live_locations;
create policy "Users can delete own live location"
on public.user_live_locations for delete
to authenticated
using (auth.uid() = user_id);

notify pgrst, 'reload schema';
