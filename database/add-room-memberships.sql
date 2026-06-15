-- City room memberships for Messages inbox (safe to re-run).

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

-- Optional RPC helpers (app uses direct queries; safe to skip if already migrated).
create or replace function public.get_user_room_inbox(p_user_id uuid)
returns table (
  membership_id uuid,
  country_slug text,
  city_slug text,
  city_name text,
  country_name text,
  last_message_at timestamptz,
  last_message_content text,
  unread_count int,
  is_muted boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rm.id as membership_id,
    rm.country_slug,
    rm.city_slug,
    ci.name as city_name,
    co.name as country_name,
    lm.created_at as last_message_at,
    lm.content as last_message_content,
    coalesce(uc.cnt, 0)::int as unread_count,
    rm.is_muted
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
  order by coalesce(lm.created_at, rm.updated_at) desc;
$$;

create or replace function public.count_unread_room_messages(p_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(room_counts.cnt), 0)::int
  from (
    select count(*)::int as cnt
    from public.room_memberships rm
    join public.countries co on co.slug = rm.country_slug
    join public.cities ci on ci.country_id = co.id and ci.slug = rm.city_slug
    join public.city_messages cm on cm.city_id = ci.id
      and cm.created_at > coalesce(rm.last_read_at, '1970-01-01'::timestamptz)
      and cm.user_id <> p_user_id
    where rm.user_id = p_user_id
      and rm.is_hidden = false
      and rm.is_muted = false
    group by rm.id
  ) room_counts;
$$;

create or replace function public.get_room_membership_for_city(p_user_id uuid, p_city_id uuid)
returns table (
  country_slug text,
  city_slug text,
  city_name text,
  country_name text,
  is_muted boolean,
  is_hidden boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    rm.country_slug,
    rm.city_slug,
    ci.name as city_name,
    co.name as country_name,
    rm.is_muted,
    rm.is_hidden
  from public.room_memberships rm
  join public.countries co on co.slug = rm.country_slug
  join public.cities ci on ci.country_id = co.id and ci.slug = rm.city_slug
  where rm.user_id = p_user_id
    and ci.id = p_city_id
  limit 1;
$$;

grant execute on function public.get_user_room_inbox(uuid) to authenticated;
grant execute on function public.count_unread_room_messages(uuid) to authenticated;
grant execute on function public.get_room_membership_for_city(uuid, uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.room_memberships;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
