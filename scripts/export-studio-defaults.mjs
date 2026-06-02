/**
 * Regenerate data/studio-defaults/battle_skills.csv (simulation-aligned headers).
 * Run: node scripts/export-studio-defaults.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const defaultsPath = path.join(root, 'data', 'skill-keco-defaults.json')
const srcCsv = path.join(root, 'data', 'studio-defaults', 'battle_skills.csv')
const outCsv = srcCsv

/** Same as keco-simulation BATTLE_SKILLS_SHEET_HEADERS + POC-only category, range (snake_case). */
const HEADERS = [
  'id',
  'name',
  'type',
  'power',
  'mp_cost',
  'max_cooldown',
  'description',
  'category',
  'range',
  'attach_element',
  'attach_strength',
  'attach_turns',
  'dot_damage',
  'dot_turns',
  'freeze_turns',
  'special_effect',
  'special_effect_value',
  'special_effect_duration',
  'reaction_triggers',
]

function escapeCsvCell(v) {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function parseCsvLine(line) {
  const cells = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') inQ = false
      else cur += c
    } else if (c === '"') inQ = true
    else if (c === ',') {
      cells.push(cur)
      cur = ''
    } else cur += c
  }
  cells.push(cur)
  return cells
}

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').trim()
  const lines = text.split(/\r?\n/)
  const headers = parseCsvLine(lines[0])
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line)
    const row = {}
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? ''
    })
    return row
  })
  return { headers, rows }
}

function pick(row, ...keys) {
  for (const k of keys) {
    const v = row[k]?.trim()
    if (v) return v
  }
  return ''
}

function mergeFreeze(row, keco) {
  return (
    keco.freeze_turns ||
    pick(row, 'freeze_turns', 'freeze_duration') ||
    pick(row, 'apply_freeze_ticks') ||
    ''
  )
}

function main() {
  const kecoDefaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8'))
  delete kecoDefaults._comment

  const { rows } = readCsv(srcCsv)
  const outLines = [HEADERS.join(',')]

  for (const row of rows) {
    const id = row.id?.trim()
    const keco = kecoDefaults[id] ?? {}
    const type =
      keco.type ||
      pick(row, 'type', 'keco_type') ||
      (pick(row, 'special_effect', 'special_type') === 'heal' ? 'heal' : 'attack')

    const out = {
      id,
      name: row.name,
      type,
      power: pick(row, 'power', 'ratio'),
      mp_cost: pick(row, 'mp_cost', 'mpCost'),
      max_cooldown: pick(row, 'max_cooldown', 'cooldown_ticks', 'maxCooldown'),
      description: row.description,
      category: row.category || 'burst',
      range: '3',
      attach_element: keco.attach_element ?? pick(row, 'attach_element'),
      attach_strength:
        keco.attach_strength ??
        (pick(row, 'attach_strength') ||
          ((keco.attach_element || pick(row, 'attach_element')) ? 'weak' : '')),
      attach_turns: keco.attach_turns ?? pick(row, 'attach_turns', 'attach_duration'),
      dot_damage: keco.dot_damage ?? pick(row, 'dot_damage'),
      dot_turns: keco.dot_turns ?? pick(row, 'dot_turns', 'dot_duration'),
      freeze_turns: mergeFreeze(row, keco),
      special_effect: keco.special_effect ?? pick(row, 'special_effect', 'special_type'),
      special_effect_value: keco.special_effect_value ?? pick(row, 'special_effect_value', 'special_value'),
      special_effect_duration:
        keco.special_effect_duration ?? pick(row, 'special_effect_duration', 'special_duration'),
      reaction_triggers: keco.reaction_triggers ?? pick(row, 'reaction_triggers'),
    }
    outLines.push(HEADERS.map((h) => escapeCsvCell(out[h])).join(','))
  }

  fs.writeFileSync(outCsv, outLines.join('\n') + '\n', 'utf8')

  const formulaCsv = path.join(root, 'data', 'studio-defaults', 'damage_formula.csv')
  fs.writeFileSync(
    formulaCsv,
    'id,mode,basic_power,skill_power_scale,defend_damage_reduction,defend_skill_reduction,element_reactions_enabled\nbattle_damage,keco_element,1,1,0.6,0.62,1\n',
    'utf8',
  )

  console.log(`Wrote ${outCsv} (${rows.length} skills, ${HEADERS.length} columns, simulation-aligned)`)
}

main()
