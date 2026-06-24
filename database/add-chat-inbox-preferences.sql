-- Per-user DM inbox preferences (mute / hide). Room chats use room_memberships.

create table if not exists public.chat_inbox_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_type text not null check (chat_type in ('dm', 'room')),
  chat_key text not null,
  muted boolean not null default false,
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, chat_type, chat_key)
);

create index if not exists idx_chat_inbox_preferences_user
  on public.chat_inbox_preferences (user_id);

create index if not exists idx_chat_inbox_preferences_user_visible
  on public.chat_inbox_preferences (user_id, chat_type, hidden);

create or replace function public.touch_chat_inbox_preference_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_chat_inbox_preferences_updated_at on public.chat_inbox_preferences;
create trigger trg_chat_inbox_preferences_updated_at
before update on public.chat_inbox_preferences
for each row execute function public.touch_chat_inbox_preference_updated_at();

alter table public.chat_inbox_preferences enable row level security;

drop policy if exists "Users read own chat inbox preferences" on public.chat_inbox_preferences;
create policy "Users read own chat inbox preferences"
on public.chat_inbox_preferences for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users insert own chat inbox preferences" on public.chat_inbox_preferences;
create policy "Users insert own chat inbox preferences"
on public.chat_inbox_preferences for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users update own chat inbox preferences" on public.chat_inbox_preferences;
create policy "Users update own chat inbox preferences"
on public.chat_inbox_preferences for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on table public.chat_inbox_preferences to authenticated;

-- Unhide DM when either participant sends a new message.
create or replace function public.unhide_dm_on_direct_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_inbox_preferences
  set hidden = false, updated_at = now()
  where chat_type = 'dm'
    and hidden = true
    and (
      (user_id = new.recipient_id and chat_key = new.sender_id::text)
      or (user_id = new.sender_id and chat_key = new.recipient_id::text)
    );

  return new;
end;
$$;

drop trigger if exists trg_unhide_dm_on_direct_message on public.direct_messages;
create trigger trg_unhide_dm_on_direct_message
after insert on public.direct_messages
for each row execute function public.unhide_dm_on_direct_message();

-- Unhide hidden room memberships when the user is @mentioned in a city message.
create or replace function public.unhide_room_on_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.room_memberships rm
  set is_hidden = false, updated_at = now()
  from public.cities c
  join public.countries co on co.id = c.country_id
  where c.id = new.city_id
    and rm.country_slug = co.slug
    and rm.city_slug = c.slug
    and rm.is_hidden = true
    and exists (
      select 1
      from public.profiles p
      where p.id = rm.user_id
        and p.username is not null
        and position(
          lower('@' || p.username) in lower(new.content)
        ) > 0
    );

  return new;
end;
$$;

drop trigger if exists trg_unhide_room_on_mention on public.city_messages;
create trigger trg_unhide_room_on_mention
before insert on public.city_messages
for each row execute function public.unhide_room_on_mention();

notify pgrst, 'reload schema';

do $$
begin
  alter publication supabase_realtime add table public.chat_inbox_preferences;
exception
  when duplicate_object then null;
end $$;
