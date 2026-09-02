create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  skin_type text not null default '',
  skin_tone text not null default '',
  experience text not null default '',
  makeup_goal text not null default '',
  products text[] not null default '{}',
  face_shape text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  price_id text,
  plan text check (plan in ('plus','unlimited')),
  status text not null default 'inactive',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_looks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  tutorial_source text,
  brief jsonb not null,
  preview_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in ('tutorial_analysis','preview_generation')),
  request_key text not null,
  status text not null default 'reserved' check (status in ('reserved','completed','failed')),
  created_at timestamptz not null default now(),
  unique (user_id, operation, request_key)
);

create index if not exists ai_usage_user_created_idx on public.ai_usage_events(user_id, created_at desc);
create index if not exists saved_looks_user_created_idx on public.saved_looks(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.saved_looks enable row level security;
alter table public.ai_usage_events enable row level security;

revoke all on public.profiles, public.subscriptions, public.saved_looks, public.ai_usage_events from anon;
grant select, insert, update, delete on public.profiles, public.saved_looks to authenticated;
grant select on public.subscriptions, public.ai_usage_events to authenticated;

drop policy if exists "profiles are private" on public.profiles;
create policy "profiles are private" on public.profiles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "subscriptions are private" on public.subscriptions;
create policy "subscriptions are private" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "saved looks are private" on public.saved_looks;
create policy "saved looks are private" on public.saved_looks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "usage is private" on public.ai_usage_events;
create policy "usage is private" on public.ai_usage_events for select to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('look-previews', 'look-previews', false, 8000000, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "private preview reads" on storage.objects;
create policy "private preview reads" on storage.objects for select to authenticated using (bucket_id = 'look-previews' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "private preview writes" on storage.objects;
create policy "private preview writes" on storage.objects for insert to authenticated with check (bucket_id = 'look-previews' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "private preview deletes" on storage.objects;
create policy "private preview deletes" on storage.objects for delete to authenticated using (bucket_id = 'look-previews' and (storage.foldername(name))[1] = (select auth.uid())::text);

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
  if current_plan = 'plus' and monthly_count >= 10 then
    return jsonb_build_object('allowed', false, 'code', 'monthly_limit', 'message', 'You have used this month''s 10 personalized routine credits. Your allowance resets next month, or you can switch to Unlimited.');
  end if;
  if current_plan = 'unlimited' and daily_count >= 30 then
    return jsonb_build_object('allowed', false, 'code', 'fair_use', 'message', 'Unlimited fair-use protection is temporarily active. Please continue tomorrow or contact support if this was normal use.');
  end if;
  insert into public.ai_usage_events(user_id, operation, request_key) values (current_user_id, requested_operation, requested_key)
    on conflict (user_id, operation, request_key) do update set status = 'reserved' returning id into created_event;
  return jsonb_build_object('allowed', true, 'event_id', created_event);
end; $$;

create or replace function public.finish_ai_usage(usage_event_id uuid, succeeded boolean)
returns void language sql security definer set search_path = public as $$
  update public.ai_usage_events set status = case when succeeded then 'completed' else 'failed' end
  where id = usage_event_id and user_id = auth.uid();
$$;

revoke all on function public.reserve_ai_usage(text,text) from public;
revoke all on function public.reserve_ai_usage(text,text) from anon;
grant execute on function public.reserve_ai_usage(text,text) to authenticated;
revoke all on function public.finish_ai_usage(uuid,boolean) from public;
revoke all on function public.finish_ai_usage(uuid,boolean) from anon;
grant execute on function public.finish_ai_usage(uuid,boolean) to authenticated;
