-- SpotDrop MVP database schema for Supabase

-- Countries available in the app.
create table if not exists countries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  slug text not null unique,
  emoji text,
  created_at timestamptz not null default now()
);

-- Cities that belong to a country.
create table if not exists cities (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  unique(country_id, slug)
);

-- User profiles linked to Supabase Auth users.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  username text not null unique,
  avatar_url text,
  cover_url text,
  bio text,
  date_of_birth date,
  gender text,
  is_online boolean not null default false,
  country_slug text,
  city_slug text,
  country_code text,
  city_id uuid references cities(id),
  is_private boolean not null default false,
  is_demo boolean not null default false,
  can_create_channels boolean not null default false,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists city_channels (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references cities(id) on delete cascade,
  created_by uuid not null references profiles(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_id, slug)
);

alter table if exists city_channels add column if not exists city_id uuid references cities(id) on delete cascade;
alter table if exists city_channels add column if not exists created_by uuid references profiles(id) on delete cascade;
alter table if exists city_channels add column if not exists name text;
alter table if exists city_channels add column if not exists slug text;
alter table if exists city_channels add column if not exists description text;
alter table if exists city_channels add column if not exists visibility text not null default 'public';
alter table if exists city_channels add column if not exists created_at timestamptz not null default now();
alter table if exists city_channels add column if not exists updated_at timestamptz not null default now();
alter table if exists city_channels drop constraint if exists city_channels_visibility_check;
alter table if exists city_channels
  add constraint city_channels_visibility_check
  check (visibility in ('public', 'private'));

create table if not exists city_channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references city_channels(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table if exists city_channel_messages add column if not exists channel_id uuid references city_channels(id) on delete cascade;
alter table if exists city_channel_messages add column if not exists user_id uuid references profiles(id) on delete cascade;
alter table if exists city_channel_messages add column if not exists content text;
alter table if exists city_channel_messages add column if not exists created_at timestamptz not null default now();

alter table if exists profiles add column if not exists is_private boolean not null default false;
alter table if exists profiles add column if not exists is_demo boolean not null default false;
alter table if exists profiles add column if not exists can_create_channels boolean not null default false;
alter table if exists profiles add column if not exists is_verified boolean not null default false;
alter table if exists profiles add column if not exists name text;
alter table if exists profiles add column if not exists gender text;
alter table if exists profiles add column if not exists date_of_birth date;
alter table if exists profiles add column if not exists cover_url text;
alter table if exists profiles add column if not exists is_online boolean not null default false;
alter table if exists profiles add column if not exists country_slug text;
alter table if exists profiles add column if not exists city_slug text;
alter table if exists profiles drop constraint if exists profiles_gender_check;
alter table if exists profiles
  add constraint profiles_gender_check
  check (gender is null or gender in ('male', 'female', 'prefer_not_to_say'));
update profiles set is_online = false where is_online is null;
update profiles set can_create_channels = false where can_create_channels is null;
update profiles set is_verified = false where is_verified is null;
alter table if exists profiles alter column can_create_channels set default false;
alter table if exists profiles alter column can_create_channels set not null;
alter table if exists profiles alter column is_verified set default false;
alter table if exists profiles alter column is_verified set not null;
update profiles set country_slug = country_code where country_slug is null and country_code is not null;

create or replace function public.prevent_profile_permission_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = new.id and coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT'
      and (
        coalesce(new.can_create_channels, false)
        or coalesce(new.is_verified, false)
      )
    then
      raise exception 'Profile trust badges can only be changed by an administrator.';
    end if;

    if tg_op = 'UPDATE'
      and (
        new.can_create_channels is distinct from old.can_create_channels
        or new.is_verified is distinct from old.is_verified
      )
    then
      raise exception 'Profile trust badges can only be changed by an administrator.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_permission_self_update on public.profiles;
create trigger prevent_profile_permission_self_update
before insert or update of can_create_channels, is_verified on public.profiles
for each row
execute function public.prevent_profile_permission_self_update();

-- User publications/posts.
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null default '',
  image_url text,
  video_url text,
  media_url text,
  media_type text check (media_type is null or media_type in ('image', 'video')),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists posts add column if not exists image_url text;
alter table if exists posts add column if not exists video_url text;
alter table if exists posts add column if not exists media_url text;
alter table if exists posts add column if not exists media_type text;
alter table if exists posts add column if not exists visibility text not null default 'public';
alter table if exists posts drop constraint if exists posts_visibility_check;
alter table if exists posts
  add constraint posts_visibility_check
  check (visibility in ('public', 'private'));
alter table if exists posts alter column content set default '';

create table if not exists guide_places (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade unique,
  title text not null,
  location_name text,
  canton text,
  city text,
  description text,
  opening_hours text,
  price_info text,
  official_url text,
  read_more_text text,
  media_url text,
  media_type text check (media_type is null or media_type in ('image', 'video')),
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists guide_places add column if not exists post_id uuid references posts(id) on delete cascade;
alter table if exists guide_places add column if not exists title text;
alter table if exists guide_places add column if not exists location_name text;
alter table if exists guide_places add column if not exists canton text;
alter table if exists guide_places add column if not exists city text;
alter table if exists guide_places add column if not exists description text;
alter table if exists guide_places add column if not exists opening_hours text;
alter table if exists guide_places add column if not exists price_info text;
alter table if exists guide_places add column if not exists official_url text;
alter table if exists guide_places add column if not exists read_more_text text;
alter table if exists guide_places add column if not exists media_url text;
alter table if exists guide_places add column if not exists media_type text;
alter table if exists guide_places add column if not exists source_url text;
alter table if exists guide_places add column if not exists created_at timestamptz not null default now();
alter table if exists guide_places add column if not exists updated_at timestamptz not null default now();
alter table if exists guide_places drop constraint if exists guide_places_media_type_check;
alter table if exists guide_places
  add constraint guide_places_media_type_check
  check (media_type is null or media_type in ('image', 'video'));
create unique index if not exists guide_places_post_id_key on guide_places(post_id);
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'guide_places_post_id_unique'
      and conrelid = 'public.guide_places'::regclass
  ) then
    alter table public.guide_places
      add constraint guide_places_post_id_unique unique using index guide_places_post_id_key;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'image_url'
  ) then
    execute $sql$
      update posts
      set media_url = image_url,
          media_type = 'image'
      where image_url is not null
        and media_url is null
    $sql$;
  end if;
