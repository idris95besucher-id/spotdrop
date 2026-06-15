-- Spot ranking: visited, collection saves, comments, views + hidden score
-- Run in Supabase SQL editor after posts / collections / post_comments exist.

alter table public.posts
  add column if not exists visited_count integer not null default 0,
  add column if not exists collection_save_count integer not null default 0,
  add column if not exists comments_count integer not null default 0,
  add column if not exists views_count integer not null default 0,
  add column if not exists spot_rank_score numeric not null default 0;

create index if not exists idx_posts_spot_rank_score
  on public.posts (spot_rank_score desc)
  where content_kind = 'spot';

-- One visited signal per user per spot per UTC day
create table if not exists public.spot_visited_daily (
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  visited_on date not null default ((timezone('utc', now()))::date),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, visited_on)
);

create index if not exists idx_spot_visited_daily_post on public.spot_visited_daily(post_id);

-- One collection save per user per spot (across all collections)
create table if not exists public.spot_collection_saves (
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists idx_spot_collection_saves_post on public.spot_collection_saves(post_id);

create or replace function public.compute_spot_rank_score(
  p_visited integer,
  p_saves integer,
  p_comments integer,
  p_views integer
)
returns numeric
language sql
immutable
as $$
  select
    (coalesce(p_visited, 0) * 0.50)
    + (coalesce(p_comments, 0) * 0.30)
    + (coalesce(p_saves, 0) * 0.15)
    + (coalesce(p_views, 0) * 0.05);
$$;

create or replace function public.refresh_post_spot_rank_score(p_post_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.posts p
  set spot_rank_score = public.compute_spot_rank_score(
    p.visited_count,
    p.collection_save_count,
    p.comments_count,
    p.views_count
  )
  where p.id = p_post_id;
end;
$$;

create or replace function public.trg_posts_spot_rank_score()
returns trigger
language plpgsql
as $$
begin
  new.spot_rank_score := public.compute_spot_rank_score(
    new.visited_count,
    new.collection_save_count,
    new.comments_count,
    new.views_count
  );
  return new;
end;
$$;

drop trigger if exists posts_spot_rank_score on public.posts;
create trigger posts_spot_rank_score
before insert or update of visited_count, collection_save_count, comments_count, views_count
on public.posts
for each row
execute function public.trg_posts_spot_rank_score();

-- Sync comments_count from post_comments
create or replace function public.trg_post_comments_spot_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
    set comments_count = comments_count + 1
    where id = new.post_id
      and content_kind = 'spot';

    perform public.refresh_post_spot_rank_score(new.post_id);
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts
    set comments_count = greatest(0, comments_count - 1)
    where id = old.post_id
      and content_kind = 'spot';

    perform public.refresh_post_spot_rank_score(old.post_id);
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists post_comments_spot_count on public.post_comments;
create trigger post_comments_spot_count
after insert or delete on public.post_comments
for each row
execute function public.trg_post_comments_spot_count();

-- Collection save: one per user per spot
create or replace function public.trg_collection_spots_save_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_rows integer;
begin
  if tg_op = 'INSERT' then
    select c.user_id into v_owner
    from public.collections c
    where c.id = new.collection_id;

    if v_owner is null then
      return new;
    end if;

    insert into public.spot_collection_saves (post_id, user_id)
    values (new.post_id, v_owner)
    on conflict do nothing;

    get diagnostics v_rows = row_count;

    if v_rows > 0 then
      update public.posts
      set collection_save_count = collection_save_count + 1
      where id = new.post_id
        and content_kind = 'spot';

      perform public.refresh_post_spot_rank_score(new.post_id);
    end if;

    return new;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists collection_spots_save_count on public.collection_spots;
create trigger collection_spots_save_count
after insert on public.collection_spots
for each row
execute function public.trg_collection_spots_save_count();

-- Visited: authenticated, once per user per spot per UTC day
create or replace function public.record_spot_visited(p_post_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_rows integer;
  v_visited integer;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not exists (
    select 1 from public.posts
    where id = p_post_id and content_kind = 'spot'
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_a_spot');
  end if;

  insert into public.spot_visited_daily (post_id, user_id, visited_on)
  values (p_post_id, v_user, (timezone('utc', now()))::date)
  on conflict do nothing;

  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    update public.posts
    set visited_count = visited_count + 1
    where id = p_post_id
      and content_kind = 'spot';
  end if;

  select visited_count into v_visited
  from public.posts
  where id = p_post_id;

  return jsonb_build_object('ok', true, 'visited_count', coalesce(v_visited, 0), 'incremented', v_rows > 0);
end;
$$;

-- Views: count each spot open (public spots)
create or replace function public.record_spot_view(p_post_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_views integer;
begin
  update public.posts
  set views_count = views_count + 1
  where id = p_post_id
    and content_kind = 'spot';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_a_spot');
  end if;

  select views_count into v_views from public.posts where id = p_post_id;

  return jsonb_build_object('ok', true, 'views_count', coalesce(v_views, 0));
end;
$$;

grant execute on function public.record_spot_visited(bigint) to authenticated;
grant execute on function public.record_spot_view(bigint) to anon, authenticated;

alter table public.spot_visited_daily enable row level security;
alter table public.spot_collection_saves enable row level security;

drop policy if exists "Spot visited readable" on public.spot_visited_daily;
create policy "Spot visited readable"
on public.spot_visited_daily for select
using (true);

drop policy if exists "Spot collection saves readable" on public.spot_collection_saves;
create policy "Spot collection saves readable"
on public.spot_collection_saves for select
using (true);

-- Backfill comment counts
update public.posts p
set comments_count = sub.cnt
from (
  select post_id, count(*)::integer as cnt
  from public.post_comments
  group by post_id
) sub
where p.id = sub.post_id
  and p.content_kind = 'spot';

-- Backfill collection save counts (distinct collection owners per spot)
insert into public.spot_collection_saves (post_id, user_id)
select distinct cs.post_id, c.user_id
from public.collection_spots cs
join public.collections c on c.id = cs.collection_id
join public.posts p on p.id = cs.post_id and p.content_kind = 'spot'
on conflict do nothing;

update public.posts p
set collection_save_count = sub.cnt
from (
  select post_id, count(*)::integer as cnt
  from public.spot_collection_saves
  group by post_id
) sub
where p.id = sub.post_id
  and p.content_kind = 'spot';

-- Refresh hidden scores for all spots
update public.posts p
set spot_rank_score = public.compute_spot_rank_score(
  p.visited_count,
  p.collection_save_count,
  p.comments_count,
  p.views_count
)
where p.content_kind = 'spot';
