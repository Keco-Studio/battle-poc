import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('private map route contract', () => {
  it('keeps private catalog and CRUD behind verified server users', () => {
    const catalog = read('app/api/maps/route.ts')
    const item = read('app/api/maps/[id]/route.ts')

    expect(catalog).toContain('requireServerUser')
    expect(catalog).toContain('listUserMaps')
    expect(catalog).toContain('createUserMap')
    expect(item).toContain('requireServerUser')
    expect(item).toContain('updateUserMap')
    expect(item).toContain('deleteUserMap')
  })

  it('owner-scopes private loads and never mutates deployment map files', () => {
    const loader = read('app/api/airpg-map/route.ts')
    const collision = read('app/api/maps/update-collision/route.ts')

    expect(loader).toContain('parseMapRef')
    expect(loader).toContain('getUserMap')
    expect(collision).toContain('parseMapRef')
    expect(collision).toContain('updateUserMap')
    expect(collision).not.toMatch(/\bwriteFile\b/)
    expect(existsSync('app/api/maps/[id]/route.ts')).toBe(true)
  })
})
