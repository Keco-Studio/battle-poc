-- Migration: Enforce global unique character names
-- Purpose: Prevent multiple users from sharing the same display name in PVP search

-- 1) Normalize display names (trim spaces; fill empty names)
update public.player_saves
set character_name = coalesce(nullif(btrim(character_name), ''), 'Adventurer')
where character_name is null or character_name <> coalesce(nullif(btrim(character_name), ''), 'Adventurer');

-- 2) Auto-rename duplicates (case-insensitive) so the unique index can be created safely
with ranked as (
  select
    id,
    coalesce(nullif(btrim(character_name), ''), 'Adventurer') as base_name,
    row_number() over (
      partition by lower(coalesce(nullif(btrim(character_name), ''), 'Adventurer'))
      order by created_at asc, id asc
    ) as rn
  from public.player_saves
)
update public.player_saves p
set character_name = ranked.base_name || '-' || left(p.id::text, 6)
from ranked
where p.id = ranked.id and ranked.rn > 1;

-- 3) Enforce uniqueness at DB level (case-insensitive + trim-insensitive)
create unique index if not exists uq_player_saves_character_name_ci
  on public.player_saves ((lower(btrim(character_name))));
