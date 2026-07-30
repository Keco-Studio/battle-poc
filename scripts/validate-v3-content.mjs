import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const sourcePath = path.join(root, 'scripts', 'v3-content-source.json')
const provenancePath = path.join(root, 'src', 'content', 'generated', 'v3', 'provenance.json')
const sourceText = await readFile(sourcePath, 'utf8')
const source = JSON.parse(sourceText)
const errors = []

function unique(rows, label) {
  const seen = new Set()
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) errors.push(`${label}: duplicate or missing id ${row.id ?? '<empty>'}`)
    seen.add(row.id)
  }
  return seen
}

const skills = unique(source.content.skills, 'skills')
const enemies = unique(source.content.enemies, 'enemies')
const maps = unique(source.content.maps, 'maps')
const encounters = unique(source.content.encounters, 'encounters')
const rewards = unique(source.content.rewards, 'rewards')
unique(source.content.progression, 'progression')
const trees = unique(source.content.trees, 'trees')
const assets = unique(source.content.assets, 'assets')

for (const row of [...source.content.jobs, ...source.content.enemies]) {
  if (row.skillIds.length !== 4) errors.push(`${row.id}: expected four equipped skills`)
  for (const id of row.skillIds) if (!skills.has(id)) errors.push(`${row.id}: missing skill ${id}`)
  if (!assets.has(row.visualAssetId)) errors.push(`${row.id}: missing visual ${row.visualAssetId}`)
  if (!trees.has(row.treeId)) errors.push(`${row.id}: missing tree ${row.treeId}`)
}

for (const skill of source.content.skills) {
  if (!assets.has(skill.iconAssetId)) errors.push(`${skill.id}: missing icon ${skill.iconAssetId}`)
  if (!assets.has(skill.fxAssetId)) errors.push(`${skill.id}: missing fx ${skill.fxAssetId}`)
}

for (const map of source.content.maps) {
  if (map.kind === 'battle' && (map.width !== 16 || map.height !== 16)) errors.push(`${map.id}: battle map must be 16x16`)
  if (!assets.has(map.backgroundAssetId)) errors.push(`${map.id}: missing background ${map.backgroundAssetId}`)
}

for (const encounter of source.content.encounters) {
  if (!maps.has(encounter.explorationMapId) || !maps.has(encounter.battleMapId)) errors.push(`${encounter.id}: missing map reference`)
  if (!enemies.has(encounter.enemyId)) errors.push(`${encounter.id}: missing enemy ${encounter.enemyId}`)
  if (!rewards.has(encounter.rewardId)) errors.push(`${encounter.id}: missing reward ${encounter.rewardId}`)
  for (const id of encounter.unlockAfterIds) if (!encounters.has(id)) errors.push(`${encounter.id}: missing prerequisite ${id}`)
}

const progressionDrops = new Set()
const rewardDrops = new Set(source.content.rewards.map((reward) => reward.dropId))
for (const bonus of source.content.progression) {
  if (bonus.contentVersion !== source.contentVersion) errors.push(`${bonus.id}: content version mismatch`)
  if (!rewardDrops.has(bonus.dropId)) errors.push(`${bonus.id}: missing reward drop ${bonus.dropId}`)
  if (progressionDrops.has(bonus.dropId)) errors.push(`${bonus.id}: duplicate drop ${bonus.dropId}`)
  progressionDrops.add(bonus.dropId)
  for (const stat of ['hp', 'energy', 'atk', 'def', 'spd']) {
    if (!Number.isInteger(bonus[stat]) || bonus[stat] < 0) errors.push(`${bonus.id}: invalid ${stat}`)
  }
}

for (const asset of source.content.assets.filter((row) => row.kind === 'character')) {
  if (asset.framesPerDirection !== 8) errors.push(`${asset.id}: expected eight frames per direction`)
  if ((asset.directions ?? []).length !== 8) errors.push(`${asset.id}: expected eight directions`)
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join('\n')}\n`)
  process.exitCode = 1
} else {
  const contentFingerprint = createHash('sha256').update(sourceText).digest('hex')
  const provenance = JSON.parse(await readFile(provenancePath, 'utf8'))
  provenance.contentFingerprint = contentFingerprint
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`)
  process.stdout.write(`V3 content graph valid: 0 errors\ncontent fingerprint: ${contentFingerprint}\n`)
}
