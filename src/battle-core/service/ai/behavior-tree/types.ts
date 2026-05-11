export type BehaviorTreeNodeType = 'selector' | 'sequence' | 'condition' | 'action'

export type BehaviorMetric =
  | 'hp_ratio'
  | 'target_hp_ratio'
  | 'distance'
  | 'hp_disadvantage'
  | 'hp_advantage'
  | 'battle_phase_numeric'
  | 'consecutive_losing_trade'
  | 'near_edge'
  | 'has_any_ready_skill'
  | 'ready_skill_out_of_range'
  | 'no_ready_skill_in_range'
  | 'has_ready_skill'
  | 'basic_in_range'
  | 'recent_dash_rejects'
  | 'recent_blocked_rejects'
  | 'dash_cooldown_active'
  | 'dash_streak_locked'

export type BehaviorConditionOperator = '<' | '<=' | '>' | '>=' | '==' | '!='

export type BehaviorActionType = 'basic_attack' | 'cast_skill' | 'dash' | 'dodge' | 'flee'

export type BehaviorActionTarget = 'approach' | 'retreat' | 'hold' | 'center'

type BehaviorTreeNodeBase = {
  id: string
  name?: string
}

export type BehaviorControlNode = BehaviorTreeNodeBase & {
  type: 'selector' | 'sequence'
  children: BehaviorTreeNode[]
}

export type BehaviorConditionNode = BehaviorTreeNodeBase & {
  type: 'condition'
  metric: BehaviorMetric
  operator?: BehaviorConditionOperator
  value?: number
}

export type BehaviorActionNode = BehaviorTreeNodeBase & {
  type: 'action'
  action: BehaviorActionType
  target?: BehaviorActionTarget
  skillId?: string
  moveStep?: number
}

export type BehaviorTreeNode = BehaviorControlNode | BehaviorConditionNode | BehaviorActionNode

export type BehaviorTreeState = {
  treeId: string
  version: number
  updatedAtTick: number
  root: BehaviorTreeNode
}

export type SetConditionValueOperation = {
  op: 'set_condition_value'
  nodeId: string
  value: number
}

export type ReplaceActionOperation = {
  op: 'replace_action'
  nodeId: string
  action: BehaviorActionType
  target?: BehaviorActionTarget
  moveStep?: number
  skillId?: string
}

export type ReorderChildrenOperation = {
  op: 'reorder_children'
  nodeId: string
  orderedChildIds: string[]
}

export type BehaviorTreePatchOperation =
  | SetConditionValueOperation
  | ReplaceActionOperation
  | ReorderChildrenOperation

export type BehaviorTreePatch = {
  baseVersion?: number
  reason?: string
  ops: BehaviorTreePatchOperation[]
}
