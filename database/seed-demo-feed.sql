-- Demo accounts + sample feed posts (run in Supabase SQL editor).

alter table if exists profiles add column if not exists is_demo boolean not null default false;

update profiles set is_demo = false where is_demo is null;

do $$
declare
  auth_instance_id uuid;
  demo_password text := crypt('demo-not-for-login', gen_salt('bf'));
begin
  select id into auth_instance_id from auth.instances limit 1;

  if auth_instance_id is null then
    raise notice 'No auth.instances row found — skip auth.users seed; client demo fallback will still work.';
    return;
  end if;

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values
    (
      'a1000001-0001-4000-8000-000000000002',
      auth_instance_id,
      'authenticated',
      'authenticated',
      'food_finder@demo.spotdrop.invalid',
      demo_password,
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"food_finder"}',
      now(),
      now()
    ),
    (
      'a1000001-0001-4000-8000-000000000003',
      auth_instance_id,
      'authenticated',
      'authenticated',
      'city_tips@demo.spotdrop.invalid',
      demo_password,
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"city_tips"}',
      now(),
      now()
    ),
    (
      'a1000001-0001-4000-8000-000000000004',
      auth_instance_id,
      'authenticated',
      'authenticated',
      'travel_local@demo.spotdrop.invalid',
      demo_password,
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"travel_local"}',
      now(),
      now()
    )
  on conflict (id) do nothing;
end $$;

insert into profiles (id, username, bio, is_private, is_demo)
values
  (
    'a1000001-0001-4000-8000-000000000002',
    'food_finder',
    'Restaurant picks, street food, and where locals actually eat.',
    false,
    true
  ),
  (
    'a1000001-0001-4000-8000-000000000003',
    'city_tips',
    'Hidden places, shortcuts, and practical tips for exploring on foot.',
    false,
    true
  ),
  (
    'a1000001-0001-4000-8000-000000000004',
    'travel_local',
    'Travel spots, viewpoints, and easy day-trip ideas.',
    false,
    true
  )
on conflict (id) do update
set username = excluded.username,
    bio = excluded.bio,
    is_private = excluded.is_private,
    is_demo = excluded.is_demo;

insert into posts (id, user_id, content, media_url, media_type, created_at)
values
  (
    'b2000001-0001-4000-8000-000000000001',
    'a1000001-0001-4000-8000-000000000002',
    'Tonight''s pick: a small trattoria on a side street with no sign out front. Ask for the daily special — the pasta is worth the wait.',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=900&q=80',
    'image',
    now() - interval '2 hours'
  ),
  (
    'b2000001-0001-4000-8000-000000000003',
    'a1000001-0001-4000-8000-000000000003',
    'Hidden courtyard behind the market — follow the blue gate, cut left at the fountain. Best light after 4pm for photos.',
    'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=900&q=80',
    'image',
    now() - interval '8 hours'
  ),
  (
    'b2000001-0001-4000-8000-000000000004',
    'a1000001-0001-4000-8000-000000000004',
    'Sunset viewpoint locals use: short hike, wide panorama, bring a jacket — wind picks up fast.',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=900&q=80',
    'image',
    now() - interval '12 hours'
  ),
  (
    'b2000001-0001-4000-8000-000000000005',
    'a1000001-0001-4000-8000-000000000002',
    'Street food lane opens at 6pm. Try the grilled skewers first, save room for the cinnamon dessert cart at the end.',
    null,
    null,
    now() - interval '18 hours'
  ),
  (
    'b2000001-0001-4000-8000-000000000006',
    'a1000001-0001-4000-8000-000000000003',
    'Free museum hour on Thursdays — queue early, head straight to the rooftop terrace for city views.',
    null,
    null,
    now() - interval '26 hours'
  )
on conflict (id) do update
set content = excluded.content,
    media_url = excluded.media_url,
    media_type = excluded.media_type,
    created_at = excluded.created_at;
