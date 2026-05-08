import { describe, expect, it } from 'vitest'
import { extractDeltaFromSseLine, stripThinkingTags } from '../app/components/chat-panel/parseOpenAiSse'

describe('parseOpenAiSse', () => {
  it('extracts delta content from OpenAI-style SSE line', () => {
    const line =
      'data: {"choices":[{"index":0,"delta":{"content":"Hello"}}]}'
    expect(extractDeltaFromSseLine(line)).toBe('Hello')
  })

  it('returns empty string for [DONE]', () => {
    expect(extractDeltaFromSseLine('data: [DONE]')).toBe('')
  })

  it('strips minimax thinking wrappers', () => {
    const raw = '<think>secret</think>visible'
    expect(stripThinkingTags(raw)).toContain('visible')
    expect(stripThinkingTags(raw)).not.toContain('secret')
  })
})
