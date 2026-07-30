export function nextRandom(seed: number): { seed: number; value: number } {
  const next = (seed * 1664525 + 1013904223) >>> 0
  return { seed: next, value: next / 0x100000000 }
}
