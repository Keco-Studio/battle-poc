export const VS01_RUBRIC = [
  { id: 'build_gate', dimension: 'build_gate', weight: 0, criteria: 'Production build succeeds and the runtime loads without fatal errors.' },
  { id: 'mechanics', dimension: 'mechanics', weight: 0.15, criteria: 'Combat decisions, control-shatter interaction, damage-over-time, debuff, healing, and boss loop work.' },
  { id: 'content_depth', dimension: 'content_depth', weight: 0.35, criteria: 'One coherent job, eight distinct skills, three standard archetypes, one boss, two maps, and a complete progression arc.' },
  { id: 'functional_visuals', dimension: 'functional_visuals', weight: 0.15, criteria: 'Characters, maps, skill effects, targets, objectives, and locked/unlocked states are legible.' },
  { id: 'art_presentation', dimension: 'art_presentation', weight: 0.35, criteria: 'A cohesive basalt, teal relay, ember red, and ice blue art direction supports combat readability.' },
] as const

