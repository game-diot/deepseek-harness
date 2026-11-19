import { EventType } from '@ag-ui/core'
import { EventSchema } from '@ag-ui/core/schemas'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import type { LlmAttemptId, StreamChunk, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { AgUiRunEmitter } from '../src/run-emitter.ts'

const attemptId = brandString<LlmAttemptId>('attempt-1')
const toolCallId = brandString<ToolCallId>('call-1')
const chunk = (index: number, value: StreamChunk): AssistantStreamFrame => ({
  type: 'chunk', attemptId, revision: 1, index, time: index + 1, chunk: value,
})

describe('DSH to AG-UI run translation', () => {
  it('emits a balanced text lifecycle and successful Run', () => {
    const events: unknown[] = []
    const emitter = new AgUiRunEmitter({ threadId: 'thread-1', runId: 'run-1' }, (event) => { events.push(EventSchema.parse(event)) })
    emitter.start()
    emitter.frame({ type: 'start', attemptId, revision: 1, turn: 1, step: 1 })
    emitter.frame(chunk(0, { type: 'text-delta', index: 0, text: '你' }))
    emitter.frame(chunk(1, { type: 'text-delta', index: 0, text: '好' }))
    emitter.frame({ type: 'end', attemptId, revision: 1, index: 2, outcome: { kind: 'committed', eventType: 'assistant/message', seq: SessionSeq(4) } })
    emitter.finish()
    expect(events.map(event => (event as { type: string }).type)).toEqual([
      EventType.RUN_STARTED, EventType.TEXT_MESSAGE_START, EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT, EventType.TEXT_MESSAGE_END, EventType.RUN_FINISHED,
    ])
  })

  it('buffers Tool arguments until the name and closes the call', () => {
    const events: { type: string; delta?: string }[] = []
    const emitter = new AgUiRunEmitter({ threadId: 'thread-1', runId: 'run-2' }, (event) => {
      EventSchema.parse(event)
      events.push({ type: event.type, ...'delta' in event && typeof event.delta === 'string' ? { delta: event.delta } : {} })
    })
    emitter.start()
    emitter.frame({ type: 'start', attemptId, revision: 1, turn: 1, step: 1 })
    emitter.frame(chunk(0, { type: 'tool-call-delta', index: 0, id: toolCallId, argumentsDelta: '{' }))
    emitter.frame(chunk(1, { type: 'tool-call-delta', index: 0, id: toolCallId, name: 'search', argumentsDelta: '}' }))
    emitter.frame({ type: 'end', attemptId, revision: 1, index: 2, outcome: { kind: 'committed', eventType: 'assistant/message', seq: SessionSeq(4) } })
    emitter.toolResult(String(toolCallId), 'done')
    emitter.finish('cancelled')
    expect(events.map(event => event.type)).toEqual([
      EventType.RUN_STARTED, EventType.TOOL_CALL_START, EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END, EventType.TOOL_CALL_RESULT, EventType.RUN_FINISHED,
    ])
    expect(events.find(event => event.type === 'TOOL_CALL_ARGS')?.delta).toBe('{}')
  })

  it('closes an open text message before a Run failure', () => {
    const events: { type: string }[] = []
    const emitter = new AgUiRunEmitter({ threadId: 'thread-1', runId: 'run-3' }, (event) => { events.push(EventSchema.parse(event)) })
    emitter.frame(chunk(0, { type: 'text-delta', index: 0, text: 'partial' }))
    emitter.fail()
    expect(events.map(event => event.type)).toEqual([
      EventType.TEXT_MESSAGE_START, EventType.TEXT_MESSAGE_CONTENT, EventType.TEXT_MESSAGE_END, EventType.RUN_ERROR,
    ])
  })

  it('ignores unsupported and terminal input while balancing partial Tools', () => {
    const events: { type: string; message?: string }[] = []
    const emitter = new AgUiRunEmitter({ threadId: 'thread-edge', runId: 'run-edge' }, (event) => {
      events.push({ type: event.type, ...'message' in event ? { message: event.message } : {} })
    })
    emitter.frame({ type: 'start', attemptId, revision: 1, turn: 1, step: 1 })
    emitter.frame(chunk(0, { type: 'reasoning-delta', index: 0, text: 'private' }))
    emitter.frame(chunk(1, { type: 'tool-call-delta', index: 0, id: toolCallId, name: 'search', argumentsDelta: '' }))
    emitter.frame(chunk(2, { type: 'tool-call-delta', index: 0, id: toolCallId, argumentsDelta: '{"q":1}' }))
    emitter.toolResult('unknown', 'ignored')
    emitter.fail()
    emitter.start()
    emitter.frame(chunk(3, { type: 'text-delta', index: 0, text: 'ignored' }))
    emitter.finish()
    emitter.toolResult(String(toolCallId), 'ignored')
    expect(events.map(event => event.type)).toEqual([
      EventType.TOOL_CALL_START, EventType.TOOL_CALL_ARGS, EventType.TOOL_CALL_END, EventType.RUN_ERROR,
    ])
    expect(events.at(-1)?.message).toBe('Agent run failed')
  })

  it('finishes an unnamed buffered Tool without publishing an invalid call', () => {
    const events: { type: string }[] = []
    const emitter = new AgUiRunEmitter({ threadId: 'thread-buffered', runId: 'run-buffered' }, event => events.push(event))
    emitter.frame(chunk(0, { type: 'tool-call-delta', index: 0, id: toolCallId, argumentsDelta: '{' }))
    emitter.frame({ type: 'end', attemptId, revision: 1, index: 1, outcome: { kind: 'abandoned' } })
    emitter.finish()
    expect(events.map(event => event.type)).toEqual([EventType.RUN_FINISHED])
  })

  it('starts a Tool without a parent message when no assistant attempt started', () => {
    const events: { type: string; parentMessageId?: string }[] = []
    const emitter = new AgUiRunEmitter({ threadId: 'thread-orphan', runId: 'run-orphan' }, event => events.push(event))
    emitter.frame(chunk(0, { type: 'tool-call-delta', index: 0, id: toolCallId, name: 'lookup', argumentsDelta: '{}' }))
    emitter.finish()
    expect(events.find(event => event.type === 'TOOL_CALL_START')).not.toHaveProperty('parentMessageId')
  })

  it('attaches a Tool to the current assistant message and ignores repeated failure', () => {
    const events: { type: string; parentMessageId?: string }[] = []
    const emitter = new AgUiRunEmitter({ threadId: 'thread-parent', runId: 'run-parent' }, event => events.push(event))
    emitter.frame({ type: 'start', attemptId, revision: 1, turn: 1, step: 1 })
    emitter.frame(chunk(0, { type: 'tool-call-delta', index: 0, id: toolCallId, name: 'search', argumentsDelta: '{}' }))
    emitter.fail()
    emitter.fail()
    expect(events.find(event => event.type === 'TOOL_CALL_START')?.parentMessageId).toBe(String(attemptId))
    expect(events.filter(event => event.type === 'RUN_ERROR')).toHaveLength(1)
  })
})
