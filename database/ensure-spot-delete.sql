-- Spot delete fix — safe to re-run in Supabase SQL Editor.
-- Spots are rows in public.posts (column user_id). There is no separate spots table.
-- Optional child tables are skipped when they do not exist (to_regclass checks).

-- ---------------------------------------------------------------------------
-- 1. posts: owner read + delete (required)
-- ---------------------------------------------------------------------------
alter table public.posts enable row level security;

grant select, delete on table public.posts to authenticated;

drop policy if exists "Allow post owner read" on public.posts;
create policy "Allow post owner read"
on public.posts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Allow post owner delete" on public.posts;
drop policy if exists "Allow post owner or admin delete" on public.posts;
drop policy if exists "Users can delete own spots" on public.posts;
drop policy if exists "Users can delete own posts" on public.posts;

create policy "Users can delete own posts"
on public.posts
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Child tables: grant delete + post-owner policies (optional tables only)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.post_comments') is not null then
    grant delete on table public.post_comments to authenticated;
    drop policy if exists "Post owner delete comments on own posts" on public.post_comments;
    create policy "Post owner delete comments on own posts"
    on public.post_comments for delete to authenticated
    using (exists (select 1 from public.posts p where p.id::text = post_comments.post_id::text and p.user_id = auth.uid()));
  end if;

  if to_regclass('public.post_reactions') is not null then
    grant delete on table public.post_reactions to authenticated;
    drop policy if exists "Post owner delete reactions on own posts" on public.post_reactions;
    create policy "Post owner delete reactions on own posts"
    on public.post_reactions for delete to authenticated
    using (exists (select 1 from public.posts p where p.id::text = post_reactions.post_id::text and p.user_id = auth.uid()));
  end if;

  if to_regclass('public.collection_spots') is not null then
    grant delete on table public.collection_spots to authenticated;
    drop policy if exists "Post owner delete collection spots" on public.collection_spots;
    create policy "Post owner delete collection spots"
    on public.collection_spots for delete to authenticated
    using (exists (select 1 from public.posts p where p.id::text = collection_spots.post_id::text and p.user_id = auth.uid()));
  end if;

  if to_regclass('public.spot_collection_saves') is not null then
    grant delete on table public.spot_collection_saves to authenticated;
    drop policy if exists "Post owner delete spot collection saves" on public.spot_collection_saves;
    create policy "Post owner delete spot collection saves"
    on public.spot_collection_saves for delete to authenticated
    using (exists (select 1 from public.posts p where p.id::text = spot_collection_saves.post_id::text and p.user_id = auth.uid()));
  end if;

  if to_regclass('public.spot_visits') is not null then
    grant delete on table public.spot_visits to authenticated;
    drop policy if exists "Post owner delete spot visits" on public.spot_visits;
    create policy "Post owner delete spot visits"
    on public.spot_visits for delete to authenticated
    using (exists (select 1 from public.posts p where p.id::text = spot_visits.post_id::text and p.user_id = auth.uid()));
  end if;

  if to_regclass('public.spot_visited_daily') is not null then
    grant delete on table public.spot_visited_daily to authenticated;
    drop policy if exists "Post owner delete spot visited daily" on public.spot_visited_daily;
    create policy "Post owner delete spot visited daily"
    on public.spot_visited_daily for delete to authenticated
    using (exists (select 1 from public.posts p where p.id::text = spot_visited_daily.post_id::text and p.user_id = auth.uid()));
  end if;

  if to_regclass('public.spot_commenters') is not null then
    grant delete on table public.spot_commenters to authenticated;
    drop policy if exists "Post owner delete spot commenters" on public.spot_commenters;
    create policy "Post owner delete spot commenters"
    on public.spot_commenters for delete to authenticated
    using (exists (select 1 from public.posts p where p.id::text = spot_commenters.post_id::text and p.user_id = auth.uid()));
  end if;

  if to_regclass('public.guide_places') is not null then
    grant delete on table public.guide_places to authenticated;
    drop policy if exists "Post owner delete guide places" on public.guide_places;
    create policy "Post owner delete guide places"
    on public.guide_places for delete to authenticated
    using (exists (select 1 from public.posts p where p.id::text = guide_places.post_id::text and p.user_id = auth.uid()));
  end if;

  if to_regclass('public.direct_messages') is not null then
    grant delete on table public.direct_messages to authenticated;
    drop policy if exists "Post owner delete spot share messages" on public.direct_messages;
    create policy "Post owner delete spot share messages"
    on public.direct_messages for delete to authenticated
    using (
      message_type = 'spot'
      and post_id is not null
      and exists (select 1 from public.posts p where p.id::text = direct_messages.post_id::text and p.user_id = auth.uid())
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. RPC: security definer cascade delete (bypasses RLS — primary path)
-- ---------------------------------------------------------------------------
drop function if exists public.delete_owned_post(text);

create or replace function public.delete_owned_post(p_post_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.posts%rowtype;
  v_deleted integer;
  v_id_text text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_post_id is null or btrim(p_post_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_post_id');
  end if;

  if btrim(p_post_id) ~ '^[0-9]+$' then
    select * into v_row from public.posts where id = btrim(p_post_id)::bigint;
  else
    select * into v_row from public.posts where id = btrim(p_post_id)::uuid;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'post_not_found');
  end if;

  if v_row.user_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;

  v_id_text := v_row.id::text;

  if to_regclass('public.post_comments') is not null then
    delete from public.post_comments where post_id::text = v_id_text;
  end if;

  if to_regclass('public.post_reactions') is not null then
    delete from public.post_reactions where post_id::text = v_id_text;
  end if;

  if to_regclass('public.collection_spots') is not null then
    delete from public.collection_spots where post_id::text = v_id_text;
  end if;

  if to_regclass('public.spot_collection_saves') is not null then
    delete from public.spot_collection_saves where post_id::text = v_id_text;
  end if;

  if to_regclass('public.spot_visits') is not null then
    delete from public.spot_visits where post_id::text = v_id_text;
  end if;

  if to_regclass('public.spot_visited_daily') is not null then
    delete from public.spot_visited_daily where post_id::text = v_id_text;
  end if;

  if to_regclass('public.spot_commenters') is not null then
    delete from public.spot_commenters where post_id::text = v_id_text;
  end if;

  if to_regclass('public.guide_places') is not null then
    delete from public.guide_places where post_id::text = v_id_text;
  end if;

  if to_regclass('public.direct_messages') is not null then
    delete from public.direct_messages
    where message_type = 'spot'
      and post_id is not null
      and post_id::text = v_id_text;
  end if;

  delete from public.posts where id::text = v_id_text and user_id = v_user;

  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    return jsonb_build_object('ok', false, 'error', 'delete_blocked');
  end if;

  return jsonb_build_object(
    'ok', true,
    'post_id', v_id_text,
    'media_url', v_row.media_url,
    'image_url', v_row.image_url,
    'video_url', v_row.video_url,
    'video_cover_url', v_row.video_cover_url,
    'thumbnail_url', v_row.thumbnail_url
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

grant execute on function public.delete_owned_post(text) to authenticated;

notify pgrst, 'reload schema';

-- Verify policies (run separately):
-- select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr
-- from pg_policy
-- join pg_class on pg_class.oid = pg_policy.polrelid
-- join pg_namespace on pg_namespace.oid = pg_class.relnamespace
-- where nspname = 'public' and relname = 'posts' and polcmd = 'd';
