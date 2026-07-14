-- Flat private Saved posts (Instagram-style).
-- Reuses public.spot_collection_saves as the single save index.
-- Idempotent — safe to re-run.

-- 1) Index for owner's saved grid (newest first)
create index if not exists idx_spot_collection_saves_user_created
  on public.spot_collection_saves (user_id, created_at desc);

-- 2) Backfill any collection folder saves into the flat index
insert into public.spot_collection_saves (post_id, user_id)
select distinct cs.post_id, c.user_id
from public.collection_spots cs
join public.collections c on c.id = cs.collection_id
join public.posts p on p.id = cs.post_id
where coalesce(p.content_kind, 'spot') = 'spot'
on conflict do nothing;

-- 3) Count updates live on spot_collection_saves (direct save/unsave)
create or replace function public.trg_spot_collection_saves_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
    set collection_save_count = collection_save_count + 1
    where id = new.post_id
      and content_kind = 'spot';

    perform public.refresh_post_spot_rank_score(new.post_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.posts
    set collection_save_count = greatest(0, collection_save_count - 1)
    where id = old.post_id
      and content_kind = 'spot';

    perform public.refresh_post_spot_rank_score(old.post_id);
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists spot_collection_saves_count on public.spot_collection_saves;
create trigger spot_collection_saves_count
after insert or delete on public.spot_collection_saves
for each row
execute function public.trg_spot_collection_saves_count();

-- 4) collection_spots only syncs the flat save row (no double-count)
create or replace function public.trg_collection_spots_save_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
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

-- 5) Reconcile public save counts
update public.posts p
set collection_save_count = coalesce(sub.cnt, 0)
from (
  select post_id, count(*)::integer as cnt
  from public.spot_collection_saves
  group by post_id
) sub
where p.id = sub.post_id
  and p.content_kind = 'spot';

update public.posts
set collection_save_count = 0
where content_kind = 'spot'
  and id not in (select post_id from public.spot_collection_saves);

-- 6) Strict RLS — only the owner can read/write their saves
alter table public.spot_collection_saves enable row level security;

drop policy if exists "Spot collection saves readable" on public.spot_collection_saves;
drop policy if exists "Users read own spot saves" on public.spot_collection_saves;
drop policy if exists "Users insert own spot saves" on public.spot_collection_saves;
drop policy if exists "Users delete own spot saves" on public.spot_collection_saves;

create policy "Users read own spot saves"
on public.spot_collection_saves for select
to authenticated
using (auth.uid() = user_id);

create policy "Users insert own spot saves"
on public.spot_collection_saves for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users delete own spot saves"
on public.spot_collection_saves for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, delete on table public.spot_collection_saves to authenticated;

notify pgrst, 'reload schema';
