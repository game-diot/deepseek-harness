/** Reconstruct the AG-UI message history one Thread produced, and verify client replays. */

import { EventType, type Event } from '@ag-ui/core'

/** Message fields this bridge owns and can compare exactly. */
export interface ProjectedMessage {
  readonly id: string
  readonly role: string
  /** Text of the message body; part arrays are reduced to their text parts. */
  readonly texts: readonly string[]
  readonly toolCallId?: string
  readonly toolCalls: readonly ProjectedToolCall[]
}

/** One Tool call as it appears inside an assistant message. */
export interface ProjectedToolCall {
  readonly id: string
  readonly name: string
  readonly arguments: string
}

interface MutableMessage {
  readonly id: string
  readonly role: string
  readonly texts: string[]
  toolCallId?: string
  readonly toolCalls: ProjectedToolCall[]
}

interface MutableToolCall {
  id: string
  name: string
  arguments: string
}

function projectToolCalls(value: unknown): ProjectedToolCall[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  const calls: ProjectedToolCall[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null
    const call = entry as { id?: unknown; function?: unknown }
    if (Object.keys(call).some(key => key !== 'id' && key !== 'type' && key !== 'function')) return null
    if (typeof call.id !== 'string') return null
    const rawFunction = call.function
    if (typeof rawFunction !== 'object' || rawFunction === null) return null
    const callFunction = rawFunction as { name?: unknown; arguments?: unknown }
    if (Object.keys(callFunction).some(key => key !== 'name' && key !== 'arguments')) return null
    const name = callFunction.name
    const args = callFunction.arguments
    if (typeof name !== 'string' || typeof args !== 'string') return null
    calls.push({ id: call.id, name, arguments: args })
  }
  return calls
}

function projectTexts(value: unknown): string[] | null {
  if (typeof value === 'string') return [value]
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  const texts: string[] = []
  for (const part of value) {
    if (typeof part !== 'object' || part === null) return null
    const candidate = part as { type?: unknown; text?: unknown }
    if (candidate.type !== 'text' || typeof candidate.text !== 'string') return null
    if (Object.keys(candidate).some(key => key !== 'type' && key !== 'text')) return null
    texts.push(candidate.text)
  }
  return texts
}

/**
 * Project one incoming AG-UI message onto the fields this bridge owns.
 * @param value - untrusted message from a Run request.
 * @returns the projection, or `null` when the message carries unsupported content.
 */
export function projectMessage(value: unknown): ProjectedMessage | null {
  if (typeof value !== 'object' || value === null) return null
  const message = value as {
    id?: unknown
    role?: unknown
    content?: unknown
    toolCallId?: unknown
    toolCalls?: unknown
  }
  if (typeof message.id !== 'string' || typeof message.role !== 'string') return null
  const owned = new Set(['id', 'role', 'content', 'toolCallId', 'toolCalls'])
  if (Object.keys(message).some(key => !owned.has(key))) return null
  const texts = projectTexts(message.content)
  if (texts === null) return null
  const toolCalls = projectToolCalls(message.toolCalls)
  if (toolCalls === null) return null
  if (message.toolCallId !== undefined && typeof message.toolCallId !== 'string') return null
  return {
    id: message.id,
    role: message.role,
    texts,
    ...message.toolCallId === undefined ? {} : { toolCallId: message.toolCallId },
    toolCalls,
  }
}

/**
 * Project a whole incoming message list.
 * @param value - untrusted `messages` array from a Run request.
 * @returns the projections, or `null` when any message is unsupported.
 */
export function projectMessages(value: readonly unknown[]): ProjectedMessage[] | null {
  const projected: ProjectedMessage[] = []
  for (const entry of value) {
    const message = projectMessage(entry)
    if (message === null) return null
    projected.push(message)
  }
  return projected
}

/**
 * UTF-8 size of the projection's canonical JSON text.
 * @param messages - projected messages to measure.
 * @returns the byte length of their canonical JSON text.
 */
export function historyBytes(messages: readonly ProjectedMessage[]): number {
  return Buffer.byteLength(JSON.stringify(messages), 'utf8')
}

/**
 * Whether a replayed history equals the recorded one on every owned field.
 * @param left - recorded messages.
 * @param right - replayed messages.
 * @returns whether both lists agree on every owned field.
 */
