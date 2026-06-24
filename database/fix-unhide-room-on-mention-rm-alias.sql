-- Fix city room message send error:
--   invalid reference to FROM-clause entry for table "rm"
--
-- Root cause: unhide_room_on_mention() joined profiles ON rm.user_id inside the
-- UPDATE ... FROM clause. PostgreSQL does not allow the UPDATE target alias (rm)
-- in FROM-clause JOIN conditions — only in WHERE.
--
-- Safe to re-run.

create or replace function public.unhide_room_on_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.room_memberships rm
  set is_hidden = false, updated_at = now()
  from public.cities c
  join public.countries co on co.id = c.country_id
  where c.id = new.city_id
    and rm.country_slug = co.slug
    and rm.city_slug = c.slug
    and rm.is_hidden = true
    and exists (
      select 1
      from public.profiles p
      where p.id = rm.user_id
        and p.username is not null
        and position(
          lower('@' || p.username) in lower(new.content)
        ) > 0
    );

  return new;
end;
$$;

drop trigger if exists trg_unhide_room_on_mention on public.city_messages;
create trigger trg_unhide_room_on_mention
before insert on public.city_messages
for each row execute function public.unhide_room_on_mention();

notify pgrst, 'reload schema';
