/**
 * Read-only queries for static game content:
 * skills, job classes, and enemy templates.
 *
 * These tables are public (no auth required) and rarely change,
 * so results are safe to cache at the module level after first load.
 */
import { supabase } from '../supabase/client'
import type { SkillRow, JobClassRow, JobClassSkillRow, EnemyTemplateRow, MapEnemyRow } from './types'

// ─────────────────────────────────────────────
// Skills
// ─────────────────────────────────────────────

export async function fetchAllSkills(): Promise<SkillRow[]> {
  const { data, error } = await supabase.from('skills').select('*').order('id')
  if (error) throw error
  return data ?? []
}

export async function fetchSkillById(id: string): Promise<SkillRow | null> {
  const { data, error } = await supabase
    .from('skills')
    .select('*')
    .eq('id', id)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data
}

// ─────────────────────────────────────────────
// Job classes
// ─────────────────────────────────────────────

export async function fetchAllJobClasses(): Promise<JobClassRow[]> {
  const { data, error } = await supabase.from('job_classes').select('*').order('id')
  if (error) throw error
  return data ?? []
}

export async function fetchJobClassById(id: string): Promise<JobClassRow | null> {
  const { data, error } = await supabase
    .from('job_classes')
    .select('*')
    .eq('id', id)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data
}

/**
 * Returns all skill rows for a given job class.
 * Joins job_class_skills → skills in a single query.
 */
export async function fetchJobClassSkills(
  jobClassId: string
): Promise<Array<JobClassSkillRow & { skill: SkillRow }>> {
  const { data, error } = await supabase
    .from('job_class_skills')
    .select('*, skill:skills(*)')
    .eq('job_class_id', jobClassId)

  if (error) throw error
  return (data ?? []) as Array<JobClassSkillRow & { skill: SkillRow }>
}

/**
 * Returns the default carried skill ids for a job class (is_default = true, up to 6).
 */
export async function fetchDefaultCarriedSkillIds(jobClassId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('job_class_skills')
    .select('skill_id')
    .eq('job_class_id', jobClassId)
    .eq('is_default', true)
    .limit(6)

  if (error) throw error
  return (data ?? []).map((row) => row.skill_id)
}

// ─────────────────────────────────────────────
// Enemy data
// ─────────────────────────────────────────────

export async function fetchEnemyTemplate(id: string): Promise<EnemyTemplateRow | null> {
  const { data, error } = await supabase
    .from('enemy_templates')
    .select('*')
    .eq('id', id)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data
}

export async function fetchMapEnemies(mapId: string): Promise<MapEnemyRow[]> {
  const { data, error } = await supabase
    .from('map_enemies')
    .select('*')
    .eq('map_id', mapId)

  if (error) throw error
  return data ?? []
}
