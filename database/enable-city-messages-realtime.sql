-- Enable Supabase Realtime for city room messages (Messages inbox live updates).
-- Safe to re-run.

alter table if exists public.city_messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.city_messages;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
