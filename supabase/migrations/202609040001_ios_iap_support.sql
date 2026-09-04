-- Adds support for iOS subscriptions purchased through Apple In-App Purchase
-- (via RevenueCat) alongside the existing Stripe-billed web subscriptions.
-- Web billing is unchanged: Stripe columns and the checkout/portal/webhook
-- routes keep working exactly as before. This only adds the columns needed
-- to record an Apple-sourced subscription on the same per-user row.

alter table public.subscriptions
  add column if not exists source text not null default 'stripe' check (source in ('stripe','apple')),
  add column if not exists revenuecat_app_user_id text,
  add column if not exists apple_original_transaction_id text;

create unique index if not exists subscriptions_apple_original_transaction_id_key
  on public.subscriptions (apple_original_transaction_id)
  where apple_original_transaction_id is not null;

comment on column public.subscriptions.source is
  'Which billing system owns this row: stripe (web) or apple (iOS In-App Purchase via RevenueCat).';
comment on column public.subscriptions.revenuecat_app_user_id is
  'The RevenueCat app_user_id used for this purchase. Set to the Supabase user id when the iOS app calls Purchases.logIn(userId), so RevenueCat webhooks can be matched back to a user.';
comment on column public.subscriptions.apple_original_transaction_id is
  'Apple''s original_transaction_id for the subscription, used to de-duplicate renewal/cancellation events from RevenueCat.';
