import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const roots = [
  'src/v3',
  'scripts/v3-content-source.json',
  'scripts/validate-v3-content.mjs',
  'tests',
]

const v3Test = /(?:^|\/)v3(?:-[^/]+)?\.(?:test|spec)\.ts$/
const sourceExtension = /\.(?:ts|tsx|mjs|json|css)$/

async function filesUnder(entry: string): Promise<string[]> {
  const absolute = path.resolve(entry)
  if ((await stat(absolute)).isFile()) return [entry]
  const children = await readdir(absolute, { withFileTypes: true })
  const nested = await Promise.all(children.map((child) => filesUnder(path.join(entry, child.name))))
  return nested.flat()
}

describe('V3 English-only source boundary', () => {
  it('contains no Han characters', async () => {
    const candidates = (await Promise.all(roots.map(filesUnder))).flat()
      .filter((file) => sourceExtension.test(file))
      .filter((file) => !file.startsWith('tests/') || v3Test.test(file))
    const offenders: string[] = []

    for (const file of candidates) {
      if (/\p{Script=Han}/u.test(await readFile(path.resolve(file), 'utf8'))) offenders.push(file)
    }

    expect(offenders).toEqual([])
  })
})
