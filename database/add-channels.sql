-- Profile Channels: curated thematic publishing (separate from save Collections).
-- Supports public/private channels and future subscribers.

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  visibility text not null default 'private'
    check (visibility in ('public', 'private')),
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_channels_user_id on public.channels(user_id);
create index if not exists idx_channels_visibility on public.channels(visibility);

-- Items in a channel: Spots, photos, videos, text cards, and future channel-native posts.
create table if not exists public.channel_items (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  post_id bigint references public.posts(id) on delete cascade,
  -- Reserved for future channel-native posts that are not rows in public.posts.
  item_kind text not null default 'post'
    check (item_kind in ('post', 'channel_post')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (channel_id, post_id)
);

create index if not exists idx_channel_items_channel on public.channel_items(channel_id);
create index if not exists idx_channel_items_post on public.channel_items(post_id);

-- Future subscribers (follow a channel).
create table if not exists public.channel_subscribers (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index if not exists idx_channel_subscribers_user on public.channel_subscribers(user_id);

alter table public.channels enable row level security;
alter table public.channel_items enable row level security;
alter table public.channel_subscribers enable row level security;

drop policy if exists "Channels readable by owner" on public.channels;
create policy "Channels readable by owner"
on public.channels for select
using (auth.uid() = user_id);

drop policy if exists "Channels readable when public" on public.channels;
create policy "Channels readable when public"
on public.channels for select
using (visibility = 'public');

drop policy if exists "Channels insert own" on public.channels;
create policy "Channels insert own"
on public.channels for insert
with check (auth.uid() = user_id);

drop policy if exists "Channels update own" on public.channels;
create policy "Channels update own"
on public.channels for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Channels delete own" on public.channels;
create policy "Channels delete own"
on public.channels for delete
using (auth.uid() = user_id);

drop policy if exists "Channel items readable" on public.channel_items;
create policy "Channel items readable"
on public.channel_items for select
using (
  exists (
    select 1 from public.channels c
    where c.id = channel_items.channel_id
      and (
        c.user_id = auth.uid()
        or c.visibility = 'public'
      )
  )
);

drop policy if exists "Channel items insert own channel" on public.channel_items;
create policy "Channel items insert own channel"
on public.channel_items for insert
with check (
  exists (
    select 1 from public.channels c
    where c.id = channel_items.channel_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists "Channel items delete own channel" on public.channel_items;
create policy "Channel items delete own channel"
on public.channel_items for delete
using (
  exists (
    select 1 from public.channels c
    where c.id = channel_items.channel_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists "Channel items update own channel" on public.channel_items;
create policy "Channel items update own channel"
on public.channel_items for update
using (
  exists (
    select 1 from public.channels c
    where c.id = channel_items.channel_id
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.channels c
    where c.id = channel_items.channel_id
      and c.user_id = auth.uid()
  )
);

-- Subscribers: owner can manage; users can subscribe/unsubscribe themselves.
drop policy if exists "Channel subscribers readable" on public.channel_subscribers;
create policy "Channel subscribers readable"
on public.channel_subscribers for select
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.channels c
    where c.id = channel_subscribers.channel_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists "Channel subscribers insert self" on public.channel_subscribers;
create policy "Channel subscribers insert self"
on public.channel_subscribers for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.channels c
    where c.id = channel_subscribers.channel_id
      and c.visibility = 'public'
  )
);

drop policy if exists "Channel subscribers delete self or owner" on public.channel_subscribers;
create policy "Channel subscribers delete self or owner"
on public.channel_subscribers for delete
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.channels c
    where c.id = channel_subscribers.channel_id
      and c.user_id = auth.uid()
  )
);
