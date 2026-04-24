-- Migration: Add overrides column to map_enemies
-- Purpose: Support per-instance stat/visual overrides (used in pixel-npc.json entities)
-- Example: {"visualId": "pixellab:xxx", "battleProfile": {"maxHp": 72, "atk": 8}}

alter table public.map_enemies
  add column if not exists overrides jsonb;
