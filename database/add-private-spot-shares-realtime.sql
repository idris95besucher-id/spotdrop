-- Enable live updates for private_spot_shares (accept/decline in DM)
-- Safe to re-run

do $$
begin
  alter publication supabase_realtime add table public.private_spot_shares;
exception
  when duplicate_object then null;
end $$;
