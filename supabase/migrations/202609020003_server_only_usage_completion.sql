-- Usage reservations are intentionally created through the signed-in RPC so
-- Postgres can lock and count the caller's plan atomically. Completion is now
-- performed only by server code with the Supabase secret key.
revoke all on function public.finish_ai_usage(uuid, boolean) from public;
revoke all on function public.finish_ai_usage(uuid, boolean) from anon;
revoke all on function public.finish_ai_usage(uuid, boolean) from authenticated;
