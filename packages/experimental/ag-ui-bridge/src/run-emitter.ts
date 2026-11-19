/** Translate one DSH Agent run into AG-UI events. */

import { EventType, PROTOCOL_VERSION, type Event } from '@ag-ui/core'
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent'

/** One run's AG-UI identity. */
export interface AgUiRunIdentity {
  readonly threadId: string
  readonly runId: string
}

/** Stateful, run-local translation of DSH live frames. */
export class AgUiRunEmitter {
  private messageId: string | undefined
  private messageOpened = false
  private terminal = false
  private readonly tools = new Map<string, { opened: boolean; visible: boolean; name?: string; buffered: string }>()

  constructor(
    readonly identity: AgUiRunIdentity,
    private readonly emit: (event: Event) => void,
  ) {}

  /** Publish the durable Turn identity after the initiating message is claimed. */
  start(): void {
    if (this.terminal) return
    this.emit({ type: EventType.RUN_STARTED, ...this.identity, protocolVersion: PROTOCOL_VERSION })
  }

  /**
   * Translate one live assistant frame.
   * @param frame - the assistant stream frame to translate.
   */
  frame(frame: AssistantStreamFrame): void {
    if (this.terminal) return
    if (frame.type === 'start') {
      this.messageId = String(frame.attemptId)
      return
    }
    if (frame.type === 'end') {
      this.closeMessage()
      for (const [toolCallId, tool] of this.tools) {
        if (!tool.opened) continue
        this.emit({ type: EventType.TOOL_CALL_END, toolCallId })
        tool.opened = false
      }
      return
    }
    const chunk = frame.chunk
    if (chunk.type === 'text-delta') {
      const messageId = this.messageId ?? String(frame.attemptId)
      if (this.messageId === undefined) this.messageId = messageId
      if (!this.messageOpened) {
        this.messageOpened = true
        this.emit({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' })
      }
      this.emit({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: chunk.text })
      return
    }
    if (chunk.type !== 'tool-call-delta') return
    const toolCallId = String(chunk.id)
    const state = this.tools.get(toolCallId) ?? { opened: false, visible: false, buffered: '' }
    if (chunk.name !== undefined) state.name = chunk.name
    state.buffered += chunk.argumentsDelta
    if (!state.opened && state.name !== undefined) {
      state.opened = true
      state.visible = true
      this.emit({
        type: EventType.TOOL_CALL_START, toolCallId, toolCallName: state.name,
        ...(this.messageId === undefined ? {} : { parentMessageId: this.messageId }),
      })
      if (state.buffered !== '') {
        this.emit({ type: EventType.TOOL_CALL_ARGS, toolCallId, delta: state.buffered })
        state.buffered = ''
      }
    } else if (state.opened && chunk.argumentsDelta !== '') {
      this.emit({ type: EventType.TOOL_CALL_ARGS, toolCallId, delta: chunk.argumentsDelta })
      state.buffered = ''
    }
    this.tools.set(toolCallId, state)
  }

  /**
   * Close any open text and finish the Run.
   * @param outcome - the terminal outcome the client should observe.
   */
  finish(outcome: 'success' | 'cancelled' = 'success'): void {
    if (this.terminal) return
    this.closeResources()
    this.terminal = true
    this.emit({ type: EventType.RUN_FINISHED, ...this.identity, outcome: { type: outcome } })
  }

  /** Close open resources and publish a terminal failure. */
  fail(): void {
    if (this.terminal) return
    this.closeResources()
    this.terminal = true
    this.emit({ type: EventType.RUN_ERROR, message: 'Agent run failed', code: 'DSH_AGENT_RUN_FAILED' })
  }

  private closeMessage(): void {
    if (this.messageId === undefined) return
    if (this.messageOpened) this.emit({ type: EventType.TEXT_MESSAGE_END, messageId: this.messageId })
    this.messageId = undefined
    this.messageOpened = false
  }

  /**
   * Publish a durable Tool result for a call already exposed on this Run.
   * @param toolCallId - the Tool call this result answers.
   * @param content - model-facing result text.
   */
  toolResult(toolCallId: string, content: string): void {
    const tool = this.tools.get(toolCallId)
    if (this.terminal || tool === undefined || !tool.visible) return
    this.emit({ type: EventType.TOOL_CALL_RESULT, messageId: `tool-result:${toolCallId}`, toolCallId, content })
    this.tools.delete(toolCallId)
  }

  private closeResources(): void {
    this.closeMessage()
    for (const [toolCallId, tool] of this.tools) if (tool.opened) this.emit({ type: EventType.TOOL_CALL_END, toolCallId })
    this.tools.clear()
  }
}
