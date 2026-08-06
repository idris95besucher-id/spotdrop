-- Official channel: track source locale for localized display fallback.
-- Additive / safe to re-run. Does not change body_*/title_* columns (already EN/RU/DE).
--
-- Display fallback uses: requested locale → source_locale → en → any non-empty.
-- Push fan-out still uses profiles.language (see lib/officialChannelPush.ts).

alter table public.official_channel_posts
  add column if not exists source_locale text;

-- Existing Stage B posts were authored in English.
update public.official_channel_posts
set source_locale = 'en'
where source_locale is null;

do $$
begin
  alter table public.official_channel_posts
    alter column source_locale set default 'en';
exception
  when others then null;
end $$;

do $$
begin
  alter table public.official_channel_posts
    alter column source_locale set not null;
exception
  when others then null;
end $$;

do $$
begin
  alter table public.official_channel_posts
    add constraint official_channel_posts_source_locale_check
    check (source_locale in ('en', 'ru', 'de'));
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
