import { describe, expect, it } from 'vitest'
import { formatA2uiActionMessage } from '../src/client/action-message.ts'

const action = {
  name: 'confirmLearningTask',
  surfaceId: 'learningCard',
  sourceComponentId: 'confirmButton',
  timestamp: '2026-11-19T02:39:00.000Z',
  context: { accepted: true, count: 1 },
  userMessage: '我确认执行这项学习任务',
}

describe('A2UI action message', () => {
  it('serializes the standard action fields into a durable native user message', () => {
    expect(formatA2uiActionMessage(action)).toBe(
      '[A2UI action] {"type":"a2ui/action","version":1,"name":"confirmLearningTask","surfaceId":"learningCard","sourceComponentId":"confirmButton","timestamp":"2026-11-19T02:39:00.000Z","context":{"accepted":true,"count":1},"userMessage":"我确认执行这项学习任务"}\nCall a2ui_render with a complete successor Surface reflecting this action. Do not only acknowledge it in text.',
    )
  })

  it('omits an empty optional user message', () => {
    expect(formatA2uiActionMessage({ ...action, userMessage: '   ' })).not.toContain('userMessage')
  })

  it('rejects cyclic, non-JSON, blank, and oversized actions', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(formatA2uiActionMessage({ ...action, context: cyclic })).toBeNull()
    expect(formatA2uiActionMessage({ ...action, context: { bad: undefined } })).toBeNull()
    expect(formatA2uiActionMessage({ ...action, name: ' ' })).toBeNull()
    expect(formatA2uiActionMessage({ ...action, surfaceId: ' ' })).toBeNull()
    expect(formatA2uiActionMessage({ ...action, sourceComponentId: ' ' })).toBeNull()
    expect(formatA2uiActionMessage({ ...action, timestamp: ' ' })).toBeNull()
    expect(formatA2uiActionMessage({ ...action, context: { text: 'x'.repeat(8192) } })).toBeNull()
  })
})
