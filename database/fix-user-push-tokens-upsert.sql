-- Ensure authenticated users can upsert their own push tokens (insert + update + select).
-- Safe to re-run. Apply if user_push_tokens stays empty despite client registration logs.

grant select, insert, update, delete on table public.user_push_tokens to authenticated;
grant select, insert, update, delete on table public.user_push_tokens to service_role;

drop policy if exists "Users read own push tokens" on public.user_push_tokens;
create policy "Users read own push tokens"
on public.user_push_tokens for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users insert own push tokens" on public.user_push_tokens;
create policy "Users insert own push tokens"
on public.user_push_tokens for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users update own push tokens" on public.user_push_tokens;
create policy "Users update own push tokens"
on public.user_push_tokens for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete own push tokens" on public.user_push_tokens;
create policy "Users delete own push tokens"
on public.user_push_tokens for delete
to authenticated
using (auth.uid() = user_id);

notify pgrst, 'reload schema';
