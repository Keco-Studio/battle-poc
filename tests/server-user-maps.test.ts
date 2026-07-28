import { describe, expect, it } from 'vitest'
import {
  createUserMap,
  deleteUserMap,
  getUserMap,
  listUserMaps,
  persistUserMapWithBackground,
  signUserMapBackground,
  updateUserMap,
} from '@/src/lib/maps/server-user-maps'

function validProject() {
  return {
    config: {
      startingMap: 'map-1',
      playerSpawn: { x: 0, y: 0 },
    },
    maps: {
      'map-1': {
        id: 'map-1',
        width: 1,
        height: 1,
        tileLayers: { ground: { data: [0] } },
        collisionLayer: [0],
      },
    },
  }
}

describe('server user map operations', () => {
  it('lists maps through an explicit owner filter', async () => {
    const calls: unknown[][] = []
    const client = {
      from: (table: string) => {
        calls.push(['from', table])
        return {
          select: (columns: string) => {
            calls.push(['select', columns])
            return {
              eq: (column: string, value: string) => {
                calls.push(['eq', column, value])
                return {
                  order: async (column2: string, options: unknown) => {
                    calls.push(['order', column2, options])
                    return { data: [], error: null }
                  },
                }
              },
            }
          },
        }
      },
    }

    expect(await listUserMaps(client, 'owner-a')).toEqual({ ok: true, maps: [] })
    expect(calls).toContainEqual(['eq', 'owner_id', 'owner-a'])
  })

  it('validates map data and derives owner_id for inserts', async () => {
    const inserts: unknown[] = []
    const client = {
      from: () => ({
        insert: (value: unknown) => {
          inserts.push(value)
          return {
            select: () => ({
              single: async () => ({
                data: {
                  id: '47f7596d-5cb4-4a14-ae19-d1d2191ad782',
                  owner_id: 'owner-a',
                  name: 'Arena',
                  map_data: validProject(),
                  background_object_path: null,
                  created_at: '2026-07-28T00:00:00Z',
                  updated_at: '2026-07-28T00:00:00Z',
                },
                error: null,
              }),
            }),
          }
        },
      }),
    }

    const invalid = await createUserMap(client, 'owner-a', {
      name: 'Bad',
      mapData: { maps: {} },
    })
    expect(invalid).toMatchObject({ ok: false, status: 400 })
    expect(inserts).toHaveLength(0)

    const created = await createUserMap(client, 'owner-a', {
      name: ' Arena ',
      mapData: validProject(),
    })
    expect(created).toMatchObject({ ok: true, map: { name: 'Arena' } })
    expect(inserts).toEqual([
      expect.objectContaining({ owner_id: 'owner-a', name: 'Arena' }),
    ])
  })

  it('deletes only an owned row and then removes its exact private object', async () => {
    const filters: unknown[][] = []
    const removed: string[][] = []
    const client = {
      from: () => ({
        delete: () => ({
          eq: (column: string, value: string) => {
            filters.push([column, value])
            return {
              eq: (column2: string, value2: string) => {
                filters.push([column2, value2])
                return {
                  select: () => ({
                    maybeSingle: async () => ({
                      data: { background_object_path: 'owner-a/map-a/background.png' },
                      error: null,
                    }),
                  }),
                }
              },
            }
          },
        }),
      }),
      storage: {
        from: (bucket: string) => {
          expect(bucket).toBe('battle-user-map-assets')
          return {
            remove: async (paths: string[]) => {
              removed.push(paths)
              return { error: null }
            },
          }
        },
      },
    }

    const result = await deleteUserMap(client, 'owner-a', 'map-a')
    expect(result).toEqual({ ok: true })
    expect(filters).toEqual([
      ['id', 'map-a'],
      ['owner_id', 'owner-a'],
    ])
    expect(removed).toEqual([['owner-a/map-a/background.png']])
  })

  it('loads and updates maps through both id and owner filters', async () => {
    const filters: unknown[][] = []
    const row = {
      id: '47f7596d-5cb4-4a14-ae19-d1d2191ad782',
      owner_id: 'owner-a',
      name: 'Arena',
      map_data: validProject(),
      background_object_path: null,
      created_at: '2026-07-28T00:00:00Z',
      updated_at: '2026-07-28T00:00:00Z',
    }
    const terminal = {
      maybeSingle: async () => ({ data: row, error: null }),
    }
    const filtered = {
      eq: (column: string, value: string) => {
        filters.push([column, value])
        return terminal
      },
    }
    const client = {
      from: () => ({
        select: () => ({
          eq: (column: string, value: string) => {
            filters.push([column, value])
            return filtered
          },
        }),
        update: (value: unknown) => {
          expect(value).toMatchObject({ name: 'Renamed' })
          return {
            eq: (column: string, filterValue: string) => {
              filters.push([column, filterValue])
              return {
                eq: (column2: string, filterValue2: string) => {
                  filters.push([column2, filterValue2])
                  return {
                    select: () => terminal,
                  }
                },
              }
            },
          }
        },
      }),
    }

    expect(await getUserMap(client, 'owner-a', row.id)).toMatchObject({ ok: true })
    expect(await updateUserMap(client, 'owner-a', row.id, { name: ' Renamed ' })).toMatchObject({
      ok: true,
    })
    expect(filters).toEqual([
      ['id', row.id],
      ['owner_id', 'owner-a'],
      ['id', row.id],
      ['owner_id', 'owner-a'],
    ])
  })

  it('signs only background paths rooted under the current owner', async () => {
    const signed: unknown[][] = []
    const client = {
      from: () => ({}),
      storage: {
        from: (bucket: string) => {
          expect(bucket).toBe('battle-user-map-assets')
          return {
            createSignedUrl: async (path: string, expiresIn: number) => {
              signed.push([path, expiresIn])
              return { data: { signedUrl: 'https://signed.example/map.png' }, error: null }
            },
          }
        },
      },
    }

    expect(await signUserMapBackground(client, 'owner-a', 'owner-b/map.png')).toEqual({
      ok: false,
      status: 404,
      error: 'map_asset_not_found',
    })
    expect(await signUserMapBackground(client, 'owner-a', 'owner-a/map.png')).toEqual({
      ok: true,
      url: 'https://signed.example/map.png',
    })
    expect(signed).toEqual([['owner-a/map.png', 3600]])
  })

  it('persists generated maps and rolls the row back when private upload fails', async () => {
    const databaseDeletes: string[] = []
    const client = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: {
                id: '47f7596d-5cb4-4a14-ae19-d1d2191ad782',
                owner_id: 'owner-a',
                name: 'Generated',
                map_data: validProject(),
                background_object_path: null,
                created_at: '2026-07-28T00:00:00Z',
                updated_at: '2026-07-28T00:00:00Z',
              },
              error: null,
            }),
          }),
        }),
        delete: () => ({
          eq: (_column: string, id: string) => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => {
                  databaseDeletes.push(id)
                  return { data: { background_object_path: null }, error: null }
                },
              }),
            }),
          }),
        }),
      }),
      storage: {
        from: () => ({
          upload: async () => ({ data: null, error: { message: 'upload failed' } }),
          remove: async () => ({ error: null }),
          createSignedUrl: async () => ({ data: null, error: null }),
        }),
      },
    }

    expect(await persistUserMapWithBackground(client, 'owner-a', {
      name: 'Generated',
      mapData: validProject(),
      png: new Uint8Array([1, 2, 3]),
    })).toEqual({ ok: false, status: 500, error: 'upload failed' })
    expect(databaseDeletes).toEqual(['47f7596d-5cb4-4a14-ae19-d1d2191ad782'])
  })

  it('returns a private map reference and signed preview after a complete upload', async () => {
    const mapId = '47f7596d-5cb4-4a14-ae19-d1d2191ad782'
    const objectPath = `owner-a/${mapId}/background.png`
    const uploaded: unknown[][] = []
    const client = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: {
                id: mapId,
                owner_id: 'owner-a',
                name: 'Generated',
                map_data: validProject(),
                background_object_path: null,
                created_at: '2026-07-28T00:00:00Z',
                updated_at: '2026-07-28T00:00:00Z',
              },
              error: null,
            }),
          }),
        }),
        update: (value: { background_object_path?: string }) => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: mapId,
                    owner_id: 'owner-a',
                    name: 'Generated',
                    map_data: validProject(),
                    background_object_path: value.background_object_path,
                    created_at: '2026-07-28T00:00:00Z',
                    updated_at: '2026-07-28T00:00:01Z',
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
      storage: {
        from: () => ({
          upload: async (path: string, _png: Uint8Array, options: unknown) => {
            uploaded.push([path, options])
            return { data: { path }, error: null }
          },
          remove: async () => ({ error: null }),
          createSignedUrl: async () => ({
            data: { signedUrl: 'https://signed.example/generated.png' },
            error: null,
          }),
        }),
      },
    }

    expect(await persistUserMapWithBackground(client, 'owner-a', {
      name: 'Generated',
      mapData: validProject(),
      png: new Uint8Array([1, 2, 3]),
    })).toMatchObject({
      ok: true,
      mapRef: `user:${mapId}`,
      objectPath,
      previewUrl: 'https://signed.example/generated.png',
    })
    expect(uploaded).toEqual([[objectPath, { contentType: 'image/png', upsert: false }]])
  })
})