end $$;

-- Comments on posts.
create table if not exists post_comments (
  id bigint generated always as identity primary key,
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamp with time zone default now(),
  edited_at timestamp with time zone
);

create index if not exists idx_post_comments_post_id_created_at on post_comments(post_id, created_at asc);

-- Reactions on posts (like, useful).
create table if not exists post_reactions (
  id bigint generated always as identity primary key,
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'useful')),
  created_at timestamp with time zone default now()
);

-- Older databases may have created this column as "type"; the app uses reaction_type everywhere.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'post_reactions'
      and column_name = 'type'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'post_reactions'
      and column_name = 'reaction_type'
  ) then
    alter table public.post_reactions rename column "type" to reaction_type;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'post_reactions'
      and column_name = 'type'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'post_reactions'
      and column_name = 'reaction_type'
  ) then
    update public.post_reactions
    set reaction_type = coalesce(reaction_type, "type")
    where reaction_type is null;

    alter table public.post_reactions drop column "type";
  end if;
end $$;

alter table if exists post_reactions add column if not exists reaction_type text;
delete from post_reactions where reaction_type is null;
alter table if exists post_reactions alter column reaction_type set not null;
alter table if exists post_reactions drop constraint if exists post_reactions_reaction_type_check;
alter table if exists post_reactions
  add constraint post_reactions_reaction_type_check
  check (reaction_type in ('like', 'useful'));

-- Drop any uniqueness enforcer a previous run may have left behind (table constraint or plain
-- index, current or older pre-rename name) so the dedup + index creation below is re-run safe.
alter table if exists post_reactions drop constraint if exists post_reactions_post_id_user_id_type_key;
alter table if exists post_reactions drop constraint if exists post_reactions_post_id_user_id_reaction_type_key;
drop index if exists post_reactions_post_id_user_id_type_key;
drop index if exists post_reactions_post_id_user_id_reaction_type_key;
drop index if exists idx_post_reactions_unique_post_user_reaction;

-- Deduplicate (post_id, user_id, reaction_type) before enforcing uniqueness: keep only the
-- oldest row per group (by created_at, then id as a stable tie-breaker), never across different
-- users or posts — see database/add-post-reactions.sql for the full explanation.
with ranked_reactions as (
  select
    id,
    row_number() over (
      partition by post_id, user_id, reaction_type
      order by created_at asc, id asc
    ) as row_number
  from post_reactions
)
delete from post_reactions
where id in (
  select id
  from ranked_reactions
  where row_number > 1
);

create unique index if not exists idx_post_reactions_unique_post_user_reaction
  on post_reactions (post_id, user_id, reaction_type);

create index if not exists idx_post_reactions_post_id on post_reactions(post_id);

-- Follow relationships between users.
create table if not exists follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references profiles(id) on delete cascade,
  following_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint follows_no_self_follow check (follower_id <> following_id)
);

alter table if exists follows add column if not exists follower_id uuid references profiles(id) on delete cascade;
alter table if exists follows add column if not exists following_id uuid references profiles(id) on delete cascade;
alter table if exists follows add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'follows_no_self_follow'
  ) then
    alter table public.follows
      add constraint follows_no_self_follow
      check (follower_id <> following_id);
  end if;
end $$;

-- City chat messages.
create table if not exists city_messages (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references cities(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'city_messages'
      and column_name = 'sender_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'city_messages'
      and column_name = 'user_id'
  ) then
    execute 'alter table public.city_messages rename column sender_id to user_id';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'city_messages'
      and column_name = 'body'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'city_messages'
      and column_name = 'content'
  ) then
    execute 'alter table public.city_messages rename column body to content';
  end if;
end $$;

alter table if exists city_messages add column if not exists user_id uuid references profiles(id) on delete cascade;
alter table if exists city_messages add column if not exists content text;
alter table if exists city_messages add column if not exists created_at timestamptz not null default now();
alter table if exists city_messages add column if not exists edited_at timestamptz;

-- Direct messages between two users.
create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- Older databases may have created this column as receiver_id; the app uses recipient_id everywhere.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'direct_messages'
      and column_name = 'receiver_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'direct_messages'
      and column_name = 'recipient_id'
  ) then
    alter table public.direct_messages rename column receiver_id to recipient_id;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'direct_messages'
      and column_name = 'receiver_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'direct_messages'
      and column_name = 'recipient_id'
  ) then
    update public.direct_messages
    set recipient_id = coalesce(recipient_id, receiver_id)
    where recipient_id is null;

    alter table public.direct_messages drop column receiver_id;
  end if;
end $$;

alter table if exists direct_messages add column if not exists recipient_id uuid references profiles(id) on delete cascade;
alter table if exists direct_messages add column if not exists body text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'direct_messages'
      and column_name = 'content'
  ) then
    update public.direct_messages
    set body = coalesce(body, content)
    where body is null;

    alter table public.direct_messages drop column content;
  end if;
end $$;

delete from direct_messages where recipient_id is null;
delete from direct_messages where body is null or btrim(body) = '';
alter table if exists direct_messages alter column recipient_id set not null;
alter table if exists direct_messages alter column body set not null;
alter table if exists direct_messages drop column if exists receiver_id;
alter table if exists direct_messages drop column if exists content;

drop index if exists idx_city_messages_city_id_created_at;
create index if not exists idx_city_messages_city_id_created_at on city_messages(city_id, created_at asc);
drop index if exists idx_direct_messages_receiver_id_created_at;
create index if not exists idx_direct_messages_recipient_id_created_at on direct_messages(recipient_id, created_at desc);
create index if not exists idx_posts_user_id_created_at on posts(user_id, created_at desc);
create unique index if not exists idx_follows_follower_following_unique on follows(follower_id, following_id);
create index if not exists idx_follows_following_id_created_at on follows(following_id, created_at desc);
create index if not exists idx_follows_follower_id_created_at on follows(follower_id, created_at desc);

