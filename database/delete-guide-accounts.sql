-- Remove bern_guide, swiss_guide, Official AI Guide accounts, and any *_guide / *_quide users.
-- Run in Supabase SQL editor, or: npm run db:delete-guide-accounts

do $$
declare
  guide_ids uuid[];
begin
  select array_agg(id)
  into guide_ids
  from profiles
  where username ~* '_(guide|quide)$'
    or lower(username) in (
      'bern_guide',
      'swiss_guide',
      'cyprus_guide',
      'bern_quide',
      'swiss_quide',
      'spot_guide',
      'official_ai_guide',
      'ai_guide'
    )
    or name ~* 'official\s+(ai\s+)?(swiss\s+|bern\s+)?guide'
    or name ~* '^(bern|swiss|cyprus)\s+guide$';

  if guide_ids is null or array_length(guide_ids, 1) is null then
    raise notice 'No guide accounts found.';
    return;
  end if;

  delete from guide_places
  where post_id in (select id from posts where user_id = any(guide_ids));

  delete from direct_messages
  where sender_id = any(guide_ids) or recipient_id = any(guide_ids);

  delete from city_messages where user_id = any(guide_ids);
  delete from city_channel_messages where user_id = any(guide_ids);

  delete from follows
  where follower_id = any(guide_ids) or following_id = any(guide_ids);

  delete from post_reactions where user_id = any(guide_ids);
  delete from post_comments where user_id = any(guide_ids);

  delete from posts where user_id = any(guide_ids);

  delete from profiles where id = any(guide_ids);

  delete from auth.users where id = any(guide_ids);

  raise notice 'Removed % guide account(s).', array_length(guide_ids, 1);
end $$;
