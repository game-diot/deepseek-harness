import { EventType, PROTOCOL_VERSION, type Event } from '@ag-ui/core'
import { describe, expect, it } from 'vitest'
import {
  AgUiRunHistory, historyBytes, projectMessage, projectMessages, sameHistory,
} from '../src/run-history.ts'

const identity = { threadId: 'thread-history', runId: 'run-history' }

function textStart(messageId: string): Event {
  return { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' }
}

function textDelta(messageId: string, delta: string): Event {
  return { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta }
}

function toolStart(toolCallId: string, toolCallName: string, parentMessageId?: string): Event {
  return {
    type: EventType.TOOL_CALL_START, toolCallId, toolCallName,
    ...parentMessageId === undefined ? {} : { parentMessageId },
  }
}

function toolArgs(toolCallId: string, delta: string): Event {
  return { type: EventType.TOOL_CALL_ARGS, toolCallId, delta }
}

function toolResult(toolCallId: string, content: string): Event {
  return {
    type: EventType.TOOL_CALL_RESULT, messageId: `tool-result:${toolCallId}`, toolCallId, content,
  }
}

describe('AG-UI history projection', () => {
  it('reduces string and text-part content to the same projection', () => {
    expect(projectMessage({ id: 'u', role: 'user', content: 'hi' })).toEqual({
      id: 'u', role: 'user', texts: ['hi'], toolCalls: [],
    })
    expect(projectMessage({ id: 'u', role: 'user', content: [{ type: 'text', text: 'hi' }] })).toMatchObject({
      texts: ['hi'],
    })
  })

  it('rejects unsupported content, unknown keys, and malformed tool calls', () => {
    expect(projectMessage({ id: 'u', role: 'user', content: [{ type: 'image', url: 'x' }] })).toBeNull()
    expect(projectMessage({ id: 'u', role: 'user', content: 'hi', metadata: {} })).toBeNull()
    expect(projectMessage({ id: 'u', role: 'user', content: [{ type: 'text', text: 'hi', metadata: {} }] })).toBeNull()
    expect(projectMessage({ id: 'u', role: 'user', content: 1 })).toBeNull()
    expect(projectMessage({ id: 'u', role: 'user', content: 'hi', toolCalls: [{ id: 'c' }] })).toBeNull()
    expect(projectMessage({ id: 'u', role: 'user', content: 'hi', toolCalls: [{ id: 'c', extra: 1, function: { name: 'n', arguments: '{}' } }] })).toBeNull()
    expect(projectMessage({ id: 'u', role: 'user', content: 'hi', toolCallId: 1 })).toBeNull()
    expect(projectMessage(null)).toBeNull()
    expect(projectMessage('user')).toBeNull()
    expect(projectMessages([{ id: 'u', role: 'user', content: 'hi' }, 1])).toBeNull()
    expect(projectMessage({ id: 'u', role: 'user', content: 'hi', toolCalls: 'none' })).toBeNull()
    expect(projectMessage({ id: 'u', role: 'user', content: 'hi', toolCalls: [null] })).toBeNull()
    expect(projectMessage({ id: 'u', role: 'user', content: 'hi', toolCalls: [{ id: 1, function: { name: 'n', arguments: '{}' } }] })).toBeNull()
    expect(projectMessage({ id: 'u', role: 'user', content: 'hi', toolCalls: [{ id: 'c', function: null }] })).toBeNull()
    expect(projectMessage({ id: 'u', role: 'user', content: 'hi', toolCalls: [{ id: 'c', function: { name: 1, arguments: '{}' } }] })).toBeNull()
    expect(projectMessage({ id: 'u', role: 'user', content: 'hi', toolCalls: [{ id: 'c', function: { name: 'n', arguments: '{}', extra: 1 } }] })).toBeNull()
    expect(projectMessage({ id: 'u', role: 'user', content: [null] })).toBeNull()
    expect(projectMessage({ id: 'u', role: 'user', content: [{ type: 'text' }] })).toBeNull()
    expect(projectMessage({ id: 'u', role: 'user' })).toMatchObject({ texts: [] })
    expect(projectMessage({ id: 'u' })).toBeNull()
  })

  it('records an admitted user message without Tool fields', () => {
    const history = new AgUiRunHistory()
    history.appendUser({ id: 'u', role: 'user', texts: ['x'], toolCalls: [] })
    expect(history.snapshot()).toEqual([{ id: 'u', role: 'user', texts: ['x'], toolCalls: [] }])
  })

  it('drops the last recorded message when a Run is retried', () => {
    const history = new AgUiRunHistory()
    history.appendUser({ id: 'u1', role: 'user', texts: ['one'], toolCalls: [] })
    history.appendUser({ id: 'u2', role: 'user', texts: ['two'], toolCalls: [] })
    history.dropLast()
    expect(history.snapshot()).toEqual([{ id: 'u1', role: 'user', texts: ['one'], toolCalls: [] }])
    history.dropLast()
    history.dropLast()
    expect(history.snapshot()).toEqual([])
  })

  it('keeps one assistant message per id and appends text to a Tool-only owner', () => {
    const history = new AgUiRunHistory()
    history.record(textStart('m1'))
    history.record(textStart('m1'))
    history.record(toolStart('c1', 'lookup', 'm1'))
    history.record(toolStart('c2', 'lookup', 'm1'))
    history.record(textDelta('m1', 'late'))
    expect(history.snapshot()).toEqual([
      { id: 'm1', role: 'assistant', texts: ['late'], toolCalls: [{ id: 'c1', name: 'lookup', arguments: '' }, { id: 'c2', name: 'lookup', arguments: '' }] },
    ])
  })

  it('appends text to an assistant message opened by a Tool call', () => {
    const history = new AgUiRunHistory()
    history.record(toolStart('c9', 'lookup', 'm9'))
    history.record(textStart('m9'))
    history.record(textDelta('m9', 'after'))
    expect(history.snapshot()).toEqual([
      { id: 'm9', role: 'assistant', texts: ['after'], toolCalls: [{ id: 'c9', name: 'lookup', arguments: '' }] },
    ])
  })

  it('defaults the assistant role when the start event omits it', () => {
    const history = new AgUiRunHistory()
    history.record({ type: EventType.TEXT_MESSAGE_START, messageId: 'm8' })
    expect(history.snapshot()).toEqual([{ id: 'm8', role: 'assistant', texts: [''], toolCalls: [] }])
  })

  it('records assistant text, a Tool round trip, and later text in event order', () => {
    const history = new AgUiRunHistory()
    history.appendUser({ id: 'u1', role: 'user', texts: ['do it'], toolCalls: [] })
    for (const event of [
      textStart('m1'), textDelta('m1', 'thinking'),
      toolStart('c1', 'lookup', 'm1'), toolArgs('c1', '{"q":'), toolArgs('c1', '1}'),
      toolResult('c1', 'found'),
      textStart('m2'), textDelta('m2', 'done'),
    ]) history.record(event)

    expect(history.snapshot()).toEqual([
      { id: 'u1', role: 'user', texts: ['do it'], toolCalls: [] },
      { id: 'm1', role: 'assistant', texts: ['thinking'], toolCalls: [{ id: 'c1', name: 'lookup', arguments: '{"q":1}' }] },
      { id: 'tool-result:c1', role: 'tool', texts: ['found'], toolCallId: 'c1', toolCalls: [] },
      { id: 'm2', role: 'assistant', texts: ['done'], toolCalls: [] },
    ])
  })

  it('opens a Tool-only assistant message under the parent id, else the call id', () => {
    const parented = new AgUiRunHistory()
    parented.record(toolStart('c1', 'lookup', 'm1'))
    expect(parented.snapshot()).toEqual([
      { id: 'm1', role: 'assistant', texts: [], toolCalls: [{ id: 'c1', name: 'lookup', arguments: '' }] },
    ])

    const orphan = new AgUiRunHistory()
    orphan.record(toolStart('c2', 'lookup'))
    expect(orphan.snapshot()).toEqual([
      { id: 'c2', role: 'assistant', texts: [], toolCalls: [{ id: 'c2', name: 'lookup', arguments: '' }] },
    ])
  })

  it('ignores events it does not own and text for unknown messages', () => {
    const history = new AgUiRunHistory()
    history.record({ type: EventType.RUN_STARTED, ...identity, protocolVersion: PROTOCOL_VERSION })
    history.record(textDelta('missing', 'ignored'))
    history.record(toolArgs('missing', 'ignored'))
    history.record({ type: EventType.RUN_FINISHED, ...identity, outcome: { type: 'success' } })
    expect(history.snapshot()).toEqual([])
  })

  it('compares only owned fields and reports size', () => {
    const left = projectMessages([{ id: 'u', role: 'user', content: 'hi' }]) ?? []
    const same = projectMessages([{ id: 'u', role: 'user', content: [{ type: 'text', text: 'hi' }] }]) ?? []
    expect(sameHistory(left, same)).toBe(true)
    expect(historyBytes(left)).toBe(Buffer.byteLength(JSON.stringify(left), 'utf8'))

    const cases = [
      [{ id: 'u2', role: 'user', content: 'hi' }],
      [{ id: 'u', role: 'assistant', content: 'hi' }],
      [{ id: 'u', role: 'user', content: 'bye' }],
      [{ id: 'u', role: 'user', content: 'hi' }, { id: 'x', role: 'assistant', content: '' }],
    ]
    for (const candidate of cases) {
      expect(sameHistory(left, projectMessages(candidate) ?? [])).toBe(false)
    }
    expect(sameHistory(left, [])).toBe(false)

    expect(sameHistory(left, projectMessages([{ id: 'u', role: 'user', content: [{ type: 'text', text: 'hi' }, { type: 'text', text: 'x' }] }]) ?? [])).toBe(false)
    const withCall = projectMessages([{
      id: 'm', role: 'assistant', content: 'x',
      toolCalls: [{ id: 'c', type: 'function', function: { name: 'n', arguments: '{}' } }],
    }]) ?? []
    expect(sameHistory(withCall, projectMessages([{ id: 'm', role: 'assistant', content: 'x' }]) ?? [])).toBe(false)
    expect(sameHistory(
      withCall,
      projectMessages([{
        id: 'm', role: 'assistant', content: 'x',
        toolCalls: [{ id: 'c', type: 'function', function: { name: 'n', arguments: '{}' } }],
      }]) ?? [],
    )).toBe(true)
    expect(sameHistory(
      withCall,
      projectMessages([{
        id: 'm', role: 'assistant', content: 'x',
        toolCalls: [{ id: 'other', type: 'function', function: { name: 'n', arguments: '{}' } }],
      }]) ?? [],
    )).toBe(false)
  })

  it('compares Tool call arguments and ignores extra messages', () => {
    const recorded = new AgUiRunHistory()
    recorded.appendUser({ id: 'u', role: 'user', texts: ['go'], toolCalls: [] })
    recorded.record(toolStart('c1', 'lookup', 'm1'))
    recorded.record(toolArgs('c1', '{"q":1}'))
    recorded.record(toolResult('c1', 'ok'))

    const replayed = projectMessages([
      { id: 'u', role: 'user', content: 'go' },
      {
        id: 'm1', role: 'assistant',
        toolCalls: [{ id: 'c1', type: 'function', function: { name: 'lookup', arguments: '{"q":1}' } }],
      },
      { id: 'tool-result:c1', role: 'tool', toolCallId: 'c1', content: 'ok' },
    ]) ?? []
    expect(sameHistory(recorded.snapshot(), replayed)).toBe(true)

    const tampered = projectMessages([
      { id: 'u', role: 'user', content: 'go' },
      {
        id: 'm1', role: 'assistant',
        toolCalls: [{ id: 'c1', type: 'function', function: { name: 'lookup', arguments: '{"q":2}' } }],
      },
      { id: 'tool-result:c1', role: 'tool', toolCallId: 'c1', content: 'ok' },
    ]) ?? []
    expect(sameHistory(recorded.snapshot(), tampered)).toBe(false)
  })
})