-- Seed countries and cities for Europe, Russia, and CIS.
insert into countries (name, code, slug, emoji) values
  ('Switzerland', 'CH', 'switzerland', '🇨🇭'),
  ('Germany', 'DE', 'germany', '🇩🇪'),
  ('France', 'FR', 'france', '🇫🇷'),
  ('Italy', 'IT', 'italy', '🇮🇹'),
  ('Spain', 'ES', 'spain', '🇪🇸'),
  ('United Kingdom', 'GB', 'united-kingdom', '🇬🇧'),
  ('United States', 'US', 'united-states', '🇺🇸'),
  ('Netherlands', 'NL', 'netherlands', '🇳🇱'),
  ('Belgium', 'BE', 'belgium', '🇧🇪'),
  ('Austria', 'AT', 'austria', '🇦🇹'),
  ('Sweden', 'SE', 'sweden', '🇸🇪'),
  ('Norway', 'NO', 'norway', '🇳🇴'),
  ('Denmark', 'DK', 'denmark', '🇩🇰'),
  ('Finland', 'FI', 'finland', '🇫🇮'),
  ('Poland', 'PL', 'poland', '🇵🇱'),
  ('Czech Republic', 'CZ', 'czech-republic', '🇨🇿'),
  ('Hungary', 'HU', 'hungary', '🇭🇺'),
  ('Greece', 'GR', 'greece', '🇬🇷'),
  ('Portugal', 'PT', 'portugal', '🇵🇹'),
  ('Ireland', 'IE', 'ireland', '🇮🇪'),
  ('Russia', 'RU', 'russia', '🇷🇺'),
  ('Ukraine', 'UA', 'ukraine', '🇺🇦'),
  ('Belarus', 'BY', 'belarus', '🇧🇾'),
  ('Kazakhstan', 'KZ', 'kazakhstan', '🇰🇿'),
  ('Azerbaijan', 'AZ', 'azerbaijan', '🇦🇿'),
  ('Armenia', 'AM', 'armenia', '🇦🇲'),
  ('Georgia', 'GE', 'georgia', '🇬🇪'),
  ('Moldova', 'MD', 'moldova', '🇲🇩'),
  ('Latvia', 'LV', 'latvia', '🇱🇻'),
  ('Lithuania', 'LT', 'lithuania', '🇱🇹'),
  ('Estonia', 'EE', 'estonia', '🇪🇪'),
  ('Romania', 'RO', 'romania', '🇷🇴'),
  ('Bulgaria', 'BG', 'bulgaria', '🇧🇬'),
  ('Serbia', 'RS', 'serbia', '🇷🇸'),
  ('Croatia', 'HR', 'croatia', '🇭🇷'),
  ('Slovenia', 'SI', 'slovenia', '🇸🇮'),
  ('Slovakia', 'SK', 'slovakia', '🇸🇰'),
  ('Bosnia and Herzegovina', 'BA', 'bosnia-and-herzegovina', '🇧🇦'),
  ('Montenegro', 'ME', 'montenegro', '🇲🇪'),
  ('North Macedonia', 'MK', 'north-macedonia', '🇲🇰'),
  ('Albania', 'AL', 'albania', '🇦🇱'),
  ('Kosovo', 'XK', 'kosovo', '🇽🇰'),
  ('Cyprus', 'CY', 'cyprus', '🇨🇾'),
  ('Malta', 'MT', 'malta', '🇲🇹'),
  ('Iceland', 'IS', 'iceland', '🇮🇸'),
  ('Luxembourg', 'LU', 'luxembourg', '🇱🇺'),
  ('Monaco', 'MC', 'monaco', '🇲🇨'),
  ('Andorra', 'AD', 'andorra', '🇦🇩'),
  ('San Marino', 'SM', 'san-marino', '🇸🇲'),
  ('Vatican City', 'VA', 'vatican-city', '🇻🇦'),
  ('Liechtenstein', 'LI', 'liechtenstein', '🇱🇮'),
  ('Kyrgyzstan', 'KG', 'kyrgyzstan', '🇰🇬'),
  ('Tajikistan', 'TJ', 'tajikistan', '🇹🇯'),
  ('Turkmenistan', 'TM', 'turkmenistan', '🇹🇲'),
  ('Uzbekistan', 'UZ', 'uzbekistan', '🇺🇿')
on conflict (code) do nothing;

update countries
set emoji = case slug
  when 'switzerland' then '🇨🇭'
  when 'germany' then '🇩🇪'
  when 'france' then '🇫🇷'
  when 'italy' then '🇮🇹'
  when 'spain' then '🇪🇸'
  when 'united-kingdom' then '🇬🇧'
  when 'united-states' then '🇺🇸'
  when 'netherlands' then '🇳🇱'
  when 'belgium' then '🇧🇪'
  when 'austria' then '🇦🇹'
  when 'sweden' then '🇸🇪'
  when 'norway' then '🇳🇴'
  when 'denmark' then '🇩🇰'
  when 'finland' then '🇫🇮'
  when 'poland' then '🇵🇱'
  when 'czech-republic' then '🇨🇿'
  when 'hungary' then '🇭🇺'
  when 'greece' then '🇬🇷'
  when 'portugal' then '🇵🇹'
  when 'ireland' then '🇮🇪'
  when 'russia' then '🇷🇺'
  when 'ukraine' then '🇺🇦'
  when 'belarus' then '🇧🇾'
  when 'kazakhstan' then '🇰🇿'
  when 'azerbaijan' then '🇦🇿'
  when 'armenia' then '🇦🇲'
  when 'georgia' then '🇬🇪'
  when 'moldova' then '🇲🇩'
  when 'latvia' then '🇱🇻'
  when 'lithuania' then '🇱🇹'
  when 'estonia' then '🇪🇪'
  when 'romania' then '🇷🇴'
  when 'bulgaria' then '🇧🇬'
  when 'serbia' then '🇷🇸'
  when 'croatia' then '🇭🇷'
  when 'slovenia' then '🇸🇮'
  when 'slovakia' then '🇸🇰'
  when 'bosnia-and-herzegovina' then '🇧🇦'
  when 'montenegro' then '🇲🇪'
  when 'north-macedonia' then '🇲🇰'
  when 'albania' then '🇦🇱'
  when 'kosovo' then '🇽🇰'
  when 'cyprus' then '🇨🇾'
  when 'malta' then '🇲🇹'
  when 'iceland' then '🇮🇸'
  when 'luxembourg' then '🇱🇺'
  when 'monaco' then '🇲🇨'
  when 'andorra' then '🇦🇩'
  when 'san-marino' then '🇸🇲'
  when 'vatican-city' then '🇻🇦'
  when 'liechtenstein' then '🇱🇮'
  when 'kyrgyzstan' then '🇰🇬'
  when 'tajikistan' then '🇹🇯'
  when 'turkmenistan' then '🇹🇲'
  when 'uzbekistan' then '🇺🇿'
  else emoji