export function sameHistory(left: readonly ProjectedMessage[], right: readonly ProjectedMessage[]): boolean {
  if (left.length !== right.length) return false
  return left.every((message, index) => {
    const other = right[index]
    /* v8 ignore next -- equal lengths guarantee the counterpart exists. */
    if (other === undefined) return false
    if (message.id !== other.id || message.role !== other.role || message.toolCallId !== other.toolCallId) return false
    if (message.texts.length !== other.texts.length) return false
    if (!message.texts.every((text, position) => text === other.texts[position])) return false
    if (message.toolCalls.length !== other.toolCalls.length) return false
    return message.toolCalls.every((call, position) => {
      const counterpart = other.toolCalls[position]
      /* v8 ignore next -- equal tool-call counts guarantee the counterpart exists. */
      return counterpart !== undefined && call.id === counterpart.id && call.name === counterpart.name
        && call.arguments === counterpart.arguments
    })
  })
}

/** Append-only AG-UI history for one Thread, updated from the events the bridge publishes. */
export class AgUiRunHistory {
  private readonly messages: MutableMessage[] = []

  /**
   * Record one admitted user message before its Run starts.
   * @param message - the admitted user message; admission rejects Tool fields.
   */
  appendUser(message: ProjectedMessage): void {
    this.messages.push({
      id: message.id,
      role: message.role,
      texts: [...message.texts],
      toolCalls: [],
    })
  }

  /** Drop the last recorded message, used when a failed Run is retried. */
  dropLast(): void {
    this.messages.pop()
  }

  /**
   * Record one event this bridge wrote to the response stream.
   * @param event - an event whose payload the client has already received.
   */
  record(event: Event): void {
    switch (event.type) {
      case EventType.TEXT_MESSAGE_START: {
        if (this.find(event.messageId) === undefined) {
          this.messages.push({ id: event.messageId, role: event.role ?? 'assistant', texts: [''], toolCalls: [] })
        }
        return
      }
      case EventType.TEXT_MESSAGE_CONTENT: {
        const message = this.find(event.messageId)
        if (message === undefined) return
        message.texts[0] = `${message.texts[0] ?? ''}${event.delta}`
        return
      }
      case EventType.TOOL_CALL_START: {
        const owner = event.parentMessageId === undefined ? undefined : this.find(event.parentMessageId)
        const message = owner ?? this.createAssistant(event.parentMessageId ?? event.toolCallId)
        message.toolCalls.push({ id: event.toolCallId, name: event.toolCallName, arguments: '' })
        return
      }
      case EventType.TOOL_CALL_ARGS: {
        const call = this.findToolCall(event.toolCallId)
        if (call !== undefined) call.arguments += event.delta
        return
      }
      case EventType.TOOL_CALL_RESULT: {
        /* v8 ignore next -- the run emitter publishes Tool results as strings only. */
        const texts = typeof event.content === 'string' ? [event.content] : []
        this.messages.push({
          id: event.messageId, role: 'tool', texts, toolCallId: event.toolCallId, toolCalls: [],
        })
        return
      }
      default:
        // Only message-producing events belong to the history.
        return
    }
  }

  /**
   * Copy of the recorded history, safe to compare or size.
   * @returns a detached copy of every recorded message.
   */
  snapshot(): ProjectedMessage[] {
    return this.messages.map(message => ({
      id: message.id,
      role: message.role,
      texts: [...message.texts],
      ...message.toolCallId === undefined ? {} : { toolCallId: message.toolCallId },
      toolCalls: message.toolCalls.map(call => ({ ...call })),
    }))
  }

  private find(id: string): MutableMessage | undefined {
    return this.messages.find(message => message.id === id)
  }

  private findToolCall(toolCallId: string): MutableToolCall | undefined {
    for (const message of this.messages) {
      const call = message.toolCalls.find(candidate => candidate.id === toolCallId)
      if (call !== undefined) return call
    }
    return undefined
  }

  private createAssistant(id: string): MutableMessage {
    const message: MutableMessage = { id, role: 'assistant', texts: [], toolCalls: [] }
    this.messages.push(message)
    return message
  }
}
