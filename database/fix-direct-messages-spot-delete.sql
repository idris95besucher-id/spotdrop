-- Fix Delete Spot: remove shared Spot DMs instead of nulling post_id (safe to re-run).
-- Run in Supabase SQL Editor after add-direct-messages-spot-post.sql

-- ---------------------------------------------------------------------------
-- 1. FK direct_messages.post_id → posts.id ON DELETE CASCADE (not SET NULL)
-- ---------------------------------------------------------------------------
do $$
declare
  constraint_name name;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where nsp.nspname = 'public'
      and rel.relname = 'direct_messages'
      and att.attname = 'post_id'
      and con.contype = 'f'
  loop
    execute format(
      'alter table public.direct_messages drop constraint if exists %I',
      constraint_name
    );
  end loop;
end $$;

alter table public.direct_messages
  drop constraint if exists direct_messages_post_id_fkey;

alter table public.direct_messages
  add constraint direct_messages_post_id_fkey
  foreign key (post_id) references public.posts(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 2. Drop old delete_owned_post (may still UPDATE post_id = null)
-- ---------------------------------------------------------------------------
drop function if exists public.delete_owned_post(text);

-- ---------------------------------------------------------------------------
-- 3. Recreate delete_owned_post — DELETE spot DMs, never SET post_id NULL
-- ---------------------------------------------------------------------------
create function public.delete_owned_post(p_post_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row public.posts%rowtype;
  v_deleted integer;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_post_id is null or btrim(p_post_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_post_id');
  end if;

  if p_post_id ~ '^[0-9]+$' then
    select * into v_row
    from public.posts
    where id = p_post_id::bigint;
  else
    select * into v_row
    from public.posts
    where id = p_post_id::uuid;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'post_not_found');
  end if;

  if v_row.user_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;

  delete from public.post_comments where post_id = v_row.id;
  delete from public.post_reactions where post_id = v_row.id;

  if to_regclass('public.collection_spots') is not null then
    delete from public.collection_spots where post_id = v_row.id;
  end if;

  if to_regclass('public.spot_collection_saves') is not null then
    delete from public.spot_collection_saves where post_id = v_row.id;
  end if;

  if to_regclass('public.spot_visits') is not null then
    delete from public.spot_visits where post_id = v_row.id;
  end if;

  if to_regclass('public.spot_visited_daily') is not null then
    delete from public.spot_visited_daily where post_id = v_row.id;
  end if;

  if to_regclass('public.spot_commenters') is not null then
    delete from public.spot_commenters where post_id = v_row.id;
  end if;

  if to_regclass('public.guide_places') is not null then
    delete from public.guide_places where post_id = v_row.id;
  end if;

  -- Remove shared Spot DMs. Never UPDATE post_id = null (breaks direct_messages_body_check).
  delete from public.direct_messages
  where message_type = 'spot'
    and post_id = v_row.id;

  delete from public.posts
  where id = v_row.id
    and user_id = v_user;

  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    return jsonb_build_object('ok', false, 'error', 'delete_blocked');
  end if;

  return jsonb_build_object(
    'ok', true,
    'post_id', v_row.id::text,
    'media_url', v_row.media_url,
    'image_url', v_row.image_url,
    'video_url', v_row.video_url,
    'video_cover_url', v_row.video_cover_url,
    'thumbnail_url', v_row.thumbnail_url
  );
end;
$$;

grant execute on function public.delete_owned_post(text) to authenticated;

notify pgrst, 'reload schema';