end
where emoji is null or emoji = '🌍';

insert into cities (country_id, name, slug) values
  ((select id from countries where slug = 'switzerland'), 'Aarau', 'aarau'),
  ((select id from countries where slug = 'switzerland'), 'Baden', 'baden'),
  ((select id from countries where slug = 'switzerland'), 'Basel', 'basel'),
  ((select id from countries where slug = 'switzerland'), 'Bellinzona', 'bellinzona'),
  ((select id from countries where slug = 'switzerland'), 'Bern', 'bern'),
  ((select id from countries where slug = 'switzerland'), 'Biel/Bienne', 'biel-bienne'),
  ((select id from countries where slug = 'switzerland'), 'Chur', 'chur'),
  ((select id from countries where slug = 'switzerland'), 'Fribourg', 'fribourg'),
  ((select id from countries where slug = 'switzerland'), 'Geneva', 'geneva'),
  ((select id from countries where slug = 'switzerland'), 'Interlaken', 'interlaken'),
  ((select id from countries where slug = 'switzerland'), 'Lausanne', 'lausanne'),
  ((select id from countries where slug = 'switzerland'), 'Locarno', 'locarno'),
  ((select id from countries where slug = 'switzerland'), 'Lucerne', 'lucerne'),
  ((select id from countries where slug = 'switzerland'), 'Lugano', 'lugano'),
  ((select id from countries where slug = 'switzerland'), 'Montreux', 'montreux'),
  ((select id from countries where slug = 'switzerland'), 'Murten', 'murten'),
  ((select id from countries where slug = 'switzerland'), 'Neuchâtel', 'neuchatel'),
  ((select id from countries where slug = 'switzerland'), 'Sion', 'sion'),
  ((select id from countries where slug = 'switzerland'), 'St. Gallen', 'st-gallen'),
  ((select id from countries where slug = 'switzerland'), 'Thun', 'thun'),
  ((select id from countries where slug = 'switzerland'), 'Winterthur', 'winterthur'),
  ((select id from countries where slug = 'switzerland'), 'Zug', 'zug'),
  ((select id from countries where slug = 'switzerland'), 'Zurich', 'zurich'),
  ((select id from countries where code = 'DE'), 'Berlin', 'berlin'),
  ((select id from countries where code = 'DE'), 'Munich', 'munich'),
  ((select id from countries where code = 'DE'), 'Hamburg', 'hamburg'),
  ((select id from countries where code = 'DE'), 'Frankfurt', 'frankfurt'),
  ((select id from countries where code = 'DE'), 'Cologne', 'cologne'),
  ((select id from countries where code = 'DE'), 'Stuttgart', 'stuttgart'),
  ((select id from countries where code = 'FR'), 'Paris', 'paris'),
  ((select id from countries where code = 'FR'), 'Marseille', 'marseille'),
  ((select id from countries where code = 'FR'), 'Lyon', 'lyon'),
  ((select id from countries where code = 'FR'), 'Toulouse', 'toulouse'),
  ((select id from countries where code = 'FR'), 'Nice', 'nice'),
  ((select id from countries where code = 'FR'), 'Bordeaux', 'bordeaux'),
  ((select id from countries where code = 'IT'), 'Rome', 'rome'),
  ((select id from countries where code = 'IT'), 'Milan', 'milan'),
  ((select id from countries where code = 'IT'), 'Naples', 'naples'),
  ((select id from countries where code = 'IT'), 'Turin', 'turin'),
  ((select id from countries where code = 'IT'), 'Venice', 'venice'),
  ((select id from countries where code = 'IT'), 'Florence', 'florence'),
  ((select id from countries where code = 'ES'), 'Madrid', 'madrid'),
  ((select id from countries where code = 'ES'), 'Barcelona', 'barcelona'),
  ((select id from countries where code = 'ES'), 'Valencia', 'valencia'),
  ((select id from countries where code = 'ES'), 'Seville', 'seville'),
  ((select id from countries where code = 'ES'), 'Malaga', 'malaga'),
  ((select id from countries where code = 'ES'), 'Bilbao', 'bilbao'),
  ((select id from countries where code = 'GB'), 'London', 'london'),
  ((select id from countries where code = 'GB'), 'Manchester', 'manchester'),
  ((select id from countries where code = 'GB'), 'Edinburgh', 'edinburgh'),
  ((select id from countries where code = 'GB'), 'Birmingham', 'birmingham'),
  ((select id from countries where code = 'GB'), 'Glasgow', 'glasgow'),
  ((select id from countries where code = 'GB'), 'Bristol', 'bristol'),
  ((select id from countries where code = 'NL'), 'Amsterdam', 'amsterdam'),
  ((select id from countries where code = 'NL'), 'Rotterdam', 'rotterdam'),
  ((select id from countries where code = 'NL'), 'The Hague', 'the-hague'),
  ((select id from countries where code = 'NL'), 'Utrecht', 'utrecht'),
  ((select id from countries where code = 'NL'), 'Eindhoven', 'eindhoven'),
  ((select id from countries where code = 'BE'), 'Brussels', 'brussels'),
  ((select id from countries where code = 'BE'), 'Antwerp', 'antwerp'),
  ((select id from countries where code = 'BE'), 'Ghent', 'ghent'),
  ((select id from countries where code = 'BE'), 'Bruges', 'bruges'),
  ((select id from countries where code = 'BE'), 'Liege', 'liege'),
  ((select id from countries where code = 'AT'), 'Vienna', 'vienna'),
  ((select id from countries where code = 'AT'), 'Graz', 'graz'),
  ((select id from countries where code = 'AT'), 'Salzburg', 'salzburg'),
  ((select id from countries where code = 'AT'), 'Innsbruck', 'innsbruck'),
  ((select id from countries where code = 'AT'), 'Linz', 'linz'),
  ((select id from countries where code = 'SE'), 'Stockholm', 'stockholm'),
  ((select id from countries where code = 'SE'), 'Gothenburg', 'gothenburg'),
  ((select id from countries where code = 'SE'), 'Malmo', 'malmo'),
  ((select id from countries where code = 'SE'), 'Uppsala', 'uppsala'),
  ((select id from countries where code = 'SE'), 'Linkoping', 'linkoping'),
  ((select id from countries where code = 'NO'), 'Oslo', 'oslo'),
  ((select id from countries where code = 'NO'), 'Bergen', 'bergen'),
  ((select id from countries where code = 'NO'), 'Trondheim', 'trondheim'),
  ((select id from countries where code = 'NO'), 'Stavanger', 'stavanger'),
  ((select id from countries where code = 'NO'), 'Tromso', 'tromso'),
  ((select id from countries where code = 'DK'), 'Copenhagen', 'copenhagen'),
  ((select id from countries where code = 'DK'), 'Aarhus', 'aarhus'),
  ((select id from countries where code = 'DK'), 'Odense', 'odense'),
  ((select id from countries where code = 'DK'), 'Aalborg', 'aalborg'),
  ((select id from countries where code = 'DK'), 'Esbjerg', 'esbjerg'),
  ((select id from countries where code = 'FI'), 'Helsinki', 'helsinki'),
  ((select id from countries where code = 'FI'), 'Espoo', 'espoo'),
  ((select id from countries where code = 'FI'), 'Tampere', 'tampere'),
  ((select id from countries where code = 'FI'), 'Turku', 'turku'),
  ((select id from countries where code = 'FI'), 'Oulu', 'oulu'),
  ((select id from countries where code = 'PL'), 'Warsaw', 'warsaw'),
  ((select id from countries where code = 'PL'), 'Krakow', 'krakow'),
  ((select id from countries where code = 'PL'), 'Wroclaw', 'wroclaw'),
  ((select id from countries where code = 'PL'), 'Gdansk', 'gdansk'),
  ((select id from countries where code = 'PL'), 'Poznan', 'poznan'),
  ((select id from countries where code = 'CZ'), 'Prague', 'prague'),
  ((select id from countries where code = 'CZ'), 'Brno', 'brno'),
  ((select id from countries where code = 'CZ'), 'Ostrava', 'ostrava'),
  ((select id from countries where code = 'CZ'), 'Plzen', 'plzen'),
  ((select id from countries where code = 'CZ'), 'Olomouc', 'olomouc'),
  ((select id from countries where code = 'HU'), 'Budapest', 'budapest'),
  ((select id from countries where code = 'HU'), 'Debrecen', 'debrecen'),
  ((select id from countries where code = 'HU'), 'Szeged', 'szeged'),
  ((select id from countries where code = 'HU'), 'Miskolc', 'miskolc'),
  ((select id from countries where code = 'HU'), 'Pecs', 'pecs'),
  ((select id from countries where code = 'GR'), 'Athens', 'athens'),
  ((select id from countries where code = 'GR'), 'Thessaloniki', 'thessaloniki'),
  ((select id from countries where code = 'GR'), 'Patras', 'patras'),
  ((select id from countries where code = 'GR'), 'Heraklion', 'heraklion'),
  ((select id from countries where code = 'GR'), 'Larissa', 'larissa'),
  ((select id from countries where code = 'PT'), 'Lisbon', 'lisbon'),
  ((select id from countries where code = 'PT'), 'Porto', 'porto'),
  ((select id from countries where code = 'PT'), 'Faro', 'faro'),
  ((select id from countries where code = 'PT'), 'Braga', 'braga'),
  ((select id from countries where code = 'PT'), 'Coimbra', 'coimbra'),
  ((select id from countries where code = 'IE'), 'Dublin', 'dublin'),
  ((select id from countries where code = 'IE'), 'Cork', 'cork'),
  ((select id from countries where code = 'IE'), 'Galway', 'galway'),
  ((select id from countries where code = 'IE'), 'Limerick', 'limerick'),
  ((select id from countries where code = 'IE'), 'Waterford', 'waterford'),
  ((select id from countries where code = 'RU'), 'Chechen Republic', 'chechen-republic'),
  ((select id from countries where code = 'RU'), 'Dagestan', 'dagestan'),
  ((select id from countries where code = 'RU'), 'Ingushetia', 'ingushetia'),
  ((select id from countries where code = 'RU'), 'Krasnodar', 'krasnodar'),
  ((select id from countries where code = 'RU'), 'Moscow', 'moscow'),
  ((select id from countries where code = 'RU'), 'Saint Petersburg', 'saint-petersburg'),
  ((select id from countries where code = 'RU'), 'Tatarstan', 'tatarstan'),
  ((select id from countries where code = 'UA'), 'Kyiv', 'kyiv'),
  ((select id from countries where code = 'UA'), 'Lviv', 'lviv'),
  ((select id from countries where code = 'UA'), 'Odesa', 'odesa'),
  ((select id from countries where code = 'UA'), 'Kharkiv', 'kharkiv'),
  ((select id from countries where code = 'UA'), 'Dnipro', 'dnipro'),
  ((select id from countries where code = 'UA'), 'Zaporizhzhia', 'zaporizhzhia'),
  ((select id from countries where code = 'BY'), 'Minsk', 'minsk'),
  ((select id from countries where code = 'BY'), 'Brest', 'brest'),
  ((select id from countries where code = 'BY'), 'Grodno', 'grodno'),
  ((select id from countries where code = 'BY'), 'Gomel', 'gomel'),
  ((select id from countries where code = 'BY'), 'Mogilev', 'mogilev'),
  ((select id from countries where code = 'KZ'), 'Almaty', 'almaty'),
  ((select id from countries where code = 'KZ'), 'Nur-Sultan', 'nur-sultan'),
  ((select id from countries where code = 'KZ'), 'Shymkent', 'shymkent'),
  ((select id from countries where code = 'KZ'), 'Karaganda', 'karaganda'),
  ((select id from countries where code = 'KZ'), 'Aktobe', 'aktobe'),
  ((select id from countries where code = 'AZ'), 'Baku', 'baku'),
  ((select id from countries where code = 'AZ'), 'Ganja', 'ganja'),
  ((select id from countries where code = 'AZ'), 'Sumqayit', 'sumqayit'),
  ((select id from countries where code = 'AZ'), 'Mingachevir', 'mingachevir'),
  ((select id from countries where code = 'AZ'), 'Lankaran', 'lankaran'),
  ((select id from countries where code = 'AM'), 'Yerevan', 'yerevan'),
  ((select id from countries where code = 'AM'), 'Gyumri', 'gyumri'),
  ((select id from countries where code = 'AM'), 'Vanadzor', 'vanadzor'),
  ((select id from countries where code = 'AM'), 'Vagharshapat', 'vagharshapat'),
  ((select id from countries where code = 'AM'), 'Hrazdan', 'hrazdan'),
  ((select id from countries where code = 'GE'), 'Tbilisi', 'tbilisi'),
  ((select id from countries where code = 'GE'), 'Batumi', 'batumi'),
  ((select id from countries where code = 'GE'), 'Kutaisi', 'kutaisi'),
  ((select id from countries where code = 'GE'), 'Rustavi', 'rustavi'),
  ((select id from countries where code = 'GE'), 'Zugdidi', 'zugdidi'),
  ((select id from countries where code = 'MD'), 'Chisinau', 'chisinau'),
  ((select id from countries where code = 'MD'), 'Tiraspol', 'tiraspol'),
  ((select id from countries where code = 'MD'), 'Balti', 'balti'),
  ((select id from countries where code = 'MD'), 'Cahul', 'cahul'),
  ((select id from countries where code = 'MD'), 'Orhei', 'orhei'),
  ((select id from countries where code = 'LV'), 'Riga', 'riga'),
  ((select id from countries where code = 'LV'), 'Daugavpils', 'daugavpils'),
  ((select id from countries where code = 'LV'), 'Liepaja', 'liepaja'),
  ((select id from countries where code = 'LV'), 'Jelgava', 'jelgava'),
  ((select id from countries where code = 'LV'), 'Jurmala', 'jurmala'),
  ((select id from countries where code = 'LT'), 'Vilnius', 'vilnius'),
  ((select id from countries where code = 'LT'), 'Kaunas', 'kaunas'),
  ((select id from countries where code = 'LT'), 'Klaipeda', 'klaipeda'),
  ((select id from countries where code = 'LT'), 'Siauliai', 'siauliai'),
  ((select id from countries where code = 'LT'), 'Panevezys', 'panevezys'),
  ((select id from countries where code = 'EE'), 'Tallinn', 'tallinn'),
  ((select id from countries where code = 'EE'), 'Tartu', 'tartu'),
  ((select id from countries where code = 'EE'), 'Narva', 'narva'),
  ((select id from countries where code = 'EE'), 'Parnu', 'parnu'),
  ((select id from countries where code = 'EE'), 'Viljandi', 'viljandi'),
  ((select id from countries where code = 'RO'), 'Bucharest', 'bucharest'),
  ((select id from countries where code = 'RO'), 'Cluj-Napoca', 'cluj-napoca'),
  ((select id from countries where code = 'RO'), 'Timisoara', 'timisoara'),
  ((select id from countries where code = 'RO'), 'Iasi', 'iasi'),
  ((select id from countries where code = 'RO'), 'Brasov', 'brasov'),
  ((select id from countries where code = 'BG'), 'Sofia', 'sofia'),
  ((select id from countries where code = 'BG'), 'Plovdiv', 'plovdiv'),
  ((select id from countries where code = 'BG'), 'Varna', 'varna'),
  ((select id from countries where code = 'BG'), 'Burgas', 'burgas'),
  ((select id from countries where code = 'BG'), 'Ruse', 'ruse'),
  ((select id from countries where code = 'RS'), 'Belgrade', 'belgrade'),
  ((select id from countries where code = 'RS'), 'Novi Sad', 'novi-sad'),
  ((select id from countries where code = 'RS'), 'Nis', 'nis'),
  ((select id from countries where code = 'RS'), 'Kragujevac', 'kragujevac'),
  ((select id from countries where code = 'RS'), 'Subotica', 'subotica'),
  ((select id from countries where code = 'HR'), 'Zagreb', 'zagreb'),
  ((select id from countries where code = 'HR'), 'Split', 'split'),
  ((select id from countries where code = 'HR'), 'Dubrovnik', 'dubrovnik'),
  ((select id from countries where code = 'HR'), 'Rijeka', 'rijeka'),
  ((select id from countries where code = 'HR'), 'Osijek', 'osijek'),
  ((select id from countries where code = 'SI'), 'Ljubljana', 'ljubljana'),
  ((select id from countries where code = 'SI'), 'Maribor', 'maribor'),
  ((select id from countries where code = 'SI'), 'Celje', 'celje'),
  ((select id from countries where code = 'SI'), 'Kranj', 'kranj'),
  ((select id from countries where code = 'SI'), 'Novo Mesto', 'novo-mesto'),
  ((select id from countries where code = 'SK'), 'Bratislava', 'bratislava'),
  ((select id from countries where code = 'SK'), 'Kosice', 'kosice'),
  ((select id from countries where code = 'SK'), 'Presov', 'presov'),
  ((select id from countries where code = 'SK'), 'Nitra', 'nitra'),
  ((select id from countries where code = 'SK'), 'Zilina', 'zilina'),
  ((select id from countries where code = 'BA'), 'Sarajevo', 'sarajevo'),
  ((select id from countries where code = 'BA'), 'Banja Luka', 'banja-luka'),
  ((select id from countries where code = 'BA'), 'Mostar', 'mostar'),
  ((select id from countries where code = 'BA'), 'Tuzla', 'tuzla'),
  ((select id from countries where code = 'BA'), 'Zenica', 'zenica'),
  ((select id from countries where code = 'ME'), 'Podgorica', 'podgorica'),
  ((select id from countries where code = 'ME'), 'Niksic', 'niksic'),
  ((select id from countries where code = 'ME'), 'Herceg Novi', 'herceg-novi'),
  ((select id from countries where code = 'ME'), 'Bar', 'bar'),
  ((select id from countries where code = 'ME'), 'Budva', 'budva'),
  ((select id from countries where code = 'MK'), 'Skopje', 'skopje'),
  ((select id from countries where code = 'MK'), 'Bitola', 'bitola'),
  ((select id from countries where code = 'MK'), 'Ohrid', 'ohrid'),
  ((select id from countries where code = 'MK'), 'Kumanovo', 'kumanovo'),
  ((select id from countries where code = 'MK'), 'Tetovo', 'tetovo'),
  ((select id from countries where code = 'AL'), 'Tirana', 'tirana'),
  ((select id from countries where code = 'AL'), 'Durres', 'durres'),
  ((select id from countries where code = 'AL'), 'Vlore', 'vlore'),
  ((select id from countries where code = 'AL'), 'Shkoder', 'shkoder'),
  ((select id from countries where code = 'AL'), 'Elbasan', 'elbasan'),
  ((select id from countries where code = 'CY'), 'Nicosia', 'nicosia'),
  ((select id from countries where code = 'CY'), 'Limassol', 'limassol'),
  ((select id from countries where code = 'CY'), 'Larnaca', 'larnaca'),
  ((select id from countries where code = 'CY'), 'Paphos', 'paphos'),
  ((select id from countries where code = 'CY'), 'Famagusta', 'famagusta'),
  ((select id from countries where code = 'MT'), 'Valletta', 'valletta'),
  ((select id from countries where code = 'MT'), 'Birkirkara', 'birkirkara'),
  ((select id from countries where code = 'MT'), 'Mosta', 'mosta'),
  ((select id from countries where code = 'MT'), 'Sliema', 'sliema'),
  ((select id from countries where code = 'MT'), 'St Julian&apos;s', 'st-julians'),
  ((select id from countries where code = 'IS'), 'Reykjavik', 'reykjavik'),
  ((select id from countries where code = 'IS'), 'Akureyri', 'akureyri'),
  ((select id from countries where code = 'IS'), 'Keflavik', 'keflavik'),
  ((select id from countries where code = 'IS'), 'Hafnarfjordur', 'hafnarfjordur'),
  ((select id from countries where code = 'IS'), 'Selfoss', 'selfoss'),
  ((select id from countries where code = 'LU'), 'Luxembourg', 'luxembourg'),
  ((select id from countries where code = 'LU'), 'Esch-sur-Alzette', 'esch-sur-alzette'),
  ((select id from countries where code = 'LU'), 'Differdange', 'differdange'),
  ((select id from countries where code = 'LU'), 'Dudelange', 'dudelange'),
  ((select id from countries where code = 'LU'), 'Ettelbruck', 'ettelbruck'),
  ((select id from countries where code = 'MC'), 'Monaco', 'monaco'),
  ((select id from countries where code = 'MC'), 'Fontvieille', 'fontvieille'),
  ((select id from countries where code = 'MC'), 'La Condamine', 'la-condamine'),
  ((select id from countries where code = 'MC'), 'Monte Carlo', 'monte-carlo'),
  ((select id from countries where code = 'AD'), 'Andorra la Vella', 'andorra-la-vella'),
  ((select id from countries where code = 'AD'), 'Escaldes-Engordany', 'escaldes-engordany'),
  ((select id from countries where code = 'AD'), 'Encamp', 'encamp'),
  ((select id from countries where code = 'AD'), 'Sant Julia de Loria', 'sant-julia-de-loria'),
  ((select id from countries where code = 'SM'), 'San Marino', 'san-marino'),
  ((select id from countries where code = 'SM'), 'Serravalle', 'serravalle'),
  ((select id from countries where code = 'SM'), 'Borgo Maggiore', 'borgo-maggiore'),
  ((select id from countries where code = 'SM'), 'Domagnano', 'domagnano'),
  ((select id from countries where code = 'LI'), 'Vaduz', 'vaduz'),
  ((select id from countries where code = 'LI'), 'Schaan', 'schaan'),
  ((select id from countries where code = 'LI'), 'Balzers', 'balzers'),
  ((select id from countries where code = 'LI'), 'Eschen', 'eschen'),
  ((select id from countries where code = 'LI'), 'Triesen', 'triesen'),
  ((select id from countries where code = 'KG'), 'Bishkek', 'bishkek'),
  ((select id from countries where code = 'KG'), 'Osh', 'osh'),
  ((select id from countries where code = 'KG'), 'Jalal-Abad', 'jalal-abad'),
  ((select id from countries where code = 'KG'), 'Karakol', 'karakol'),
  ((select id from countries where code = 'KG'), 'Naryn', 'naryn'),
  ((select id from countries where code = 'TJ'), 'Dushanbe', 'dushanbe'),
  ((select id from countries where code = 'TJ'), 'Khujand', 'khujand'),
  ((select id from countries where code = 'TJ'), 'Kulob', 'kulob'),
  ((select id from countries where code = 'TJ'), 'Qurghonteppa', 'qurghonteppa'),
  ((select id from countries where code = 'TJ'), 'Istaravshan', 'istaravshan'),
  ((select id from countries where code = 'TM'), 'Ashgabat', 'ashgabat'),
  ((select id from countries where code = 'TM'), 'Turkmenabat', 'turkmenabat'),
  ((select id from countries where code = 'TM'), 'Mary', 'mary'),
  ((select id from countries where code = 'TM'), 'Balkanabat', 'balkanabat'),
  ((select id from countries where code = 'TM'), 'Dashoguz', 'dashoguz'),
  ((select id from countries where code = 'UZ'), 'Tashkent', 'tashkent'),
  ((select id from countries where code = 'UZ'), 'Samarkand', 'samarkand'),
  ((select id from countries where code = 'UZ'), 'Bukhara', 'bukhara'),
  ((select id from countries where code = 'UZ'), 'Namangan', 'namangan'),
  ((select id from countries where code = 'UZ'), 'Andijan', 'andijan')
