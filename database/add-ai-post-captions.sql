-- AI-generated Spot captions + on-demand translation cache.
--
-- Requires: public.posts.id is bigint (confirmed production schema — see
-- database/add-post-media-items.sql for the same constraint on this table).
--
-- Mirrors the existing push-notification dispatch pattern
-- (database/fix-push-dispatch-reliability.sql): a security-definer trigger
-- fires a fire-and-forget net.http_post webhook after insert, never blocking
-- or failing the insert itself, with its own config table + dispatch log.
--
-- After applying, configure the webhook once (replace URL + secret; the URL
-- is the deployed Edge Function, e.g.
-- https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-post-caption):
--   insert into public.ai_caption_webhook_config (id, url, secret)
--   values (1, 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-post-caption', 'YOUR_AI_CAPTION_WEBHOOK_SECRET')
--   on conflict (id) do update set url = excluded.url, secret = excluded.secret, updated_at = now();
--
-- Then verify:
--   select * from public.ai_caption_dispatch_log order by created_at desc limit 20;

create extension if not exists pg_net with schema extensions;

-- ============================================================
-- 1. posts.caption_source — distinguishes manual vs. AI-generated captions
-- ============================================================

alter table public.posts
  add column if not exists caption_source text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'posts_caption_source_check'
  ) then
    alter table public.posts
      add constraint posts_caption_source_check
      check (caption_source in ('manual', 'ai', 'ai_pending', 'ai_failed'));
  end if;
end $$;

-- Existing rows are untouched (default 'manual') — this feature only applies
-- to newly published Spots going forward, never a historical backfill.

-- Attempt tracking, for bounded retry + stale-job recovery (see
-- acquire_ai_caption_lease() below). caption_attempts counts every actual
-- OpenAI-call attempt (in-Edge-Function retry or stale-sweep re-dispatch —
-- one counter, one bound, everywhere).
alter table public.posts
  add column if not exists caption_attempts integer not null default 0;

alter table public.posts
  add column if not exists caption_attempted_at timestamptz;

-- Processing lease — the fix for concurrent duplicate deliveries both
-- calling OpenAI for the same post. A lease is held by exactly one
-- in-flight Edge Function invocation (identified by caption_lease_token,
-- a UUID minted fresh per invocation) for up to caption_lease_expires_at.
-- See acquire_ai_caption_lease() for how this is enforced atomically.
alter table public.posts
  add column if not exists caption_lease_token uuid;

alter table public.posts
  add column if not exists caption_lease_expires_at timestamptz;

-- Dispatch-attempt tracking — separate from caption_attempts, which only
-- increments once the Edge Function actually runs. This counts every time
-- SpotDrop *tried to get the job to run at all* (the initial trigger fire,
-- plus every stale-sweep re-dispatch), bounding the case where the webhook
-- never reaches the function (wrong URL, function down, delivery failure)
-- and caption_attempts would otherwise stay at 0 forever. See the
-- Supabase pg_cron-driven public.run_ai_caption_stale_recovery_sweep()
-- in database/add-ai-caption-cron-recovery.sql.
alter table public.posts
  add column if not exists caption_dispatch_attempts integer not null default 0;

-- Redispatch claim marker — closes the gap between "a sweep decided to
-- redispatch this post" and "the Edge Function actually acquired the real
-- processing lease" (the HTTP request is in flight in between, with no
-- lease yet to protect it). Set the moment claim_stale_caption_redispatch()
-- claims a redispatch; while fresh (within the cooldown window), no other
-- sweep run may claim or fail this post. See claim_stale_caption_redispatch()
-- below for exactly how this is enforced.
alter table public.posts
  add column if not exists caption_redispatch_claimed_at timestamptz;

-- ============================================================
-- 2. Webhook dispatch config + log (mirrors push_webhook_config / push_dispatch_log)
-- ============================================================

create table if not exists public.ai_caption_webhook_config (
  id int primary key default 1 check (id = 1),
  url text not null,
  secret text not null,
  updated_at timestamptz not null default now()
);

alter table public.ai_caption_webhook_config enable row level security;
-- No policies for anon/authenticated — zero policies + RLS enabled means
-- those roles get zero rows even if they have table-level SELECT (Postgres
-- default-deny). Explicit REVOKE below is defense-in-depth on top of that,
-- so this table's exposure never depends on assumptions about this
-- project's default privilege grants.
revoke all on table public.ai_caption_webhook_config from anon, authenticated;
grant select on table public.ai_caption_webhook_config to service_role;

