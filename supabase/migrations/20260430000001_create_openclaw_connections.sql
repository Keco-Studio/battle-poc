-- Migration: Create openclaw_connections table
-- Purpose: Store per-user OpenClaw Chat Bridge connection config (A1: user-hosted gateway/bridge)

create table if not exists public.openclaw_connections (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,

  -- Base URL only, e.g. https://my-bridge.example.com (no path/query).
  gateway_url        text not null,
  webhook_path       text not null default '/battle/openclaw/chat',
  health_path        text not null default '/battle/openclaw/health',

  -- How to authenticate to the user's bridge.
  -- - bearer: Authorization: Bearer <token>
  -- - header_secret: x-openclaw-webhook-secret: <token>
  auth_type          text not null default 'bearer',

  -- Encrypted secret/token. Never returned to the client.
  secret_ciphertext  text not null,

  -- Optional default agent to invoke.
  agent_id           text,

  enabled            boolean not null default true,
  last_health_at     timestamptz,
  last_health_ok     boolean,
  last_error         text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint openclaw_connections_user_unique unique (user_id),
  constraint openclaw_connections_gateway_url_not_empty check (length(trim(gateway_url)) > 0),
  constraint openclaw_connections_webhook_path_not_empty check (length(trim(webhook_path)) > 0),
  constraint openclaw_connections_health_path_not_empty check (length(trim(health_path)) > 0),
  constraint openclaw_connections_auth_type_valid check (auth_type in ('bearer', 'header_secret'))
);

create index if not exists idx_openclaw_connections_user_id on public.openclaw_connections (user_id);

create trigger trg_openclaw_connections_updated_at
  before update on public.openclaw_connections
  for each row execute function public.update_updated_at_column();

-- ─────────────────────────────────────────────
-- RLS — users can only access their own config
-- ─────────────────────────────────────────────
alter table public.openclaw_connections enable row level security;

create policy openclaw_connections_select_own on public.openclaw_connections
  for select using (auth.uid() = user_id);

create policy openclaw_connections_insert_own on public.openclaw_connections
  for insert with check (auth.uid() = user_id);

create policy openclaw_connections_update_own on public.openclaw_connections
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy openclaw_connections_delete_own on public.openclaw_connections
  for delete using (auth.uid() = user_id);

