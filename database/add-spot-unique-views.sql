-- Unique Spot opens (full viewer): one authenticated non-owner viewer per spot.
-- Separate from visited_count / "See Spot" visits.
-- Run in Supabase SQL editor after posts table exists (bigint ids).

alter table public.posts
  add column if not exists unique_view_count bigint not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_unique_view_count_nonnegative'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_unique_view_count_nonnegative
      check (unique_view_count >= 0);
  end if;
end $$;

create table if not exists public.spot_unique_views (
  spot_id bigint not null references public.posts(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (spot_id, viewer_id)
);

create index if not exists idx_spot_unique_views_spot
  on public.spot_unique_views (spot_id);

create index if not exists idx_spot_unique_views_viewer
  on public.spot_unique_views (viewer_id);

create or replace function public.trg_spot_unique_views_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
    set unique_view_count = unique_view_count + 1
    where id = new.spot_id
      and content_kind = 'spot';
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts
    set unique_view_count = greatest(0, unique_view_count - 1)
    where id = old.spot_id
      and content_kind = 'spot';
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists spot_unique_views_count on public.spot_unique_views;
create trigger spot_unique_views_count
after insert or delete on public.spot_unique_views
for each row
execute function public.trg_spot_unique_views_count();

create or replace function public.record_spot_unique_view(p_spot_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_owner uuid;
  v_rows integer;
  v_count bigint;
begin
  if v_viewer is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'not_authenticated',
      'inserted', false,
      'unique_view_count', null
    );
  end if;

  select user_id
  into v_owner
  from public.posts
  where id = p_spot_id
    and content_kind = 'spot';

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'not_a_spot',
      'inserted', false,
      'unique_view_count', null
    );
  end if;

  if v_owner = v_viewer then
    select unique_view_count into v_count
    from public.posts
    where id = p_spot_id;

    return jsonb_build_object(
      'ok', true,
      'inserted', false,
      'skipped_owner', true,
      'unique_view_count', coalesce(v_count, 0)
    );
  end if;

  insert into public.spot_unique_views (spot_id, viewer_id)
  values (p_spot_id, v_viewer)
  on conflict (spot_id, viewer_id) do nothing;

  get diagnostics v_rows = row_count;

  select unique_view_count into v_count
  from public.posts
  where id = p_spot_id;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_rows > 0,
    'unique_view_count', coalesce(v_count, 0)
  );
end;
$$;

revoke all on function public.record_spot_unique_view(bigint) from public;
grant execute on function public.record_spot_unique_view(bigint) to authenticated;
revoke execute on function public.record_spot_unique_view(bigint) from anon;

alter table public.spot_unique_views enable row level security;

-- Clients must not read viewer_id lists; aggregate lives on posts.unique_view_count.
drop policy if exists "Spot unique views readable" on public.spot_unique_views;
drop policy if exists "Spot unique views select own" on public.spot_unique_views;

revoke all on table public.spot_unique_views from public, anon, authenticated;

-- Existing spots keep unique_view_count = 0 via column default. Safe to re-run.