create table if not exists public.ai_caption_dispatch_log (
  id bigserial primary key,
  post_id bigint,
  stage text not null,
  detail text,
  request_id bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_caption_dispatch_log_created
  on public.ai_caption_dispatch_log (created_at desc);

create index if not exists idx_ai_caption_dispatch_log_post
  on public.ai_caption_dispatch_log (post_id);

alter table public.ai_caption_dispatch_log enable row level security;
revoke all on table public.ai_caption_dispatch_log from anon, authenticated;
grant select, insert on table public.ai_caption_dispatch_log to service_role;

-- bigserial's backing sequence has independent privileges from the table —
-- table-level INSERT alone does not implicitly grant the nextval()/currval()
-- access a serial column's DEFAULT needs at insert time. Grant only the
-- minimum required (USAGE for nextval, SELECT for currval/introspection),
-- and only to service_role — never to anon/authenticated, matching the
-- table's own grants above.
revoke all on sequence public.ai_caption_dispatch_log_id_seq from public, anon, authenticated;
grant usage, select on sequence public.ai_caption_dispatch_log_id_seq to service_role;

-- ============================================================
-- 3. Dispatch trigger — fires only for newly published Spots that opted into
--    auto-captioning and have no manual caption (caption_source = 'ai_pending',
--    set by the publish pipeline itself — see lib/spots.ts createGeoSpot).
-- ============================================================

create or replace function public.dispatch_ai_caption_job()
returns trigger
language plpgsql
security definer
-- Every object this function touches is already schema-qualified
-- (public.ai_caption_webhook_config, public.ai_caption_dispatch_log,
-- net.http_post) or a pg_catalog built-in (jsonb_build_object, btrim,
-- left), which resolves regardless of search_path. That means the safest
-- fixed search_path Postgres allows — empty — works here; nothing needs
-- `public` or `extensions` unqualified. pg_catalog remains implicitly
-- available even with an empty path, and pg_temp is deliberately excluded
-- (SECURITY DEFINER + a writable/searchable temp schema is the classic
-- search_path-hijack vector this whole pattern exists to avoid).
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
  v_err text;
begin
  if new.caption_source is distinct from 'ai_pending' then
    return new;
  end if;

  -- public.ai_caption_webhook_config is the single trusted source of the
  -- webhook URL + secret — deliberately no fallback to a session/role GUC
  -- (e.g. current_setting('app.ai_caption_webhook_url', ...)). A SECURITY
  -- DEFINER function that can call net.http_post should not additionally
  -- trust caller/session-controlled configuration for where that HTTP
  -- request goes; the config table is owned and writable only by
  -- privileged migration/admin roles (see its RLS + REVOKE above).
  select c.url, c.secret into v_url, v_secret
  from public.ai_caption_webhook_config c
  where c.id = 1;

  if v_url is null or btrim(v_url) = '' or v_secret is null or btrim(v_secret) = '' then
    insert into public.ai_caption_dispatch_log (post_id, stage, detail)
    values (
      new.id,
      'skipped_no_webhook_config',
      'Set ai_caption_webhook_config before publishing AI-eligible Spots'
    );
    return new;
  end if;

  -- Counts this dispatch attempt regardless of whether the enqueue below
  -- succeeds or raises — either way, this is one attempt at getting the job
  -- to run. Separate from caption_attempts, which only increments once the
  -- Edge Function actually executes (see acquire_ai_caption_lease()).
  update public.posts
  set caption_dispatch_attempts = caption_dispatch_attempts + 1
  where id = new.id;

  begin
    v_request_id := net.http_post(
      url := btrim(v_url),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || btrim(v_secret)
      ),
      body := jsonb_build_object('postId', new.id::text)
    );

    insert into public.ai_caption_dispatch_log (post_id, stage, detail, request_id)
    values (new.id, 'http_post_queued', left(btrim(v_url), 200), v_request_id);
  exception when others then
    get stacked diagnostics v_err = message_text;
    insert into public.ai_caption_dispatch_log (post_id, stage, detail)
    values (new.id, 'http_post_error', left(v_err, 500));
  end;

  return new;
end;
$$;

drop trigger if exists trg_dispatch_ai_caption_job on public.posts;
create trigger trg_dispatch_ai_caption_job
after insert on public.posts
for each row execute function public.dispatch_ai_caption_job();

