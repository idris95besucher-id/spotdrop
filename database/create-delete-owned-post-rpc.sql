-- Creates public.delete_owned_post(p_post_id text) for Spot delete RPC.
-- Frontend call: supabase.rpc("delete_owned_post", { p_post_id: "<id>" })
-- Safe to re-run. Run the ENTIRE file in Supabase SQL Editor.

-- Optional: posts delete grant + owner policies (no-op if already present)
grant delete on table public.posts to authenticated;

-- Optional: FK cascade (skip if types differ — function still created below)
do $$
begin
  alter table public.direct_messages
    drop constraint if exists direct_messages_post_id_fkey;

  alter table public.direct_messages
    add constraint direct_messages_post_id_fkey
    foreign key (post_id) references public.posts(id) on delete cascade;
exception
  when others then
    raise notice 'direct_messages.post_id FK not updated: %', sqlerrm;
end $$;

-- Required: RPC used by lib/deleteContent.ts
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
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_post_id is null or btrim(p_post_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_post_id');
  end if;

  if btrim(p_post_id) ~ '^[0-9]+$' then
    select * into v_row
    from public.posts
    where id = btrim(p_post_id)::bigint;
  else
    select * into v_row
    from public.posts
    where id = btrim(p_post_id)::uuid;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'post_not_found');
  end if;

  if v_row.user_id is distinct from v_user then
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;

  delete from public.post_comments where post_id = v_row.id;
  delete from public.post_reactions where post_id = v_row.id;

  if to_regclass('public.post_media_items') is not null then
    delete from public.post_media_items where post_id = v_row.id;
  end if;

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

  -- Never UPDATE post_id = null (violates direct_messages_body_check for message_type = 'spot').
  delete from public.direct_messages
  where message_type = 'spot'
    and post_id is not null
    and post_id::text = v_row.id::text;

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

-- Verify (should return 1 row: delete_owned_post | text):
-- select proname, oidvectortypes(proargtypes) as args
-- from pg_proc
-- where pronamespace = 'public'::regnamespace
--   and proname = 'delete_owned_post';
