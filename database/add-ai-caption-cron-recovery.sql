-- AI-caption stale-job recovery via Supabase pg_cron, instead of a
-- Vercel-side scheduled HTTP endpoint.
--
-- Apply strictly AFTER database/add-ai-post-captions.sql — this file's
-- function depends on claim_stale_caption_redispatch(), posts.caption_source,
-- and ai_caption_webhook_config, all defined there.
--
-- Capability check (already run against production): pg_net is installed
-- (0.20.0); pg_cron is available (1.6.4) but not yet installed.
--
-- This file is split into two parts on purpose:
--   Part 1 defines run_ai_caption_stale_recovery_sweep() — inert on its own,
--   safe to apply any time after add-ai-post-captions.sql. Defining a
--   function does nothing until it's called.
--   Part 2 enables pg_cron and schedules the sweep to actually run on a
--   timer — do NOT apply Part 2 until the Edge Function is deployed AND
--   the ai_caption_webhook_config row is set. See the deployment order in
--   the accompanying report. (If Part 2 runs before the config row exists,
--   the function itself degrades gracefully — it checks for a configured
--   webhook and logs+no-ops rather than erroring — but there is no reason
--   to schedule it before that anyway.)

-- ============================================================
-- Part 1 — recovery function (safe to apply now)
-- ============================================================

-- Reuses claim_stale_caption_redispatch() for every atomicity/concurrency
-- decision (staleness, dispatch/attempt budgets, active-lease check,
-- redispatch-cooldown check) — this function duplicates none of that logic.
-- Its only two jobs are: find a bounded batch of candidates, and enqueue
-- pg_net.http_post only for the ones claim_stale_caption_redispatch()
-- actually returns claimed=true for.
--
-- Not SECURITY DEFINER: this function is only ever invoked by the pg_cron
-- job scheduled in Part 2 below, which runs with the privileges of the role
-- that scheduled it — the same role (postgres, via this migration) that
-- owns this function, claim_stale_caption_redispatch(),
-- ai_caption_webhook_config, and the pg_net extension objects. Ownership
-- already grants every privilege this function needs; there is nothing to
-- borrow via SECURITY DEFINER, unlike dispatch_ai_caption_job() (a trigger
-- fired by an ordinary app user's INSERT, which genuinely needs to borrow
-- elevated privileges to reach the webhook config and pg_net). Every
-- privileged object this function touches remains independently locked
-- down against public/anon/authenticated regardless of how this function
-- itself is invoked — see the REVOKE at the end of this section, and the
-- existing grants in add-ai-post-captions.sql.
create or replace function public.run_ai_caption_stale_recovery_sweep(
  p_batch_limit int default 25,
  p_max_dispatch_attempts int default 5,
  p_max_caption_attempts int default 3,
  p_stale_threshold_seconds int default 600,
  p_redispatch_cooldown_seconds int default 180
)
returns table (candidates int, dispatched int, exhausted int, skipped int)
language plpgsql
-- Every object here is schema-qualified (public.posts,
-- public.ai_caption_webhook_config, public.ai_caption_dispatch_log,
-- public.claim_stale_caption_redispatch, net.http_post) or a pg_catalog
-- built-in (now, make_interval, jsonb_build_object, btrim, left) — empty
-- search_path is safe and strictest, same reasoning as every function in
-- add-ai-post-captions.sql.
set search_path = ''
as $$
declare
  v_post record;
  v_claim record;
  v_url text;
  v_secret text;
  v_candidates int := 0;
  v_dispatched int := 0;
  v_exhausted int := 0;
  v_skipped int := 0;
  v_request_id bigint;
  v_err text;
