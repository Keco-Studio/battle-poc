-- Migration: Allow authenticated users to read player_saves for PVP matchmaking list
-- Purpose: "Start battle" panel needs real opponent data (name + level) from player_saves

drop policy if exists player_saves_select_authenticated_pvp on public.player_saves;

create policy player_saves_select_authenticated_pvp on public.player_saves
  for select
  to authenticated
  using (true);
