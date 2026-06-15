-- Unique-user stats for spots: one visit per user, unique commenters, saves already unique.
-- Run in Supabase SQL editor after add-spot-ranking.sql.

-- Lifetime visit: one row per user per spot (replaces daily revisit increments)
create table if not exists public.spot_visits (
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists idx_spot_visits_post on public.spot_visits(post_id);

-- Migrate existing daily visits into lifetime visits (earliest timestamp per user)
insert into public.spot_visits (post_id, user_id, created_at)
select post_id, user_id, min(created_at)
from public.spot_visited_daily
group by post_id, user_id
on conflict do nothing;

-- Unique commenters per spot
create table if not exists public.spot_commenters (
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists idx_spot_commenters_post on public.spot_commenters(post_id);

insert into public.spot_commenters (post_id, user_id, created_at)
select post_id, user_id, min(created_at)
from public.post_comments pc
join public.posts p on p.id = pc.post_id and p.content_kind = 'spot'
group by post_id, user_id
on conflict do nothing;

-- Count distinct commenters instead of total comments
create or replace function public.trg_post_comments_spot_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.posts
      where id = new.post_id and content_kind = 'spot'
    ) then
      return new;
    end if;

    insert into public.spot_commenters (post_id, user_id)
    values (new.post_id, new.user_id)
    on conflict do nothing;

    get diagnostics v_rows = row_count;

    if v_rows > 0 then
      update public.posts
      set comments_count = comments_count + 1
      where id = new.post_id
        and content_kind = 'spot';

      perform public.refresh_post_spot_rank_score(new.post_id);
    end if;

    return new;
  elsif tg_op = 'DELETE' then
    if not exists (
      select 1 from public.posts
      where id = old.post_id and content_kind = 'spot'
    ) then
      return old;
    end if;

    if not exists (
      select 1
      from public.post_comments
      where post_id = old.post_id
        and user_id = old.user_id
        and id <> old.id
    ) then
      delete from public.spot_commenters
      where post_id = old.post_id
        and user_id = old.user_id;

      get diagnostics v_rows = row_count;

      if v_rows > 0 then
        update public.posts
        set comments_count = greatest(0, comments_count - 1)
        where id = old.post_id
          and content_kind = 'spot';

        perform public.refresh_post_spot_rank_score(old.post_id);
      end if;
    end if;

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

-- Visited: authenticated, once per user per spot (lifetime)
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

  insert into public.spot_visits (post_id, user_id)
  values (p_post_id, v_user)
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

grant execute on function public.record_spot_visited(bigint) to authenticated;

alter table public.spot_visits enable row level security;

drop policy if exists "Spot visits readable" on public.spot_visits;
create policy "Spot visits readable"
on public.spot_visits for select
using (true);

alter table public.spot_commenters enable row level security;

drop policy if exists "Spot commenters readable" on public.spot_commenters;
create policy "Spot commenters readable"
on public.spot_commenters for select
using (true);

-- Backfill visited_count from unique visitors
update public.posts p
set visited_count = sub.cnt
from (
  select post_id, count(*)::integer as cnt
  from public.spot_visits
  group by post_id
) sub
where p.id = sub.post_id
  and p.content_kind = 'spot';

-- Backfill comments_count from unique commenters
update public.posts p
set comments_count = sub.cnt
from (
  select post_id, count(*)::integer as cnt
  from public.spot_commenters
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
