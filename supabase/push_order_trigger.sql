-- SQL Trigger to automatically call Edge Function / Webhook when a new order is inserted in scans_logs
create or replace function public.trigger_push_order_notification()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Call Supabase Edge Function safely without breaking order insertion if notification fails
  begin
    perform
      net.http_post(
        url := 'https://ezunddzzmcibnwnvlzng.supabase.co/functions/v1/push-order-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'record', row_to_json(NEW)
        )
      );
  exception when others then
    -- Log warning in Postgres log but NEVER fail the order insert
    raise warning 'Push notification trigger error: %', SQLERRM;
  end;

  return NEW;
end;
$$;

-- Attach trigger to scans_logs table on INSERT
drop trigger if exists on_new_order_push_notification on public.scans_logs;
create trigger on_new_order_push_notification
  after insert on public.scans_logs
  for each row
  execute function public.trigger_push_order_notification();

