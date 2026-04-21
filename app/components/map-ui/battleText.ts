export type TacticalMode = 'aggressive_finish' | 'kite_and_cast' | 'flee_and_reset' | 'steady_trade'

export function strategyLabel(strategy: unknown): string | null {
  if (typeof strategy !== 'string') return null
  const map: Record<TacticalMode, string> = {
    aggressive_finish: '强攻收割',
    kite_and_cast: '拉扯施法',
    flee_and_reset: '撤离重整',
    steady_trade: '稳态换血',
  }
  return map[strategy as TacticalMode] ?? null
}

export function reasonLabel(reason: unknown): string | null {
  if (typeof reason !== 'string') return null
  const map: Record<string, string> = {
    manual_flee: '手动逃跑',
    auto_flee: '自动逃跑',
    enemy_cast_control: '敌方控制施法',
    enemy_cast_burst: '敌方爆发施法',
    enemy_dodge_retreat: '敌方规避后撤',
    enemy_dash_retreat: '敌方拉开距离',
    enemy_dash_approach: '敌方贴近走位',
    enemy_dash_kite: '敌方风筝后撤',
    enemy_basic_attack: '敌方普通攻击',
    player_dash_approach: '为技能贴近走位',
    player_dash_kite: '为技能拉扯后撤',
    player_dodge_retreat: '玩家规避后撤',
    player_basic_attack: '玩家普通攻击',
    player_basic_attack_fallback: '技能不可用，回退普攻',
    player_defend: '玩家防御',
    player_cast_skill: '玩家施放技能',
  }
  return map[reason] ?? reason
}

export function rejectReasonLabel(reason: string): string {
  const map: Record<string, string> = {
    battle_ended: '战斗已结束',
    actor_not_found: '执行者不存在',
    actor_dead: '执行者已阵亡',
    actor_controlled: '处于受控状态',
    target_not_found: '目标不存在',
    target_out_of_range: '超出射程',
    not_enough_stamina: '耐力不足',
    not_enough_mp: '法力不足',
    missing_skill_id: '技能参数缺失',
    skill_not_found: '技能不存在',
    skill_not_equipped: '技能未装备',
    skill_on_cooldown: '技能冷却中',
    flee_failed: '逃跑概率未通过',
    action_not_implemented: '动作未实现',
  }
  return map[reason] ?? reason
}

export function actionLabel(action: unknown): string {
  if (typeof action !== 'string') return '行动'
  if (action === 'basic_attack') return '普通攻击'
  if (action === 'cast_skill') return '施放技能'
  if (action === 'defend') return '防御'
  if (action === 'dash') return '位移'
  if (action === 'dodge') return '闪避'
  if (action === 'flee') return '逃跑'
  return action
}

export const ENEMY_MESSAGES = [
  '我是魔王我很强！',
  '再看就把你吃掉！',
  '劝你早点逃跑吧...',
  '这片区域是我的！',
  '哼，不自量力的人类',
  '别惹我，我很危险！',
  '你已经引起了我的注意',
  '愚蠢的冒险者...',
] as const

