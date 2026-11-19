/** Stable native-message encoding for admitted A2UI actions. */

import { isJsonValue, snapshotJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'

const ACTION_PREFIX = '[A2UI action] '
const SUCCESSOR_INSTRUCTION = '\nCall a2ui_render with a complete successor Surface reflecting this action. Do not only acknowledge it in text.'
const MAX_ACTION_BYTES = 8 * 1024

function isActionJson(value: unknown): value is JsonValue {
  return isJsonValue(value)
}

/** A2UI SDK fields accepted for native Session messages. */
export interface A2uiActionInput {
  readonly name: string
  readonly surfaceId: string
  readonly sourceComponentId: string
  readonly timestamp: string
  readonly context: Record<string, unknown>
  readonly userMessage?: string
}

/**
 * Encode one SDK action as bounded JSON in the existing durable user-message channel.
 * @param action - SDK action fields; SDK extension fields are deliberately excluded.
 * @returns the native message text, or null for unsafe or oversized input.
 */
export function formatA2uiActionMessage(action: A2uiActionInput): string | null {
  const name = action.name.trim()
  const surfaceId = action.surfaceId.trim()
  const sourceComponentId = action.sourceComponentId.trim()
  const timestamp = action.timestamp.trim()
  if (name === '' || surfaceId === '' || sourceComponentId === '' || timestamp === '') return null
  const inputContext: unknown = action.context
  if (!isActionJson(inputContext)) return null
  const context = snapshotJsonValue(inputContext)
  /* v8 ignore next -- the same iterative walker admitted inputContext immediately above. */
  if (context === undefined) return null
  const payload: Record<string, JsonValue> = {
    type: 'a2ui/action', version: 1, name, surfaceId, sourceComponentId, timestamp, context,
  }
  const userMessage = action.userMessage?.trim()
  if (userMessage) payload.userMessage = userMessage
  const message = `${ACTION_PREFIX}${JSON.stringify(payload)}${SUCCESSOR_INSTRUCTION}`
  return new TextEncoder().encode(message).byteLength <= MAX_ACTION_BYTES ? message : null
}
