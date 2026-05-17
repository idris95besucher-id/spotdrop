-- Add edited_at for city room message edits (safe to re-run).
alter table if exists city_messages add column if not exists edited_at timestamptz;

-- Owner-only update policy (re-create if missing).
alter table if exists city_messages enable row level security;

drop policy if exists "Allow city message owner update" on city_messages;

create policy "Allow city message owner update"
on city_messages
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
