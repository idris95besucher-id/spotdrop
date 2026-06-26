-- Ensure dm_typing_status UPDATE events include full row for Realtime.
-- Safe to re-run.

alter table if exists public.dm_typing_status replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.dm_typing_status;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
