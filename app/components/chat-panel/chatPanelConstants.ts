export const QUICK_PROMPTS = ['What are you building?', 'Tell me your skills', 'How do you use your claw?']

export const OFFLINE_BOLT_REPLY =
  'Agent backend offline. Check /api/agent-chat backend mode and endpoint configuration.'

export const AGENT_CHAT_API = '/api/agent-chat'

export const AUTO_COMMANDS = [
  { label: 'Battle 5 times', cmd: 'battle 5 times' },
  { label: 'Battle 10 times', cmd: 'battle 10 times' },
  { label: 'Flee if losing', cmd: 'flee if losing' },
  { label: 'Farm gold & exp', cmd: 'farm gold and exp' },
  { label: 'Auto mode', cmd: 'auto mode' },
  { label: 'Stop', cmd: 'stop' },
] as const

export const SYSTEM_CHAT_THREADS_STORAGE_KEY = 'battle-system-chat-threads-v1'
export const ENEMY_CHAT_THREADS_STORAGE_KEY = 'battle-enemy-chat-threads-v1'
