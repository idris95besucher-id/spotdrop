-- Decrement collection_save_count when a user removes their last collection link to a spot.
-- Run in Supabase after database/add-spot-ranking.sql.

create or replace function public.trg_collection_spots_save_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_rows integer;
begin
  if tg_op = 'INSERT' then
    select c.user_id into v_owner
    from public.collections c
    where c.id = new.collection_id;

    if v_owner is null then
      return new;
    end if;

    insert into public.spot_collection_saves (post_id, user_id)
    values (new.post_id, v_owner)
    on conflict do nothing;

    get diagnostics v_rows = row_count;

    if v_rows > 0 then
      update public.posts
      set collection_save_count = collection_save_count + 1
      where id = new.post_id
        and content_kind = 'spot';

      perform public.refresh_post_spot_rank_score(new.post_id);
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    select c.user_id into v_owner
    from public.collections c
    where c.id = old.collection_id;

    if v_owner is null then
      return old;
    end if;

    if exists (
      select 1
      from public.collection_spots cs
      join public.collections c on c.id = cs.collection_id
      where cs.post_id = old.post_id
        and c.user_id = v_owner
    ) then
      return old;
    end if;

    delete from public.spot_collection_saves
    where post_id = old.post_id
      and user_id = v_owner;

    get diagnostics v_rows = row_count;

    if v_rows > 0 then
      update public.posts
      set collection_save_count = greatest(0, collection_save_count - 1)
      where id = old.post_id
        and content_kind = 'spot';

      perform public.refresh_post_spot_rank_score(old.post_id);
    end if;

    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists collection_spots_save_count on public.collection_spots;
create trigger collection_spots_save_count
after insert or delete on public.collection_spots
for each row
execute function public.trg_collection_spots_save_count();
