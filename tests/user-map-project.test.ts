import { describe, expect, it } from 'vitest'
import { validateMapProject } from '@/src/lib/maps/map-project'

function validProject() {
  return {
    version: 1,
    metadata: { name: 'Private Arena' },
    config: {
      startingMap: 'map-1',
      playerSpawn: { x: 0, y: 0 },
    },
    maps: {
      'map-1': {
        id: 'map-1',
        width: 2,
        height: 2,
        tileLayers: { ground: { data: [0, 0, 0, 0] } },
        collisionLayer: [0, 0, 0, 0],
        entities: [
          { instanceId: 'e1', entityDefId: 'guard', position: { x: 1, y: 1 } },
        ],
      },
    },
    entityDefs: {},
  }
}

describe('validateMapProject', () => {
  it('accepts the existing project-like map shape', () => {
    const result = validateMapProject(validProject())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.config.startingMap).toBe('map-1')
      expect(result.value.maps['map-1'].collisionLayer).toHaveLength(4)
    }
  })

  it('rejects ground and collision arrays that do not match dimensions', () => {
    const project = validProject()
    project.maps['map-1'].collisionLayer = [0]

    expect(validateMapProject(project)).toEqual({
      ok: false,
      error: 'collisionLayer length must equal width * height',
    })
  })

  it('rejects non-finite spawn and entity coordinates', () => {
    const badSpawn = validProject()
    badSpawn.config.playerSpawn.x = Number.NaN
    expect(validateMapProject(badSpawn)).toMatchObject({ ok: false })

    const badEntity = validProject()
    badEntity.maps['map-1'].entities[0].position.y = Number.POSITIVE_INFINITY
    expect(validateMapProject(badEntity)).toMatchObject({ ok: false })
  })

  it('rejects maps larger than the supported grid', () => {
    const project = validProject()
    project.maps['map-1'].width = 129

    expect(validateMapProject(project)).toEqual({
      ok: false,
      error: 'map dimensions must be integers between 1 and 128',
    })
  })
})

