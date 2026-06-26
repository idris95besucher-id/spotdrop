-- Ephemeral DM typing status (fallback when Realtime broadcast is unavailable).
-- Safe to re-run. Does NOT create messages, notifications, or push.

create table if not exists public.dm_typing_status (
  user_id uuid not null references public.profiles(id) on delete cascade,
  partner_id uuid not null references public.profiles(id) on delete cascade,
  username text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, partner_id),
  check (user_id <> partner_id)
);

create index if not exists idx_dm_typing_status_partner_updated
  on public.dm_typing_status (partner_id, updated_at desc);

alter table public.dm_typing_status enable row level security;

drop policy if exists "Users upsert own typing status" on public.dm_typing_status;
create policy "Users upsert own typing status"
on public.dm_typing_status for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users update own typing status" on public.dm_typing_status;
create policy "Users update own typing status"
on public.dm_typing_status for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users read typing status for their threads" on public.dm_typing_status;
create policy "Users read typing status for their threads"
on public.dm_typing_status for select
to authenticated
using (auth.uid() = user_id or auth.uid() = partner_id);

grant select, insert, update on table public.dm_typing_status to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.dm_typing_status;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
