export type DataFlowTraceStatus = 'start' | 'success' | 'error'

export interface DataFlowTraceItem {
  id: string
  time: number
  action: string
  status: DataFlowTraceStatus
  detail?: string
}

const STORAGE_KEY = 'battle-data-flow-trace-v1'
const EVENT_NAME = 'battle-data-flow-trace-updated'
const MAX_ITEMS = 30

function readRaw(): DataFlowTraceItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getDataFlowTrace(): DataFlowTraceItem[] {
  return readRaw().sort((a, b) => b.time - a.time)
}

export function pushDataFlowTrace(
  action: string,
  status: DataFlowTraceStatus,
  detail?: string,
): void {
  if (typeof window === 'undefined') return
  const next: DataFlowTraceItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: Date.now(),
    action,
    status,
    detail: detail ? String(detail) : undefined,
  }
  const merged = [next, ...readRaw()].slice(0, MAX_ITEMS)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
    window.dispatchEvent(new CustomEvent(EVENT_NAME))
  } catch {
    // Ignore trace persistence failures.
  }
}

export const DATA_FLOW_TRACE_EVENT = EVENT_NAME
