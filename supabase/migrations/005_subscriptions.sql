-- supabase/migrations/005_subscriptions.sql

create type subscription_plan as enum ('free', 'pro', 'max');
create type subscription_status as enum ('active', 'trialing', 'past_due', 'canceled', 'incomplete');

create table subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  plan subscription_plan not null default 'free',
  status subscription_status not null default 'active',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_subscriptions_user_id on subscriptions(user_id);
create index idx_subscriptions_stripe_customer_id on subscriptions(stripe_customer_id);
create index idx_subscriptions_stripe_subscription_id on subscriptions(stripe_subscription_id);

alter table subscriptions enable row level security;

create policy "Users can view own subscription"
  on subscriptions for select using (auth.uid() = user_id);

-- Auto-create free subscription on user signup
create or replace function public.handle_new_user_subscription()
returns trigger as $$
begin
  insert into public.subscriptions (user_id, plan, status)
  values (new.id, 'free', 'active');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row execute function public.handle_new_user_subscription();

-- Auto-update updated_at
create or replace function public.update_subscriptions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger subscriptions_updated_at
  before update on subscriptions
  for each row execute function public.update_subscriptions_updated_at();