-- Postgres grants EXECUTE on new functions to PUBLIC by default. Trigger
-- functions can't be invoked directly (Postgres itself rejects a bare
-- `select dispatch_ai_caption_job()` call), so this is defense-in-depth
-- rather than a fix for a real hole — but it costs nothing and keeps every
-- privileged surface this migration adds consistently locked down.
revoke execute on function public.dispatch_ai_caption_job() from public, anon, authenticated;

-- ============================================================
-- 3b. Processing lease + bounded attempt claim — the retry/recovery and
--     concurrency-safety mechanism. Called by generate-post-caption at the
--     start of every attempt (the initial trigger-fired invocation, an
--     in-Edge-Function retry, or a later stale-sweep re-dispatch), with a
--     UUID token unique to that invocation.
--
--     Atomically, in order:
--     - bails out if the post already left 'ai_pending' (manual edit, or a
--       prior invocation already succeeded/failed) — no attempt spent;
--     - refuses the caller (without spending an attempt, without touching
--       ai_failed, without clearing anything) if a DIFFERENT token already
--       holds a live (non-expired) lease — this is what stops two
--       concurrent webhook deliveries from both calling OpenAI for the same
--       post. This check runs BEFORE the exhausted check below: an in-flight
--       final attempt (e.g. attempt 3/3, still running under its own live
--       lease) must never be invalidated by a duplicate/overlapping delivery
--       that happens to observe the same "exhausted" attempt count while the
--       original lease is still protecting it. A caller renewing its OWN
--       token's lease (the same invocation's internal retry loop) is never
--       treated as foreign, and always proceeds past this check;
--     - only once no foreign live lease is held, marks ai_failed if
--       caption_attempts has reached p_max_attempts, without ever calling
--       OpenAI again;
--     - otherwise increments caption_attempts, stamps caption_attempted_at,
--       and hands the lease to p_lease_token for p_lease_duration_seconds.
--
--     The row lock (`for update`) makes the whole check-and-set atomic
--     against two overlapping deliveries racing each other.
-- ============================================================

create or replace function public.acquire_ai_caption_lease(
  p_post_id bigint,
  p_lease_token uuid,
  p_lease_duration_seconds int default 90,
  p_max_attempts int default 3
)
returns table (acquired boolean, attempts int, exhausted boolean)
language plpgsql
security definer
-- Same reasoning as dispatch_ai_caption_job(): every reference here is
-- schema-qualified (public.posts) or a pg_catalog built-in (make_interval,
-- now, coalesce) — empty search_path is safe and is the strictest option
-- available.
set search_path = ''
as $$
declare
  v_attempts int;
  v_source text;
  v_lease_token uuid;
  v_lease_expires_at timestamptz;
  v_has_foreign_active_lease boolean;
begin
  select
    p.caption_attempts, p.caption_source, p.caption_lease_token, p.caption_lease_expires_at
  into v_attempts, v_source, v_lease_token, v_lease_expires_at
  from public.posts p
  where p.id = p_post_id
  for update;

  if not found or v_source is distinct from 'ai_pending' then
    return query select false, coalesce(v_attempts, 0), false;
    return;
  end if;

  v_has_foreign_active_lease :=
    v_lease_token is not null
    and v_lease_token is distinct from p_lease_token
    and v_lease_expires_at is not null
    and v_lease_expires_at > now();

  -- A different invocation holds a still-live lease — refuse without
  -- spending an attempt, without marking ai_failed, and without clearing
  -- its lease, REGARDLESS of the attempt count. This is the fix for
  -- concurrent duplicate deliveries both calling OpenAI: at most one token
  -- can hold the lease at a time, and only the lease holder is allowed past
  -- this point. Deliberately checked BEFORE the exhausted branch below —
  -- see the function-level comment for the exact race this ordering closes.
  if v_has_foreign_active_lease then
    return query select false, v_attempts, false;
    return;
  end if;

  if v_attempts >= p_max_attempts then
    -- Reached only when no OTHER token holds a live lease (just proven
    -- above) — so this update can only ever clear the caller's own lease,
    -- an already-expired lease, or no lease at all. The WHERE clause below
    -- is additional defense-in-depth on top of that, redundant with the
    -- check above: even if this branch were ever reached in error, it
    -- still cannot clear a different invocation's live lease.
    update public.posts
    set caption_source = 'ai_failed',
        caption_lease_token = null,
        caption_lease_expires_at = null,
        caption_redispatch_claimed_at = null
    where id = p_post_id
      and caption_source = 'ai_pending'
      and (
        caption_lease_token is null
        or caption_lease_token = p_lease_token
        or caption_lease_expires_at <= now()
      );

    return query select false, v_attempts, true;
    return;
  end if;

  -- The real processing lease has now taken over — clear the redispatch
  -- claim marker (claim_stale_caption_redispatch()'s job is done; the
  -- lease alone protects this post from here on). Not required for
  -- correctness (the lease check alone already fully protects this post
  -- from the sweep — see claim_stale_caption_redispatch()), just keeps the
  -- row's state legible.
  update public.posts
  set caption_attempts = caption_attempts + 1,
      caption_attempted_at = now(),
      caption_lease_token = p_lease_token,
      caption_lease_expires_at = now() + make_interval(secs => p_lease_duration_seconds),
      caption_redispatch_claimed_at = null
  where id = p_post_id and caption_source = 'ai_pending';

  return query select true, v_attempts + 1, false;