on conflict (country_id, slug) do nothing;

-- Row level security policies for public chat and user profile access.
alter table if exists cities enable row level security;
drop policy if exists "Cities readable by authenticated users" on cities;
drop policy if exists "Verified users can create city channels" on cities;
drop policy if exists "Authenticated users can create city channels" on cities;

create policy "Cities readable by authenticated users"
on cities
for select
to authenticated
using (true);

alter table if exists city_channels enable row level security;
drop policy if exists "City channels readable by authenticated users" on city_channels;
drop policy if exists "Authenticated users can create city channels" on city_channels;

create policy "City channels readable by authenticated users"
on city_channels
for select
to authenticated
using (auth.role() = 'authenticated');

create policy "Authenticated users can create city channels"
on city_channels
for insert
to authenticated
with check (auth.uid() = created_by);

alter table if exists city_channel_messages enable row level security;
drop policy if exists "City channel messages readable by authenticated users" on city_channel_messages;
drop policy if exists "Authenticated users can send city channel messages" on city_channel_messages;

create policy "City channel messages readable by authenticated users"
on city_channel_messages
for select
to authenticated
using (auth.role() = 'authenticated');

create policy "Authenticated users can send city channel messages"
on city_channel_messages
for insert
to authenticated
with check (auth.uid() = user_id);

