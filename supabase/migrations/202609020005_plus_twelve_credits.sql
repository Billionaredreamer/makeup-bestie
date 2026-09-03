create or replace function public.reserve_ai_usage(requested_operation text, requested_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  current_user_id uuid := auth.uid(); current_plan text; current_status text;
  monthly_count integer; daily_count integer; existing_event uuid; created_event uuid;
begin
  if current_user_id is null then return jsonb_build_object('allowed', false, 'code', 'authentication', 'message', 'Sign in to continue.'); end if;
  if requested_operation not in ('tutorial_analysis','preview_generation') then return jsonb_build_object('allowed', false, 'code', 'invalid', 'message', 'Unknown AI operation.'); end if;
  select plan, status into current_plan, current_status from public.subscriptions where user_id = current_user_id for update;
  if current_status is null or current_status not in ('active','trialing') then
    return jsonb_build_object('allowed', false, 'code', 'subscription_required', 'message', 'Choose a Makeup Bestie plan to create personalized lessons.');
  end if;
  select id into existing_event from public.ai_usage_events
    where user_id = current_user_id and operation = requested_operation and ai_usage_events.request_key = requested_key
      and status in ('reserved','completed');
  if existing_event is not null then return jsonb_build_object('allowed', true, 'event_id', existing_event, 'reused', true); end if;
  select count(*) into monthly_count from public.ai_usage_events
    where user_id = current_user_id and operation = requested_operation
      and (status = 'completed' or (status = 'reserved' and created_at >= now() - interval '15 minutes'))
      and created_at >= date_trunc('month', now());
  select count(*) into daily_count from public.ai_usage_events
    where user_id = current_user_id and operation = requested_operation
      and (status = 'completed' or (status = 'reserved' and created_at >= now() - interval '15 minutes'))
      and created_at >= now() - interval '24 hours';
  if current_plan = 'plus' and monthly_count >= 12 then
    return jsonb_build_object('allowed', false, 'code', 'monthly_limit', 'message', 'You have used this month''s 12 personalized routine credits. Your allowance resets next month, or you can switch to Unlimited.');
  end if;
  if current_plan = 'unlimited' and daily_count >= 30 then
    return jsonb_build_object('allowed', false, 'code', 'fair_use', 'message', 'Unlimited fair-use protection is temporarily active. Please continue tomorrow or contact support if this was normal use.');
  end if;
  insert into public.ai_usage_events(user_id, operation, request_key) values (current_user_id, requested_operation, requested_key)
    on conflict (user_id, operation, request_key) do update set status = 'reserved' returning id into created_event;
  return jsonb_build_object('allowed', true, 'event_id', created_event);
end; $$;

revoke all on function public.reserve_ai_usage(text,text) from public;
revoke all on function public.reserve_ai_usage(text,text) from anon;
grant execute on function public.reserve_ai_usage(text,text) to authenticated;
