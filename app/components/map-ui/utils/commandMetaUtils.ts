export function setCommandMeta<T>(store: Record<string, T>, commandId: string, value: T): void {
  if (!commandId) return
  store[commandId] = value
}

export function getCommandMeta<T>(store: Record<string, T>, commandId: string): T | undefined {
  if (!commandId) return undefined
  return store[commandId]
}

export function deleteCommandMeta<T>(store: Record<string, T>, commandId: string): void {
  if (!commandId) return
  delete store[commandId]
}
