import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath =
  'supabase/migrations/20260728000001_private_maps_ordered_saves_and_pvp_projection.sql'

describe('private map and ordered save migration', () => {
  it('adds ordered saves, owner-only maps, private assets, and a restricted PVP projection', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('save_revision bigint not null default 0')
    expect(sql).toContain('current_map_ref text not null')
    expect(sql).toContain('create table public.user_maps')
    expect(sql).toContain("'battle-user-map-assets'")
    expect(sql).toContain('drop policy if exists player_saves_select_authenticated_pvp')
    expect(sql).toContain('function public.list_pvp_opponents')
    expect(sql).toContain(
      'revoke all on function public.list_pvp_opponents(integer) from public',
    )
  })

  it('keeps private maps owner-scoped and never restores the broad PVP policy', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql.match(/auth\.uid\(\)\s*=\s*owner_id/g)?.length).toBeGreaterThanOrEqual(4)
    expect(sql).toContain("storage.foldername(name))[1] = (select auth.uid()::text)")
    expect(sql).not.toMatch(/create policy player_saves_select_authenticated_pvp/i)
  })
})
