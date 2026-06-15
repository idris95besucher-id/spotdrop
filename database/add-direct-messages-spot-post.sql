-- Share published Spots in direct messages (message_type = 'spot', post_id set)
-- Run in Supabase SQL editor after add-direct-messages-message-type.sql

-- ---------------------------------------------------------------------------
-- 1. post_id on direct_messages
-- ---------------------------------------------------------------------------
alter table public.direct_messages
  add column if not exists post_id uuid references public.posts(id) on delete cascade;

create index if not exists direct_messages_post_id_idx
  on public.direct_messages (post_id)
  where post_id is not null;

-- ---------------------------------------------------------------------------
-- 2. message_type includes 'spot'
-- ---------------------------------------------------------------------------
alter table public.direct_messages drop constraint if exists direct_messages_message_type_check;

alter table public.direct_messages
  add constraint direct_messages_message_type_check
  check (message_type in ('text', 'spot_share_request', 'spot_share_accepted', 'spot'));

-- ---------------------------------------------------------------------------
-- 3. body rules: spot messages use post_id (body optional)
-- ---------------------------------------------------------------------------
alter table public.direct_messages drop constraint if exists direct_messages_body_check;

alter table public.direct_messages
  add constraint direct_messages_body_check
  check (
    (
      message_type = 'text'
      and body is not null
      and btrim(body) <> ''
      and spot_share_id is null
      and post_id is null
    )
    or (
      message_type in ('spot_share_request', 'spot_share_accepted')
      and spot_share_id is not null
      and post_id is null
    )
    or (
      message_type = 'spot'
      and post_id is not null
      and spot_share_id is null
    )
  );
