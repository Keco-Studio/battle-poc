/**
 * Database row types — mirrors the Supabase schema.
 * Keep in sync with supabase/migrations/*.sql
 */

// ─────────────────────────────────────────────
// Static game data (read-only for players)
// ─────────────────────────────────────────────

export type SkillCategory = 'burst' | 'control' | 'sustain' | 'mobility' | 'utility' | 'execute'

export interface SkillRow {
  id: string
  name: string
  description: string | null
  category: SkillCategory | null
  ratio: number
  mp_cost: number
  range: number
  /** Raw cooldown ticks — multiply by SKILL_COOLDOWN_MULTIPLIER (10) before use */
  cooldown_ticks: number
  apply_freeze_ticks: number | null
  shatter_bonus_ratio: number | null
  consume_freeze_on_hit: boolean | null
  params: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type PreferredRange = 'melee' | 'mid' | 'ranged'

export interface JobClassRow {
  id: string
  name: string
  description: string | null
  preferred_range: PreferredRange
  strategy_hint: string | null
  base_hp: number
  base_atk: number
  base_def: number
  base_spd: number
  growth_hp: number
  growth_atk: number
  growth_def: number
  growth_spd: number
  hp_multiplier: number
  base_stamina: number
  base_max_shield: number
  base_mp_ratio: number
  created_at: string
}

export interface JobClassSkillRow {
  job_class_id: string
  skill_id: string
  is_signature: boolean
  is_default: boolean
}

// ─────────────────────────────────────────────
// Player data
// ─────────────────────────────────────────────

export type EquipmentType = 'weapon' | 'ring' | 'armor' | 'shoes'

export interface EquippedItem {
  name: string
  icon: string
}

export interface InventoryItem {
  type: EquipmentType
  name: string
  icon: string
}

export interface PlayerSaveRow {
  id: string
  user_id: string
  character_name: string
  job_class_id: string | null
  level: number
  exp: number
  gold: number
  /** null means full HP; compute maxHp from job class + level to resolve */
  current_hp: number | null
  pos_x: number
  pos_y: number
  equipped_weapon: EquippedItem | null
  equipped_ring: EquippedItem | null
  equipped_armor: EquippedItem | null
  equipped_shoes: EquippedItem | null
  inventory: InventoryItem[]
  carried_skill_ids: string[]
  created_at: string
  updated_at: string
}

export type PlayerSaveInsert = Omit<PlayerSaveRow, 'id' | 'created_at' | 'updated_at'>
export type PlayerSaveUpdate = Partial<Omit<PlayerSaveRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>

// ─────────────────────────────────────────────
// Battle history
// ─────────────────────────────────────────────

export type BattleResult = 'win' | 'lose'
export type BattleType = 'pve' | 'pvp'

export interface BattleHistoryRow {
  id: string
  user_id: string
  result: BattleResult
  battle_type: BattleType
  opponent_name: string | null
  enemy_level: number | null
  rounds: number | null
  exp_gained: number
  gold_gained: number
  created_at: string
}

export type BattleHistoryInsert = Omit<BattleHistoryRow, 'id' | 'created_at'>

// ─────────────────────────────────────────────
// Enemy data
// ─────────────────────────────────────────────

export type EnemyType = 'monster' | 'boss' | 'npc'

export interface EnemyStatProfile {
  maxHp?: number | null
  atk?: number | null
  def?: number | null
  spd?: number | null
}

export interface EnemyTemplateRow {
  id: string
  name: string
  type: EnemyType
  visual_id: string | null
  sprite_tile_index: number | null
  level: number
  stat_profile: EnemyStatProfile | null
  skill_ids: string[]
  drop_exp: number
  drop_gold_min: number
  drop_gold_max: number
  description: string | null
  created_at: string
  updated_at: string
}

export interface MapEnemyRow {
  id: string
  map_id: string
  instance_id: string
  template_id: string | null
  spawn_x: number
  spawn_y: number
  created_at: string
}

// ─────────────────────────────────────────────
// Supabase Database generic type (for typed client)
// ─────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      skills: {
        Row: SkillRow
        Insert: Omit<SkillRow, 'created_at' | 'updated_at'>
        Update: Partial<Omit<SkillRow, 'id' | 'created_at' | 'updated_at'>>
      }
      job_classes: {
        Row: JobClassRow
        Insert: Omit<JobClassRow, 'created_at'>
        Update: Partial<Omit<JobClassRow, 'id' | 'created_at'>>
      }
      job_class_skills: {
        Row: JobClassSkillRow
        Insert: JobClassSkillRow
        Update: Partial<Pick<JobClassSkillRow, 'is_signature' | 'is_default'>>
      }
      player_saves: {
        Row: PlayerSaveRow
        Insert: PlayerSaveInsert
        Update: PlayerSaveUpdate
      }
      battle_history: {
        Row: BattleHistoryRow
        Insert: BattleHistoryInsert
        Update: never
      }
      enemy_templates: {
        Row: EnemyTemplateRow
        Insert: Omit<EnemyTemplateRow, 'created_at' | 'updated_at'>
        Update: Partial<Omit<EnemyTemplateRow, 'id' | 'created_at' | 'updated_at'>>
      }
      map_enemies: {
        Row: MapEnemyRow
        Insert: Omit<MapEnemyRow, 'id' | 'created_at'>
        Update: Partial<Omit<MapEnemyRow, 'id' | 'created_at'>>
      }
    }
  }
}
