-- Hide full date_of_birth from public/authenticated API reads.
-- Age filters use age_years only. Owners read DOB via get_own_date_of_birth().

alter table public.profiles
  add column if not exists age_years integer;

create or replace function public.profiles_refresh_age_years()
returns trigger
language plpgsql
as $$
begin
  if new.date_of_birth is null then
    new.age_years := null;
  else
    new.age_years := date_part('year', age(current_date, new.date_of_birth))::integer;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_age_years_biu on public.profiles;
create trigger profiles_age_years_biu
  before insert or update of date_of_birth on public.profiles
  for each row
  execute function public.profiles_refresh_age_years();

update public.profiles
set age_years = date_part('year', age(current_date, date_of_birth))::integer
where date_of_birth is not null
  and (age_years is distinct from date_part('year', age(current_date, date_of_birth))::integer);

create or replace function public.get_own_date_of_birth()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select date_of_birth from public.profiles where id = auth.uid();
$$;

revoke all on function public.get_own_date_of_birth() from public;
grant execute on function public.get_own_date_of_birth() to authenticated;

-- Column-level privilege: clients may not SELECT full DOB.
revoke select (date_of_birth) on table public.profiles from anon;
revoke select (date_of_birth) on table public.profiles from authenticated;
