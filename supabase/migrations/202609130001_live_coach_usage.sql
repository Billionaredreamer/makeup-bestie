create table if not exists public.live_coach_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null,
  model text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer,
  end_reason text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  input_audio_tokens bigint not null default 0,
  output_audio_tokens bigint not null default 0,
  cached_input_tokens bigint not null default 0,
  constraint live_coach_duration_range check (duration_seconds is null or duration_seconds between 0 and 660)
);

alter table public.live_coach_sessions enable row level security;
revoke all on public.live_coach_sessions from anon, authenticated;

create unique index if not exists live_coach_one_active_session_per_user
  on public.live_coach_sessions (user_id) where ended_at is null;
create index if not exists live_coach_sessions_user_started_idx
  on public.live_coach_sessions (user_id, started_at desc);

create or replace view public.live_coach_usage_30d
with (security_invoker = true) as
select
  user_id,
  plan,
  count(*) filter (where ended_at is not null and end_reason <> 'error') as session_count,
  round(coalesce(sum(duration_seconds), 0)::numeric / 60, 2) as total_minutes,
  coalesce(sum(input_tokens), 0) as input_tokens,
  coalesce(sum(output_tokens), 0) as output_tokens,
  coalesce(sum(input_audio_tokens), 0) as input_audio_tokens,
  coalesce(sum(output_audio_tokens), 0) as output_audio_tokens,
  coalesce(sum(cached_input_tokens), 0) as cached_input_tokens
from public.live_coach_sessions
where started_at >= now() - interval '30 days'
group by user_id, plan;

revoke all on public.live_coach_usage_30d from anon, authenticated;