alter table if exists profiles enable row level security;
create policy if not exists "Allow authenticated profile insert" on profiles for insert with check (auth.uid() = id);
create policy if not exists "Allow profile read" on profiles for select using (true);
create policy if not exists "Allow profile update" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

alter table if exists posts enable row level security;
drop policy if exists "Allow post read" on posts;
create policy "Allow post read from public profiles"
on posts
for select
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = posts.user_id
      and (
        posts.user_id = auth.uid()
        or (
          coalesce(posts.visibility, 'public') = 'public'
          and coalesce(profiles.is_private, false) = false
        )
        or profiles.id = auth.uid()
      )
  )
);
create policy if not exists "Allow authenticated post insert" on posts for insert with check (auth.uid() = user_id);
create policy if not exists "Allow post owner update" on posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists "Allow post owner delete" on posts for delete using (auth.uid() = user_id);

alter table if exists guide_places enable row level security;
drop policy if exists "Authenticated users can read public guide places" on guide_places;
create policy "Authenticated users can read public guide places"
on guide_places
for select
to authenticated
using (
  exists (
    select 1
    from public.posts
    join public.profiles on profiles.id = posts.user_id
    where posts.id = guide_places.post_id
      and (
        posts.user_id = auth.uid()
        or (
          coalesce(posts.visibility, 'public') = 'public'
          and coalesce(profiles.is_private, false) = false
        )
      )
  )
);
drop policy if exists "Post owners can manage own guide places" on guide_places;
create policy "Post owners can manage own guide places"
on guide_places
for all
to authenticated
using (
  exists (
    select 1
    from public.posts
    where posts.id = guide_places.post_id
      and posts.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.posts
    where posts.id = guide_places.post_id
      and posts.user_id = auth.uid()
  )
);

