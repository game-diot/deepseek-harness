import { createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { describe, expect, it } from 'vitest'
import { a2uiTurnDefinition } from '../src/client/turn-tail-projection.ts'

const callId = brandString<ToolCallId>('a2ui-1')
const metadata = { protocol: 'a2ui/v1', messages: [{ version: '1.0', createSurface: { surfaceId: 'card' } }] }
const event = (value: SessionEvent): SessionEvent => value
const start = event({ type: 'turn/start', seq: SessionSeq(1), time: 1, data: { turn: 1 } })
const call = (name = 'a2ui_render') => event({
  type: 'tool/call', seq: SessionSeq(2), time: 2,
  data: { turn: 1, step: 1, callId, name, arguments: '{}' },
})
const result = (over?: { isError?: boolean; meta?: JsonValue }) => event({
  type: 'tool/result', seq: SessionSeq(3), time: 3, surfaceOp: 'append', data: {
    turn: 1, step: 1,
    message: createToolResultMessage({ callId, content: [{ type: 'text', text: 'ok' }], isError: over?.isError ?? false }),
    meta: over?.meta ?? metadata,
  },
})

function context(state?: ReturnType<typeof a2uiTurnDefinition.start>) {
  return { key: 'k', kind: 'a2ui-turn-tail', id: '1', matches: [], start: undefined, state, current: new Map() }
}

const updateMatch = (value: SessionEvent) => ({ role: 'update' as const, event: value, location: { kind: 'unresolved' as const } })
const startMatch = (value: SessionEvent) => ({ role: 'start' as const, event: value, location: { kind: 'unresolved' as const } })

describe('A2UI Turn-tail projection', () => {
  it('matches only Turn starts and Tool lifecycle events', () => {
    expect(a2uiTurnDefinition.match(start)).toMatchObject({ id: '1', role: 'start' })
    expect(a2uiTurnDefinition.match(call())).toMatchObject({ id: '1', role: 'update' })
    expect(a2uiTurnDefinition.match(result())).toMatchObject({ id: '1', role: 'update' })
    expect(a2uiTurnDefinition.match(event({ type: 'turn/end', seq: SessionSeq(4), time: 4, data: { turn: 1, reason: { kind: 'completed' } } }))).toBeNull()
  })

  it('folds only successful admitted a2ui_render results', () => {
    expect(() => a2uiTurnDefinition.start(context(), startMatch(call()), { previous: () => undefined })).toThrow()
    let state = a2uiTurnDefinition.start(context(), startMatch(start), { previous: () => undefined })
    state = a2uiTurnDefinition.update({ ...context(state), state }, updateMatch(call('write')))
    expect(a2uiTurnDefinition.update({ ...context(state), state }, updateMatch(result()))).toBe(state)
    state = a2uiTurnDefinition.update({ ...context(state), state }, updateMatch(call()))
    expect(a2uiTurnDefinition.update({ ...context(state), state }, updateMatch(result({ isError: true })))).toBe(state)
    expect(a2uiTurnDefinition.update({ ...context(state), state }, updateMatch(result({ meta: {} })))).toBe(state)
    const accepted = a2uiTurnDefinition.update({ ...context(state), state }, updateMatch(result()))
    expect(accepted.envelopes).toEqual([metadata])
    expect(a2uiTurnDefinition.update({ ...context(accepted), state: accepted }, updateMatch(start))).toBe(accepted)
  })

  it('publishes immediately for results and reuses unchanged Turn data', () => {
    expect(a2uiTurnDefinition.publication?.(updateMatch(result()))).toBe('immediate')
    expect(a2uiTurnDefinition.publication?.(updateMatch(call()))).toBe('none')
    expect(a2uiTurnDefinition.buildLocationData?.(context(), 'turn', null)).toBeNull()
    let state = a2uiTurnDefinition.start(context(), startMatch(start), { previous: () => undefined })
    state = a2uiTurnDefinition.update({ ...context(state), state }, updateMatch(call()))
    state = a2uiTurnDefinition.update({ ...context(state), state }, updateMatch(result()))
    expect(a2uiTurnDefinition.buildLocationData?.(context(state), 'step', null)).toBeNull()
    const location = a2uiTurnDefinition.buildLocationData?.(context(state), 'turn', null)
    expect(location).toMatchObject({ kind: 'turn', turn: 1, key: 'a2ui-turn-tail', value: { envelopes: [metadata] } })
    expect(a2uiTurnDefinition.buildLocationData?.(context(state), 'turn', location ?? null)).toBe(location)
  })
})
