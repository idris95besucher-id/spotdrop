-- CheckSpot distance accuracy columns (idempotent — safe to re-run)

alter table public.private_spot_shares
  add column if not exists sender_location_accuracy double precision,
  add column if not exists sender_location_captured_at timestamptz,
  add column if not exists receiver_latitude double precision,
  add column if not exists receiver_longitude double precision,
  add column if not exists receiver_location_accuracy double precision,
  add column if not exists receiver_location_captured_at timestamptz,
  add column if not exists distance_km double precision;

create or replace function public.fetch_private_spot_share(p_share_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.private_spot_shares%rowtype;
begin
  if v_uid is null then
    return null;
  end if;

  select * into v_row
  from public.private_spot_shares
  where id = p_share_id;

  if not found then
    return null;
  end if;

  if v_row.sender_id <> v_uid and v_row.recipient_id <> v_uid then
    return null;
  end if;

  if v_row.recipient_id = v_uid and v_row.status = 'pending' then
    return jsonb_build_object(
      'id', v_row.id,
      'sender_id', v_row.sender_id,
      'recipient_id', v_row.recipient_id,
      'status', v_row.status,
      'accepted_at', v_row.accepted_at,
      'created_at', v_row.created_at
    );
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'sender_id', v_row.sender_id,
    'recipient_id', v_row.recipient_id,
    'sender_latitude', v_row.sender_latitude,
    'sender_longitude', v_row.sender_longitude,
    'sender_address', v_row.sender_address,
    'sender_location_accuracy', v_row.sender_location_accuracy,
    'sender_location_captured_at', v_row.sender_location_captured_at,
    'receiver_latitude', v_row.receiver_latitude,
    'receiver_longitude', v_row.receiver_longitude,
    'receiver_location_accuracy', v_row.receiver_location_accuracy,
    'receiver_location_captured_at', v_row.receiver_location_captured_at,
    'distance_km', v_row.distance_km,
    'status', v_row.status,
    'accepted_at', v_row.accepted_at,
    'created_at', v_row.created_at
  );
end;
$$;

revoke all on function public.fetch_private_spot_share(uuid) from public;
grant execute on function public.fetch_private_spot_share(uuid) to authenticated;