alter table if exists post_comments enable row level security;
drop policy if exists "Post comments readable" on post_comments;
drop policy if exists "Users can create own comments" on post_comments;
drop policy if exists "Users can update own comments" on post_comments;
drop policy if exists "Users can delete own comments" on post_comments;
create policy "Post comments readable"
on post_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.posts
    join public.profiles on profiles.id = posts.user_id
    where posts.id = post_comments.post_id
      and (
        posts.user_id = auth.uid()
        or (
          coalesce(posts.visibility, 'public') = 'public'
          and coalesce(profiles.is_private, false) = false
        )
      )
  )
);
create policy "Users can create own comments"
on post_comments
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.posts
    join public.profiles on profiles.id = posts.user_id
    where posts.id = post_comments.post_id
      and (
        posts.user_id = auth.uid()
        or (
          coalesce(posts.visibility, 'public') = 'public'
          and coalesce(profiles.is_private, false) = false
        )
      )
  )
);
create policy "Users can update own comments"
on post_comments
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
create policy "Users can delete own comments"
on post_comments
for delete
to authenticated
using (auth.uid() = user_id);

alter table if exists post_reactions enable row level security;
drop policy if exists "Post reactions readable" on post_reactions;
drop policy if exists "Users can add own reactions" on post_reactions;
drop policy if exists "Users can remove own reactions" on post_reactions;
create policy "Post reactions readable"
on post_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.posts
    join public.profiles on profiles.id = posts.user_id
    where posts.id = post_reactions.post_id
      and (
        posts.user_id = auth.uid()
        or (
          coalesce(posts.visibility, 'public') = 'public'
          and coalesce(profiles.is_private, false) = false
        )
      )
  )
);
create policy "Users can add own reactions"
on post_reactions
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.posts
    join public.profiles on profiles.id = posts.user_id
    where posts.id = post_reactions.post_id
      and (
        posts.user_id = auth.uid()
        or (
          coalesce(posts.visibility, 'public') = 'public'
          and coalesce(profiles.is_private, false) = false
        )
      )
  )
);
create policy "Users can remove own reactions"
on post_reactions
for delete
to authenticated
using (auth.uid() = user_id);

