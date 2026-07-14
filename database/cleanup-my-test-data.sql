-- Clean ONE user's Visit / map / Spot test data only.
-- Run in Supabase SQL editor.
--
-- 1) Set your username below.
-- 2) Review the RAISE NOTICE counts.
-- 3) Does NOT delete: profiles, follows, friends, countries, cities, other users.

do $$
declare
  v_username text := 'REPLACE_WITH_YOUR_USERNAME'; -- <-- edit this
  v_user_id uuid;
  n integer;
begin
  select id into v_user_id
  from public.profiles
  where lower(username) = lower(v_username);

  if v_user_id is null then
    raise exception 'No profile found for username %', v_username;
  end if;

  raise notice 'Cleaning user % (%)', v_username, v_user_id;

  -- Notifications created by my activity
  delete from public.notifications where actor_id = v_user_id;
  get diagnostics n = row_count;
  raise notice 'notifications (actor): %', n;

  -- Visit room messages I sent (includes auto-shared mark cards)
  delete from public.city_messages where user_id = v_user_id;
  get diagnostics n = row_count;
  raise notice 'city_messages: %', n;

  if to_regclass('public.city_channel_messages') is not null then
    delete from public.city_channel_messages where user_id = v_user_id;
    get diagnostics n = row_count;
    raise notice 'city_channel_messages: %', n;
  end if;

  -- Child rows for my spots
  if to_regclass('public.post_media_items') is not null then
    delete from public.post_media_items
    where post_id in (select id from public.posts where user_id = v_user_id and content_kind = 'spot');
    get diagnostics n = row_count;
    raise notice 'post_media_items: %', n;
  end if;

  delete from public.post_comments
  where post_id in (select id from public.posts where user_id = v_user_id and content_kind = 'spot');
  get diagnostics n = row_count;
  raise notice 'post_comments: %', n;

  delete from public.post_reactions
  where post_id in (select id from public.posts where user_id = v_user_id and content_kind = 'spot');
  get diagnostics n = row_count;
  raise notice 'post_reactions: %', n;

  if to_regclass('public.collection_spots') is not null then
    delete from public.collection_spots
    where post_id in (select id from public.posts where user_id = v_user_id and content_kind = 'spot');
    get diagnostics n = row_count;
    raise notice 'collection_spots: %', n;
  end if;

  if to_regclass('public.spot_collection_saves') is not null then
    delete from public.spot_collection_saves
    where post_id in (select id from public.posts where user_id = v_user_id and content_kind = 'spot');
    get diagnostics n = row_count;
    raise notice 'spot_collection_saves: %', n;
  end if;

  if to_regclass('public.spot_visits') is not null then
    delete from public.spot_visits
    where post_id in (select id from public.posts where user_id = v_user_id and content_kind = 'spot');
    get diagnostics n = row_count;
    raise notice 'spot_visits: %', n;
  end if;

  if to_regclass('public.spot_visited_daily') is not null then
    delete from public.spot_visited_daily
    where post_id in (select id from public.posts where user_id = v_user_id and content_kind = 'spot');
    get diagnostics n = row_count;
    raise notice 'spot_visited_daily: %', n;
  end if;

  if to_regclass('public.spot_commenters') is not null then
    delete from public.spot_commenters
    where post_id in (select id from public.posts where user_id = v_user_id and content_kind = 'spot');
    get diagnostics n = row_count;
    raise notice 'spot_commenters: %', n;
  end if;

  if to_regclass('public.guide_places') is not null then
    delete from public.guide_places
    where post_id in (select id from public.posts where user_id = v_user_id and content_kind = 'spot');
    get diagnostics n = row_count;
    raise notice 'guide_places: %', n;
  end if;

  -- DM rows that share my spots (spot cards), not other users' normal DMs
  delete from public.direct_messages
  where message_type = 'spot'
    and post_id in (select id from public.posts where user_id = v_user_id and content_kind = 'spot');
  get diagnostics n = row_count;
  raise notice 'direct_messages (my spot shares): %', n;

  -- My published spots
  delete from public.posts
  where user_id = v_user_id
    and content_kind = 'spot';
  get diagnostics n = row_count;
  raise notice 'posts (spots): %', n;

  -- Map marks / places I created
  delete from public.map_marks where user_id = v_user_id;
  get diagnostics n = row_count;
  raise notice 'map_marks: %', n;

  if to_regclass('public.user_map_markers') is not null then
    delete from public.user_map_markers where user_id = v_user_id;
    get diagnostics n = row_count;
    raise notice 'user_map_markers: %', n;
  end if;

  if to_regclass('public.user_map_places') is not null then
    delete from public.user_map_places where user_id = v_user_id;
    get diagnostics n = row_count;
    raise notice 'user_map_places: %', n;
  end if;

  raise notice 'Done. Profile / follows / friends / geo structure were not deleted.';
end $$;
