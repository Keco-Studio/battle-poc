-- Account-private maps, ordered player saves, and a least-privilege PVP projection.

alter table public.player_saves
  add column if not exists current_map_ref text not null
    default 'builtin:top-down-pixel-art-rpg-battle-arena-map-wide-ope-1777006352683',
  add column if not exists save_revision bigint not null default 0,
  add column if not exists combat_max_hp integer,
  add column if not exists combat_atk numeric,
  add column if not exists combat_def numeric,
  add column if not exists combat_spd numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'player_saves_revision_non_negative'
  ) then
    alter table public.player_saves
      add constraint player_saves_revision_non_negative check (save_revision >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'player_saves_combat_max_hp_positive'
  ) then
    alter table public.player_saves
      add constraint player_saves_combat_max_hp_positive
      check (combat_max_hp is null or combat_max_hp > 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'player_saves_combat_atk_non_negative'
  ) then
    alter table public.player_saves
      add constraint player_saves_combat_atk_non_negative
      check (combat_atk is null or combat_atk >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'player_saves_combat_def_non_negative'
  ) then
    alter table public.player_saves
      add constraint player_saves_combat_def_non_negative
      check (combat_def is null or combat_def >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'player_saves_combat_spd_non_negative'
  ) then
    alter table public.player_saves
      add constraint player_saves_combat_spd_non_negative
      check (combat_spd is null or combat_spd >= 0);
  end if;
end
$$;

create table public.user_maps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  map_data jsonb not null,
  background_object_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_maps_name_not_empty check (length(trim(name)) > 0),
  constraint user_maps_name_length check (length(name) <= 80),
  constraint user_maps_owner_name_unique unique (owner_id, name)
);

create index if not exists user_maps_owner_updated_idx
  on public.user_maps(owner_id, updated_at desc);

drop trigger if exists trg_user_maps_updated_at on public.user_maps;
create trigger trg_user_maps_updated_at
  before update on public.user_maps
  for each row execute function public.update_updated_at_column();

alter table public.user_maps enable row level security;

drop policy if exists user_maps_select_own on public.user_maps;
create policy user_maps_select_own on public.user_maps
  for select to authenticated
  using (auth.uid() = owner_id);

drop policy if exists user_maps_insert_own on public.user_maps;
create policy user_maps_insert_own on public.user_maps
  for insert to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists user_maps_update_own on public.user_maps;
create policy user_maps_update_own on public.user_maps
  for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists user_maps_delete_own on public.user_maps;
create policy user_maps_delete_own on public.user_maps
  for delete to authenticated
  using (auth.uid() = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'battle-user-map-assets',
  'battle-user-map-assets',
  false,
  10485760,
  array['image/png']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists battle_user_map_assets_select_own on storage.objects;
create policy battle_user_map_assets_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'battle-user-map-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists battle_user_map_assets_insert_own on storage.objects;
create policy battle_user_map_assets_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'battle-user-map-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists battle_user_map_assets_update_own on storage.objects;
create policy battle_user_map_assets_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'battle-user-map-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'battle-user-map-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists battle_user_map_assets_delete_own on storage.objects;
create policy battle_user_map_assets_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'battle-user-map-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- Row-level policies cannot restrict selected columns. Replace the broad PVP
-- policy with a function whose return type is the public opponent contract.
drop policy if exists player_saves_select_authenticated_pvp on public.player_saves;

create or replace function public.list_pvp_opponents(p_limit integer default 100)
returns table (
  user_id uuid,
  character_name text,
  level integer,
  job_class_id text,
  combat_max_hp integer,
  combat_atk numeric,
  combat_def numeric,
  combat_spd numeric,
  carried_skill_ids text[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
  select
    ps.user_id,
    ps.character_name,
    ps.level,
    ps.job_class_id,
    ps.combat_max_hp,
    ps.combat_atk,
    ps.combat_def,
    ps.combat_spd,
    ps.carried_skill_ids
  from public.player_saves as ps
  where ps.user_id <> auth.uid()
  order by ps.level desc, ps.updated_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
end;
$$;

revoke all on function public.list_pvp_opponents(integer) from public;
grant execute on function public.list_pvp_opponents(integer) to authenticated;
