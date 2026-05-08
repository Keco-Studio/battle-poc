import { describe, expect, test } from 'vitest'
import { deleteCommandMeta, getCommandMeta, setCommandMeta } from '../app/components/map-ui/utils/commandMetaUtils'

describe('commandMetaUtils', () => {
  test('set/get/delete works with valid command id', () => {
    const store: Record<string, { v: number }> = {}
    setCommandMeta(store, 'c1', { v: 1 })
    expect(getCommandMeta(store, 'c1')).toEqual({ v: 1 })
    deleteCommandMeta(store, 'c1')
    expect(getCommandMeta(store, 'c1')).toBeUndefined()
  })

  test('empty command id is ignored', () => {
    const store: Record<string, { v: number }> = {}
    setCommandMeta(store, '', { v: 1 })
    expect(getCommandMeta(store, '')).toBeUndefined()
    deleteCommandMeta(store, '')
    expect(store).toEqual({})
  })
})