end;
$$;

revoke execute on function public.acquire_ai_caption_lease(bigint, uuid, int, int) from public, anon, authenticated;
grant execute on function public.acquire_ai_caption_lease(bigint, uuid, int, int) to service_role;

-- ============================================================
-- 3c. Atomic stale-redispatch claim — called by the Supabase pg_cron-driven
--     public.run_ai_caption_stale_recovery_sweep() (see
--     database/add-ai-caption-cron-recovery.sql) once per candidate row,
--     replacing a prior JS-side read-then-write increment of
--     caption_dispatch_attempts that could lose updates between two
--     overlapping sweep runs. The row lock (`for update`) makes the whole
--     check-and-set — staleness, dispatch/attempt budgets, active-lease
--     check, redispatch-cooldown check, and the increment or the ai_failed
--     write — one atomic unit, exactly like acquire_ai_caption_lease() above.
--
--     Returns claimed=true only when the sweep should actually fire the
--     webhook for this post; the caller (run_ai_caption_stale_recovery_sweep())
--     must only call net.http_post for rows this function returned
--     claimed=true for.
--
--     There is an inherent gap between "a redispatch is claimed here" and
--     "the Edge Function actually receives the HTTP request and acquires
--     the real processing lease" — the request is in flight, with no real
--     lease yet to protect it. caption_redispatch_claimed_at closes that
--     gap: the moment a redispatch is claimed, it's stamped with now(), and
--     while that stamp is fresh (within p_redispatch_cooldown_seconds) no
--     other invocation of this function may claim OR fail the same post —
--     checked together with the real lease, before the exhausted check ever
--     runs. Only once the claim goes stale (the webhook genuinely never
--     arrived) can a later sweep try again, still bounded by
--     p_max_dispatch_attempts overall.
--
--     Guarantees, in order:
--     - post no longer 'ai_pending' (resolved, or never existed) → refuse,
--       nothing written;
--     - a DIFFERENT invocation currently holds a live, unexpired
--       processing lease, OR a redispatch was claimed within the cooldown
--       window and may still be in transit → refuse, nothing written.
--       Neither a webhook actively being processed nor one that's still on
--       the wire can ever be redispatched again or marked ai_failed out
--       from under it — this check happens, and the row lock is held,
--       before the exhausted check below even runs;
--     - not old enough to be considered stale yet (a normal first attempt
--       may still be legitimately in flight) → refuse, nothing written;
--     - dispatch or in-function attempt budget already exhausted → mark
--       ai_failed (re-guarded on no-active-lease and no-fresh-redispatch-
--       claim as defense-in-depth, even though the earlier check already
--       ensures both), no further dispatch;
--     - otherwise → atomically increment caption_dispatch_attempts, stamp
--       caption_redispatch_claimed_at, and report claimed=true.
-- ============================================================

create or replace function public.claim_stale_caption_redispatch(
  p_post_id bigint,
  p_max_dispatch_attempts int default 5,
  p_max_caption_attempts int default 3,
  p_stale_threshold_seconds int default 600,
  p_redispatch_cooldown_seconds int default 180
)
returns table (claimed boolean, dispatch_attempts int, exhausted boolean)
language plpgsql
security definer
-- Same reasoning as the other two functions in this file: every reference
-- is schema-qualified (public.posts) or a pg_catalog built-in
-- (make_interval, now, coalesce) — empty search_path is safe and strictest.
set search_path = ''
as $$
declare
  v_source text;
  v_dispatch_attempts int;
  v_caption_attempts int;
  v_created_at timestamptz;
  v_lease_token uuid;
  v_lease_expires_at timestamptz;
  v_redispatch_claimed_at timestamptz;
  v_stale_cutoff timestamptz;
  v_redispatch_cutoff timestamptz;
  v_has_active_lease boolean;
  v_has_fresh_redispatch_claim boolean;
