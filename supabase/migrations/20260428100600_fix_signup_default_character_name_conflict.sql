-- Fix: sign-up can fail with "Database error saving new user" when default
-- character_name ('Adventurer') conflicts with unique index.
--
-- Root cause:
-- - on_auth_user_created_save trigger inserts into public.player_saves(user_id)
-- - character_name falls back to default 'Adventurer'
-- - uq_player_saves_character_name_ci enforces uniqueness (case-insensitive)
--
-- Solution:
-- - Generate a unique default character_name per new user.

create or replace function public.handle_new_user_save()
returns trigger as $$
begin
  insert into public.player_saves (user_id, character_name)
  values (new.id, 'Adventurer-' || left(new.id::text, 6))
  on conflict (user_id) do nothing;

  return new;
end;
$$ language plpgsql security definer;