alter table if exists follows enable row level security;
create policy if not exists "Allow follow read" on follows for select using (true);
create policy if not exists "Allow authenticated follow insert" on follows for insert with check (auth.uid() = follower_id);
create policy if not exists "Allow follow owner delete" on follows for delete using (auth.uid() = follower_id);
drop policy if exists "Allow followed user remove follower" on follows;
create policy "Allow followed user remove follower"
on follows
for delete
to authenticated
using (auth.uid() = following_id);

alter table if exists city_messages enable row level security;
drop policy if exists "Allow city message read" on city_messages;
drop policy if exists "Allow authenticated city message insert" on city_messages;
drop policy if exists "Allow city message owner update" on city_messages;
drop policy if exists "Allow city message owner delete" on city_messages;
drop policy if exists "Allow authenticated city message read" on city_messages;

create policy "Allow authenticated city message read"
on city_messages
for select
to authenticated
using (auth.role() = 'authenticated');

create policy "Allow authenticated city message insert"
on city_messages
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Allow city message owner update"
on city_messages
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Allow city message owner delete"
on city_messages
for delete
to authenticated
using (auth.uid() = user_id);

-- Profile + post media storage buckets (public URLs).
-- post-media gets an explicit file_size_limit: Spot videos are compressed client-side before
-- upload (see lib/videoCompress.ts), but this raises the bucket's own ceiling well above that
-- so an already-reasonable file is never rejected. See database/increase-post-media-size-limit.sql
-- for the migration that raises this on an existing project (this insert only sets it on a
-- brand-new one — `on conflict` below intentionally does not touch file_size_limit so it does
-- not fight a value someone has customized in the dashboard).
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('avatars', 'avatars', true, null),
  ('post-media', 'post-media', true, 209715200) -- 200 MB
on conflict (id) do update
set public = excluded.public;

-- avatars
drop policy if exists "Avatars public read" on storage.objects;
drop policy if exists "Avatars owner upload" on storage.objects;
drop policy if exists "Avatars owner update" on storage.objects;
drop policy if exists "Avatars owner delete" on storage.objects;

create policy "Avatars public read"
on storage.objects
for select
using (bucket_id = 'avatars');

create policy "Avatars owner upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Avatars owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Avatars owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Post media storage bucket (public URLs for feed media).

drop policy if exists "Post media public read" on storage.objects;
drop policy if exists "Post media owner upload" on storage.objects;
drop policy if exists "Post media owner update" on storage.objects;
drop policy if exists "Post media owner delete" on storage.objects;

create policy "Post media public read"
on storage.objects
for select
using (bucket_id = 'post-media');

create policy "Post media owner upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'post-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Post media owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'post-media'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'post-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Post media owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'post-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);