begin
  v_stale_cutoff := now() - make_interval(secs => p_stale_threshold_seconds);
  v_redispatch_cutoff := now() - make_interval(secs => p_redispatch_cooldown_seconds);

  select
    p.caption_source, p.caption_dispatch_attempts, p.caption_attempts,
    p.created_at, p.caption_lease_token, p.caption_lease_expires_at,
    p.caption_redispatch_claimed_at
  into
    v_source, v_dispatch_attempts, v_caption_attempts,
    v_created_at, v_lease_token, v_lease_expires_at,
    v_redispatch_claimed_at
  from public.posts p
  where p.id = p_post_id
  for update;

  if not found or v_source is distinct from 'ai_pending' then
    return query select false, coalesce(v_dispatch_attempts, 0), false;
    return;
  end if;

  v_has_active_lease :=
    v_lease_token is not null and v_lease_expires_at is not null and v_lease_expires_at > now();
  v_has_fresh_redispatch_claim :=
    v_redispatch_claimed_at is not null and v_redispatch_claimed_at > v_redispatch_cutoff;

  -- Someone is actively processing this post right now (a live real
  -- lease), OR a redispatch was claimed too recently and its webhook may
  -- still be in transit to the Edge Function — never interfere with
  -- either, whether by redispatching again or marking it failed. This
  -- check — and the row lock it runs under — happens before the exhausted
  -- check below, so neither case can ever be raced into an ai_failed write
  -- or a duplicate redispatch.
  if v_has_active_lease or v_has_fresh_redispatch_claim then
    return query select false, v_dispatch_attempts, false;
    return;
  end if;

  -- Not actually stale yet — refuse without touching anything, so a
  -- normal first attempt still legitimately in flight is never raced.
  if v_created_at > v_stale_cutoff then
    return query select false, v_dispatch_attempts, false;
    return;
  end if;

  if v_dispatch_attempts >= p_max_dispatch_attempts or v_caption_attempts >= p_max_caption_attempts then
    -- Redundant with the checks above (defense-in-depth): this WHERE
    -- clause alone is sufficient, on its own, to prove this update can
    -- never fire while a real lease is active or a redispatch claim is
    -- still fresh, even without relying on the earlier early-return.
    update public.posts
    set caption_source = 'ai_failed'
    where id = p_post_id
      and caption_source = 'ai_pending'
      and (caption_lease_token is null or caption_lease_expires_at <= now())
      and (caption_redispatch_claimed_at is null or caption_redispatch_claimed_at <= v_redispatch_cutoff);

    return query select false, v_dispatch_attempts, true;
    return;
  end if;

  update public.posts
  set caption_dispatch_attempts = caption_dispatch_attempts + 1,
      caption_redispatch_claimed_at = now()
  where id = p_post_id and caption_source = 'ai_pending';

  return query select true, v_dispatch_attempts + 1, false;
end;
$$;

revoke execute on function public.claim_stale_caption_redispatch(bigint, int, int, int, int) from public, anon, authenticated;
grant execute on function public.claim_stale_caption_redispatch(bigint, int, int, int, int) to service_role;

-- ============================================================
-- 4. Translation cache — keyed by post_id + language, versioned against the
--    source caption via a content hash so an edited caption never serves a
--    stale cached translation.
-- ============================================================

create table if not exists public.post_caption_translations (
  post_id bigint not null references public.posts(id) on delete cascade,
  language text not null check (language in ('en', 'ru', 'de')),
  translated_text text not null,
  source_content_hash text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, language)
);

alter table public.post_caption_translations enable row level security;

drop policy if exists "post_caption_translations_select_public" on public.post_caption_translations;

create policy "post_caption_translations_select_public"
  on public.post_caption_translations for select
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_caption_translations.post_id
        and (p.visibility = 'public' or p.user_id = auth.uid())
    )
  );

-- Writes are AI-managed only (Edge Function via service_role) — no
-- authenticated insert/update policy, matching ai_caption_dispatch_log.
-- SELECT stays open to anon/authenticated (gated by the policy above);
-- writes are explicitly revoked as defense-in-depth on top of that.
revoke insert, update, delete on table public.post_caption_translations from anon, authenticated;
grant select, insert, update on table public.post_caption_translations to service_role;

notify pgrst, 'reload schema';
