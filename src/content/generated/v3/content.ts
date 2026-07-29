import source from '@/scripts/v3-content-source.json'

import type {
  V3Asset,
  V3BehaviorTree,
  V3Content,
  V3Encounter,
  V3Enemy,
  V3Job,
  V3Map,
  V3Reward,
  V3Skill,
} from './types'

export const V3_CONTENT_VERSION = source.contentVersion
export const V3_RULESET_VERSION = source.rulesetVersion
export const V3_VISUAL_VERSION = source.visualVersion

function recordById<T extends { id: string }>(rows: T[]): Record<string, T> {
  return Object.fromEntries(rows.map((row) => [row.id, row]))
}

export const V3_CONTENT: V3Content = {
  game: source.content.game,
  jobs: recordById(source.content.jobs as V3Job[]),
  skills: recordById(source.content.skills as V3Skill[]),
  enemies: recordById(source.content.enemies as V3Enemy[]),
  maps: recordById(source.content.maps as unknown as V3Map[]),
  encounters: recordById(source.content.encounters as V3Encounter[]),
  rewards: recordById(source.content.rewards as V3Reward[]),
  trees: recordById(source.content.trees as unknown as V3BehaviorTree[]),
  rules: source.content.rules,
  assets: recordById(source.content.assets as V3Asset[]),
}

export function validateV3ContentGraph(content: V3Content): string[] {
  const errors: string[] = []
  const has = (collection: Record<string, unknown>, id: string, ref: string) => {
    if (!collection[id]) errors.push(`${ref}:${id}`)
  }

  has(content.maps, content.game.defaultExplorationMapId, 'game:map')
  has(content.jobs, content.game.defaultJobId, 'game:job')

  for (const job of Object.values(content.jobs)) {
    has(content.assets, job.visualAssetId, `job:${job.id}:asset`)
    has(content.trees, job.treeId, `job:${job.id}:tree`)
    for (const skillId of job.skillIds) has(content.skills, skillId, `job:${job.id}:skill`)
  }

  for (const enemy of Object.values(content.enemies)) {
    has(content.assets, enemy.visualAssetId, `enemy:${enemy.id}:asset`)
    has(content.trees, enemy.treeId, `enemy:${enemy.id}:tree`)
    for (const skillId of enemy.skillIds) has(content.skills, skillId, `enemy:${enemy.id}:skill`)
  }

  for (const skill of Object.values(content.skills)) {
    has(content.assets, skill.iconAssetId, `skill:${skill.id}:icon`)
    has(content.assets, skill.fxAssetId, `skill:${skill.id}:fx`)
  }

  for (const map of Object.values(content.maps)) {
    has(content.assets, map.backgroundAssetId, `map:${map.id}:asset`)
    if (map.kind === 'battle' && (map.width !== 16 || map.height !== 16)) {
      errors.push(`map:${map.id}:battle_size`)
    }
  }

  for (const encounter of Object.values(content.encounters)) {
    has(content.maps, encounter.explorationMapId, `encounter:${encounter.id}:exploration`)
    has(content.maps, encounter.battleMapId, `encounter:${encounter.id}:battle`)
    has(content.enemies, encounter.enemyId, `encounter:${encounter.id}:enemy`)
    has(content.rewards, encounter.rewardId, `encounter:${encounter.id}:reward`)
    for (const prerequisite of encounter.unlockAfterIds) {
      has(content.encounters, prerequisite, `encounter:${encounter.id}:unlock`)
    }
  }

  for (const tree of Object.values(content.trees)) {
    if (!tree.tree.nodes[tree.tree.rootId]) errors.push(`tree:${tree.id}:root`)
    for (const node of Object.values(tree.tree.nodes)) {
      for (const childId of node.children ?? []) {
        if (!tree.tree.nodes[childId]) errors.push(`tree:${tree.id}:child:${childId}`)
      }
      if (node.skillId) has(content.skills, node.skillId, `tree:${tree.id}:skill`)
    }
  }

  return errors
}