begin
  select c.url, c.secret into v_url, v_secret
  from public.ai_caption_webhook_config c
  where c.id = 1;

  if v_url is null or btrim(v_url) = '' or v_secret is null or btrim(v_secret) = '' then
    insert into public.ai_caption_dispatch_log (post_id, stage, detail)
    values (null, 'sweep_skipped_no_webhook_config', 'Set ai_caption_webhook_config before scheduling recovery');
    return query select 0, 0, 0, 0;
    return;
  end if;

  -- Coarse candidate scan only — claim_stale_caption_redispatch() below
  -- re-verifies staleness, budgets, and the active-lease/redispatch-claim
  -- guarantees precisely and atomically per row. This is intentionally not
  -- locked here; the per-row RPC call owns all locking.
  for v_post in
    select p.id
    from public.posts p
    where p.caption_source = 'ai_pending'
      and p.created_at < now() - make_interval(secs => p_stale_threshold_seconds)
    order by p.created_at asc
    limit p_batch_limit
  loop
    v_candidates := v_candidates + 1;

    select * into v_claim
    from public.claim_stale_caption_redispatch(
      v_post.id,
      p_max_dispatch_attempts,
      p_max_caption_attempts,
      p_stale_threshold_seconds,
      p_redispatch_cooldown_seconds
    );

    if v_claim.exhausted then
      v_exhausted := v_exhausted + 1;
      continue;
    end if;

    if not v_claim.claimed then
      -- Not actually stale yet, an active lease is processing it, or a
      -- redispatch claim from another sweep run is still fresh — correctly
      -- left untouched either way.
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- net.http_post is asynchronous: it only enqueues the request inside
    -- Postgres and returns a request_id immediately. A successful enqueue
    -- here is NOT proof the Edge Function ever received or processed the
    -- request — it only proves pg_net accepted the job. Whether the
    -- request actually lands is exactly what caption_dispatch_attempts +
    -- caption_redispatch_claimed_at (claim_stale_caption_redispatch()) are
    -- for: if this enqueued request is dropped, times out, or the Edge
    -- Function never runs, the post stays 'ai_pending' with a claimed
    -- (but now aging) redispatch stamp, and a later run of this same sweep
    -- will pick it up again once that stamp goes stale — this function
    -- does not itself confirm or wait for delivery.
    begin
      v_request_id := net.http_post(
        url := btrim(v_url),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || btrim(v_secret)
        ),
        body := jsonb_build_object('postId', v_post.id::text)
      );

      insert into public.ai_caption_dispatch_log (post_id, stage, detail, request_id)
      values (v_post.id, 'sweep_http_post_queued', left(btrim(v_url), 200), v_request_id);

      v_dispatched := v_dispatched + 1;
    exception when others then
      -- Synchronous enqueue failure (distinct from an async delivery
      -- failure — see add-ai-post-captions.sql's notes on this same
      -- distinction for the insert trigger). caption_dispatch_attempts was
      -- already incremented by claim_stale_caption_redispatch() above —
      -- left as-is; the attempt genuinely was made. The next sweep run
      -- will retry once this claim's cooldown lapses, same recovery path
      -- as an async delivery failure.
      get stacked diagnostics v_err = message_text;
      insert into public.ai_caption_dispatch_log (post_id, stage, detail)
      values (v_post.id, 'sweep_http_post_error', left(v_err, 500));
    end;
  end loop;

  return query select v_candidates, v_dispatched, v_exhausted, v_skipped;
end;
$$;

-- Only the owning role (postgres, via pg_cron below) ever needs to call
-- this — no PostgREST/RPC path, no app-level role, matching "no new public
-- recovery endpoint." Not even service_role is granted here by design; a
-- manual sweep, if ever needed, should be run directly in the SQL editor
-- as postgres (`select public.run_ai_caption_stale_recovery_sweep();`).
revoke execute on function public.run_ai_caption_stale_recovery_sweep(int, int, int, int, int)
  from public, anon, authenticated, service_role;

-- ============================================================
-- Part 2 — enable pg_cron and schedule the sweep
--
-- DO NOT RUN THIS PART until:
--   1. database/add-ai-post-captions.sql has been applied, AND
--   2. generate-post-caption has been deployed, AND
--   3. AI_CAPTION_WEBHOOK_SECRET has been set as an Edge Function secret, AND
--   4. the ai_caption_webhook_config row has been inserted with the real
--      deployed function URL and that same secret.
-- See the report's "final production deployment order" for the exact
-- sequence. Applying Part 1 alone is always safe.
-- ============================================================

create extension if not exists pg_cron;

-- Idempotent by design: cron.schedule(job_name, schedule, command) upserts
-- when a job with this exact name already exists (pg_cron >= 1.4 behavior;
-- this project has 1.6.4 available) — safe to re-run this file, it will
-- never create a duplicate schedule.
select cron.schedule(
  'ai_caption_stale_recovery_sweep',
  '*/15 * * * *',
  $$select public.run_ai_caption_stale_recovery_sweep();$$
);

-- ============================================================
-- Reference SQL — not part of migration, run manually as needed.
-- ============================================================

-- Inspect the scheduled job:
--   select jobid, jobname, schedule, active, command
--   from cron.job
--   where jobname = 'ai_caption_stale_recovery_sweep';

-- Recent run history (success/failure, duration, per-run output):
--   select jobid, runid, status, return_message, start_time, end_time
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'ai_caption_stale_recovery_sweep')
--   order by start_time desc
--   limit 20;

-- Unschedule safely (stops future runs; does not drop the function):
--   select cron.unschedule('ai_caption_stale_recovery_sweep');

-- Manual one-off sweep, e.g. to test before scheduling:
--   select * from public.run_ai_caption_stale_recovery_sweep();
