/** Lightweight admission for persisted A2UI tool metadata before the renderer chunk loads. */

import { snapshotJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'

const OPERATIONS = ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface'] as const

/** JSON data retained by the Client before the A2UI SDK performs full validation. */
export type A2uiClientJson = JsonValue

/** Metadata envelope admitted to the lazy A2UI runtime. */
export interface A2uiClientEnvelope {
  readonly protocol: 'a2ui/v1'
  readonly messages: readonly { readonly version: '1.0'; readonly [key: string]: A2uiClientJson }[]
  /** Button action names the deployment requires the user to confirm first. */
  readonly approval?: readonly string[]
}

const MAX_APPROVAL_NAMES = 8

function isMessage(value: A2uiClientJson): value is A2uiClientEnvelope['messages'][number] {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || value.version !== '1.0') return false
  const operation = OPERATIONS.find(candidate => Object.hasOwn(value, candidate))
  if (operation === undefined) return false
  if (OPERATIONS.some(candidate => candidate !== operation && Object.hasOwn(value, candidate))) return false
  const payload = value[operation]
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
}

/**
 * Detach a supported A2UI metadata envelope for the lazy renderer.
 * @param metadata - untrusted Tool result metadata from live or historical Session data.
 * @returns a detached envelope, or null when the discriminator or message framing is unsupported.
 */
export function parseA2uiMetadata(metadata: unknown): A2uiClientEnvelope | null {
  const detached = snapshotJsonValue(metadata)
  if (typeof detached !== 'object' || detached === null || Array.isArray(detached)) return null
  const snapshot = detached as Record<string, JsonValue>
  const keys = Object.keys(snapshot)
  if (keys.length !== 2 && keys.length !== 3) return null
  if (snapshot.protocol !== 'a2ui/v1' || !Array.isArray(snapshot.messages)
    || snapshot.messages.length === 0 || !snapshot.messages.every(isMessage)) return null
  const approval = snapshot.approval
  if (approval === undefined) return { protocol: 'a2ui/v1', messages: snapshot.messages }
  if (!Array.isArray(approval) || approval.length === 0 || approval.length > MAX_APPROVAL_NAMES) return null
  if (!approval.every(entry => typeof entry === 'string')) return null
  return { protocol: 'a2ui/v1', messages: snapshot.messages, approval }
}
