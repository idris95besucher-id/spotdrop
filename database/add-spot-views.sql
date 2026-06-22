-- Unique spot views: one authenticated viewer per spot (Instagram/TikTok style).
-- Run in Supabase SQL editor after add-spot-ranking.sql (and optionally fix-spot-unique-user-stats.sql).

create table if not exists public.spot_views (
  spot_id bigint not null references public.posts(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint spot_views_spot_viewer_unique unique (spot_id, viewer_id)
);

create index if not exists idx_spot_views_spot on public.spot_views(spot_id);
create index if not exists idx_spot_views_viewer on public.spot_views(viewer_id);

-- Migrate lifetime visits from spot_visits when that table exists
do $$
begin
  if to_regclass('public.spot_visits') is not null then
    insert into public.spot_views (spot_id, viewer_id, created_at)
    select post_id, user_id, created_at
    from public.spot_visits
    on conflict (spot_id, viewer_id) do nothing;
  end if;
end $$;

-- Migrate daily visits (earliest per user) when spot_visits is empty
do $$
begin
  if to_regclass('public.spot_visited_daily') is not null then
    insert into public.spot_views (spot_id, viewer_id, created_at)
    select post_id, user_id, min(created_at)
    from public.spot_visited_daily
    group by post_id, user_id
    on conflict (spot_id, viewer_id) do nothing;
  end if;
end $$;

-- Authenticated unique view: skip owner, insert once, bump posts.visited_count
create or replace function public.record_spot_view(p_post_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_owner uuid;
  v_rows integer;
  v_visited integer;
begin
  if v_viewer is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select user_id
  into v_owner
  from public.posts
  where id = p_post_id
    and content_kind = 'spot';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_a_spot');
  end if;

  if v_owner = v_viewer then
    select visited_count into v_visited
    from public.posts
    where id = p_post_id;

    return jsonb_build_object(
      'ok', true,
      'visited_count', coalesce(v_visited, 0),
      'incremented', false,
      'skipped_owner', true
    );
  end if;

  insert into public.spot_views (spot_id, viewer_id)
  values (p_post_id, v_viewer)
  on conflict (spot_id, viewer_id) do nothing;

  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    update public.posts
    set visited_count = visited_count + 1
    where id = p_post_id
      and content_kind = 'spot';

    perform public.refresh_post_spot_rank_score(p_post_id);
  end if;

  select visited_count into v_visited
  from public.posts
  where id = p_post_id;

  return jsonb_build_object(
    'ok', true,
    'visited_count', coalesce(v_visited, 0),
    'incremented', v_rows > 0
  );
end;
$$;

-- Backward-compatible alias used by older clients
create or replace function public.record_spot_visited(p_post_id bigint)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.record_spot_view(p_post_id);
$$;

grant execute on function public.record_spot_view(bigint) to authenticated;
grant execute on function public.record_spot_visited(bigint) to authenticated;

revoke execute on function public.record_spot_view(bigint) from anon;
revoke execute on function public.record_spot_visited(bigint) from anon;

alter table public.spot_views enable row level security;

drop policy if exists "Spot views readable" on public.spot_views;
create policy "Spot views readable"
on public.spot_views for select
using (true);

-- Reconcile visited_count with unique viewers (exclude owner views — they are never inserted)
update public.posts p
set visited_count = coalesce(sub.cnt, 0)
from (
  select spot_id, count(*)::integer as cnt
  from public.spot_views
  group by spot_id
) sub
where p.id = sub.spot_id
  and p.content_kind = 'spot';

-- Refresh ranking scores
update public.posts p
set spot_rank_score = public.compute_spot_rank_score(
  p.visited_count,
  p.collection_save_count,
  p.comments_count,
  p.views_count
)
where p.content_kind = 'spot';
