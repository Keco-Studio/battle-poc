export function resolveGeneratedContent<T>(generated: T | null, fallback: () => T): T {
  return generated ?? fallback()
}
