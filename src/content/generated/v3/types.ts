export type V3Point = { x: number; y: number }
export type V3Direction = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

export type V3Skill = {
  id: string
  name: string
  description: string
  contentVersion: string
  category: 'burst' | 'control' | 'sustain' | 'mobility' | 'utility' | 'execute'
  power: number
  energyCost: number
  range: number
  cooldownTicks: number
  areaRadius: number
  moveTiles: number
  shield: number
  heal: number
  status: 'none' | 'root' | 'atk_down' | 'def_down'
  statusTicks: number
  statusValue: number
  iconAssetId: string
  fxAssetId: string
}

export type V3CombatantTemplate = {
  id: string
  name: string
  description: string
  contentVersion: string
  hp: number
  energy: number
  atk: number
  def: number
  spd: number
  skillIds: string[]
  visualAssetId: string
  treeId: string
}

export type V3Job = V3CombatantTemplate
export type V3Enemy = V3CombatantTemplate & { title: string; boss: boolean }

export type V3Map = {
  id: string
  name: string
  kind: 'exploration' | 'battle'
  contentVersion: string
  width: number
  height: number
  backgroundAssetId: string
  obstacles: [number, number][]
  spawns: Record<string, V3Point>
  safeBeacon: V3Point | null
}

export type V3Encounter = {
  id: string
  name: string
  contentVersion: string
  explorationMapId: string
  battleMapId: string
  enemyId: string
  rewardId: string
  x: number
  y: number
  unlockAfterIds: string[]
  boss: boolean
}

export type V3Reward = {
  id: string
  name: string
  contentVersion: string
  exp: number
  starlight: number
  dropId: string
  description: string
}

export type V3BehaviorNode = {
  id: string
  kind: 'selector' | 'sequence' | 'condition' | 'action'
  children?: string[]
  metric?: string
  op?: 'lte' | 'gte' | 'eq'
  value?: number
  action?: 'skill' | 'best_attack' | 'move' | 'guard' | 'wait'
  skillId?: string
}

export type V3BehaviorTreeState = {
  version: number
  rootId: string
  nodes: Record<string, V3BehaviorNode>
}

export type V3BehaviorTree = {
  id: string
  name: string
  contentVersion: string
  ownerType: 'player' | 'enemy'
  preset: 'balanced' | 'aggressive' | 'control' | 'survival'
  tree: V3BehaviorTreeState
}

export type V3Asset = {
  id: string
  kind: 'map' | 'character' | 'skill_icon' | 'skill_fx'
  ownerId: string
  localPath: string
  width: number
  height: number
  transparent: boolean
  seed: number
  directions?: V3Direction[]
  framesPerDirection?: number
  fps?: number
}

export type V3Rules = {
  id: string
  contentVersion: string
  maxDecisionTicks: number
  decisionTimeoutMs: number
  maxPatchOps: number
  antiLoopWindow: number
  moveTiles: number
  guardReduction: number
  defaultSeed: number
}

export type V3Content = {
  game: {
    id: string
    name: string
    theme: string
    contentVersion: string
    rulesetVersion: string
    visualVersion: string
    defaultExplorationMapId: string
    defaultJobId: string
    maxDecisionTicks: number
    defaultModel: string
  }
  jobs: Record<string, V3Job>
  skills: Record<string, V3Skill>
  enemies: Record<string, V3Enemy>
  maps: Record<string, V3Map>
  encounters: Record<string, V3Encounter>
  rewards: Record<string, V3Reward>
  trees: Record<string, V3BehaviorTree>
  rules: V3Rules
  assets: Record<string, V3Asset>
}
