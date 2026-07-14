-- Persistent city-room inbox memberships (safe to re-run).
-- Ensures every sender of a city_messages row gets a room_memberships row.
-- Run in Supabase SQL Editor after deploy.

-- 1) Table
create table if not exists public.room_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  country_slug text not null,
  city_slug text not null,
  last_read_at timestamptz,
  is_muted boolean not null default false,
  is_hidden boolean not null default false,
  joined_by_message boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, country_slug, city_slug)
);

create index if not exists idx_room_memberships_user_visible
  on public.room_memberships (user_id, is_hidden);

create index if not exists idx_room_memberships_user_city
  on public.room_memberships (user_id, country_slug, city_slug);

create or replace function public.touch_room_membership_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_room_memberships_updated_at on public.room_memberships;
create trigger trg_room_memberships_updated_at
before update on public.room_memberships
for each row execute function public.touch_room_membership_updated_at();

-- 2) RLS — own rows only
alter table public.room_memberships enable row level security;

drop policy if exists "Users read own room memberships" on public.room_memberships;
create policy "Users read own room memberships"
on public.room_memberships for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users insert own room memberships" on public.room_memberships;
create policy "Users insert own room memberships"
on public.room_memberships for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users update own room memberships" on public.room_memberships;
create policy "Users update own room memberships"
on public.room_memberships for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on table public.room_memberships to authenticated;

-- 3) Auto-membership on every city message insert (security definer)
create or replace function public.ensure_room_membership_on_city_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country_slug text;
  v_city_slug text;
begin
  if new.user_id is null or new.city_id is null then
    return new;
  end if;

  select co.slug, ci.slug
  into v_country_slug, v_city_slug
  from public.cities ci
  join public.countries co on co.id = ci.country_id
  where ci.id = new.city_id;

  if v_country_slug is null or v_city_slug is null then
    return new;
  end if;

  insert into public.room_memberships (
    user_id,
    country_slug,
    city_slug,
    is_hidden,
    joined_by_message,
    updated_at
  )
  values (
    new.user_id,
    v_country_slug,
    v_city_slug,
    false,
    true,
    now()
  )
  on conflict (user_id, country_slug, city_slug)
  do update set
    is_hidden = false,
    joined_by_message = true,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_city_messages_room_membership on public.city_messages;
create trigger trg_city_messages_room_membership
after insert on public.city_messages
for each row
execute function public.ensure_room_membership_on_city_message();

-- 4) Inbox RPC (matches client column names)
create or replace function public.get_user_room_inbox(p_user_id uuid)
returns table (
  country_slug text,
  city_slug text,
  country_name text,
  city_name text,
  last_message text,
  last_message_at timestamptz,
  unread_count int,
  is_muted boolean,
  is_hidden boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'not authorized';
  end if;

  return query
  select
    rm.country_slug,
    rm.city_slug,
    co.name as country_name,
    ci.name as city_name,
    lm.content as last_message,
    coalesce(lm.created_at, rm.updated_at, rm.created_at) as last_message_at,
    case
      when rm.is_muted then 0
      else coalesce(uc.cnt, 0)::int
    end as unread_count,
    rm.is_muted,
    rm.is_hidden
  from public.room_memberships rm
  join public.countries co on co.slug = rm.country_slug
  join public.cities ci on ci.country_id = co.id and ci.slug = rm.city_slug
  left join lateral (
    select cm.content, cm.created_at
    from public.city_messages cm
    where cm.city_id = ci.id
    order by cm.created_at desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*)::int as cnt
    from public.city_messages cm
    where cm.city_id = ci.id
      and cm.created_at > coalesce(rm.last_read_at, '1970-01-01'::timestamptz)
      and cm.user_id <> p_user_id
  ) uc on true
  where rm.user_id = p_user_id
    and rm.is_hidden = false
  order by coalesce(lm.created_at, rm.updated_at, rm.created_at) desc;
end;
$$;

grant execute on function public.get_user_room_inbox(uuid) to authenticated;

-- 5) Backfill: one membership per distinct sender + city from existing messages
insert into public.room_memberships (
  user_id,
  country_slug,
  city_slug,
  is_hidden,
  joined_by_message,
  updated_at
)
select distinct
  cm.user_id,
  co.slug,
  ci.slug,
  false,
  true,
  max(cm.created_at)
from public.city_messages cm
join public.cities ci on ci.id = cm.city_id
join public.countries co on co.id = ci.country_id
where cm.user_id is not null
group by cm.user_id, co.slug, ci.slug
on conflict (user_id, country_slug, city_slug) do nothing;

-- 6) Realtime
do $$
begin
  alter publication supabase_realtime add table public.room_memberships;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
