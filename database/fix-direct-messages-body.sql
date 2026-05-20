-- Direct messages body column repair (run in Supabase SQL editor)
-- The app uses body everywhere. Older databases may still have content as NOT NULL.

alter table public.direct_messages
  add column if not exists body text;

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

delete from public.direct_messages
where body is null or btrim(body) = '';

alter table public.direct_messages
  alter column body set not null;

alter table public.direct_messages
  drop column if exists content;
