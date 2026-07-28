import type { JobClassConfig } from '@/src/lib/jobs/jobConfigTypes'

export const VS01_JOBS = [
  {
    id: 'relay_warden',
    name: 'Relay Warden',
    description: 'A mid-range signal duelist who alternates ember pressure, frost control, shatter bursts, and emergency repairs.',
    preferredRange: 'mid',
    stats: {
      hp: 135,
      atk: 19,
      def: 7,
      spd: 6,
      growthHp: 32,
      growthAtk: 5.5,
      growthDef: 2.8,
      growthSpd: 2.4,
      hpMult: 5,
    },
  },
] as const satisfies readonly JobClassConfig[]

