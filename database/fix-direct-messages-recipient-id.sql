-- Direct messages column repair (run in Supabase SQL editor)
-- The app uses recipient_id everywhere. Older databases may still have receiver_id.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'direct_messages'
      and column_name = 'receiver_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'direct_messages'
      and column_name = 'recipient_id'
  ) then
    alter table public.direct_messages rename column receiver_id to recipient_id;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'direct_messages'
      and column_name = 'receiver_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'direct_messages'
      and column_name = 'recipient_id'
  ) then
    update public.direct_messages
    set recipient_id = coalesce(recipient_id, receiver_id)
    where recipient_id is null;

    alter table public.direct_messages drop column receiver_id;
  end if;
end $$;

alter table public.direct_messages
  add column if not exists recipient_id uuid references public.profiles(id) on delete cascade;

delete from public.direct_messages where recipient_id is null;

alter table public.direct_messages
  alter column recipient_id set not null;

alter table public.direct_messages
  drop column if exists receiver_id;

drop index if exists public.idx_direct_messages_receiver_id_created_at;

create index if not exists idx_direct_messages_recipient_id_created_at
on public.direct_messages(recipient_id, created_at desc);
