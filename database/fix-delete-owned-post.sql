-- Owner spot/post delete: RLS + server-side cascade cleanup
-- Run in Supabase SQL editor after posts, comments, collections, spot ranking exist.

grant delete on table public.posts to authenticated;

drop policy if exists "Allow post owner read" on public.posts;
create policy "Allow post owner read"
on public.posts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Allow post owner delete" on public.posts;
drop policy if exists "Allow post owner or admin delete" on public.posts;

create policy "Allow post owner or admin delete"
on public.posts
for delete
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  )
);

drop function if exists public.delete_owned_post(text);

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

  -- Explicit cleanup (FKs may cascade; these cover mixed schemas / missing cascades).
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
