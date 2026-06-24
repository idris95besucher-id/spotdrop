-- Enable Supabase Realtime for direct_messages (required for live DM threads)
-- Run in Supabase SQL editor

alter table public.direct_messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.direct_messages;
exception
  when duplicate_object then null;
end $$;
