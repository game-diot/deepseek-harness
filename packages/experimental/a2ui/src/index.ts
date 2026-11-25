/** Experimental model-facing tool for validated, replayable A2UI v1 messages. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool, ToolArgsError } from '@deepseek-ai/dsh-tools'
import { isJsonValue, snapshotJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'
import { keepReachableFromRoot, parseA2uiEnvelope } from './schema.ts'
import { A2UI_META_PROTOCOL } from './types.ts'

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'a2ui'

/** Tool and prompt registries required by this model-facing consumer. */
export const inject = ['tools', 'systemPrompt']

/** Deployment-owned message and component limits. */
export interface Config {
  /** Maximum messages accepted by one call. */
  maxMessages?: number
  /** Maximum components accepted across one call. */
  maxComponents?: number
  /** Maximum UTF-8 bytes in the canonical envelope. */
  maxBytes?: number
  /**
   * Accept incremental messages that target a Surface created in an earlier call.
   * Leave false when a renderer holds no cross-turn Surface state: such an envelope
   * cannot be rendered from scratch.
   */
  allowIncremental?: boolean
  /**
   * Button action names that a renderer must confirm before submitting.
   * Matched names are recorded in the Tool result metadata as `approval`.
   */
  approvalActions?: string[]
}

/** Loader configuration schema for A2UI resource bounds. */
export const Config: z<Config> = z.object({
  maxMessages: z.number().step(1).min(1).default(8),
  maxComponents: z.number().step(1).min(1).default(100),
  maxBytes: z.number().step(1).min(1).default(65_536),
  allowIncremental: z.boolean().default(false),
  approvalActions: z.array(z.string()).default([]),
})

interface ResolvedConfig {
  readonly maxMessages: number
  readonly maxComponents: number
  readonly maxBytes: number
  readonly allowIncremental: boolean
  readonly approvalActions: readonly string[]
}

function resolveConfig(config: Config): ResolvedConfig {
  return {
    maxMessages: config.maxMessages ?? 8,
    maxComponents: config.maxComponents ?? 100,
    maxBytes: config.maxBytes ?? 65_536,
    allowIncremental: config.allowIncremental ?? false,
    approvalActions: config.approvalActions ?? [],
  }
}

function enforceLimits(
  value: { readonly envelope: { readonly messages: readonly unknown[] }; readonly componentCount: number },
  config: ResolvedConfig,
): void {
  const { envelope, componentCount } = value
  if (envelope.messages.length > config.maxMessages) {
    throw new ToolArgsError([`messages exceeds maxMessages ${String(config.maxMessages)}`])
  }
  if (componentCount > config.maxComponents) {
    throw new ToolArgsError([`components exceeds maxComponents ${String(config.maxComponents)}`])
  }
  const bytes = Buffer.byteLength(JSON.stringify(envelope))
  if (bytes > config.maxBytes) {
    throw new ToolArgsError([`envelope exceeds maxBytes ${String(config.maxBytes)}`])
  }
}

const OUTPUT_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    protocol: { type: 'string' as const, const: A2UI_META_PROTOCOL, required: true as const },
    messages: { type: 'array' as const, items: { type: 'json' as const }, required: true as const },
    approval: { type: 'array' as const, items: { type: 'string' as const } },
  },
}

/**
 * Names of Button actions in this batch that the deployment requires confirming.
 * @param envelope - validated canonical messages.
 * @param guarded - configured action names that need confirmation.
 * @returns the matching action names, in first-seen order.
 */
function approvalNames(
  envelope: { readonly messages: readonly unknown[] },
  guarded: readonly string[],
): string[] {
  if (guarded.length === 0) return []
  const found = new Set<string>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (typeof value !== 'object' || value === null) return
    const record = value as Record<string, unknown>
    const event = record.action
    if (typeof event === 'object' && event !== null) {
      const name = (event as Record<string, unknown>).event
      /* v8 ignore next -- the parser admits an action only with an event object. */
      if (typeof name === 'object' && name !== null) {
        const candidate = (name as Record<string, unknown>).name
        if (typeof candidate === 'string' && guarded.includes(candidate)) found.add(candidate)
      }
    }
    for (const item of Object.values(record)) walk(item)
  }
  walk(envelope.messages)
  return [...found]
}

/**
 * One Surface as this deployment last observed it, so an incremental message can be
 * composed into a complete successor any renderer can draw from scratch.
 */
interface SurfaceState {
  readonly catalogId: string
  components: unknown[]
  dataModel: unknown
  metadata?: unknown
}

/** Surfaces one Session may keep for incremental messages. */
const MAX_REMEMBERED_SURFACES = 32

function mergeComponents(existing: readonly unknown[], updates: readonly unknown[]): unknown[] {
  const order: string[] = []
  const byId = new Map<string, unknown>()
  for (const component of [...existing, ...updates]) {
    /* v8 ignore next -- the parser admits only object components. */
    if (typeof component !== 'object' || component === null) continue
    const id = (component as { id?: unknown }).id
    /* v8 ignore next -- the parser admits only components with a string id. */
    if (typeof id !== 'string') continue
    if (!byId.has(id)) order.push(id)
    byId.set(id, component)
  }
  return order.map(id => byId.get(id))
}

function setModelPath(model: unknown, path: string, value: unknown): unknown {
  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0) return value
  const root = typeof model === 'object' && model !== null && !Array.isArray(model)
    ? { ...(model as Record<string, unknown>) }
    : {}
  let cursor: Record<string, unknown> = root
  for (const segment of segments.slice(0, -1)) {
    const next = cursor[segment]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) cursor[segment] = {}
    else cursor[segment] = { ...(next as Record<string, unknown>) }
    cursor = cursor[segment] as Record<string, unknown>
  }
  const leaf = segments.at(-1)
  /* v8 ignore next -- a non-empty path always has a final segment. */
  if (leaf !== undefined) cursor[leaf] = value
  return root
}

function toJson(value: unknown): JsonValue {
  const snapshot = snapshotJsonValue(value)
  /* v8 ignore next -- composition only reuses fields the parser already validated. */
  if (!isJsonValue(snapshot)) throw new TypeError('composed A2UI message is not lossless JSON')
  return snapshot as JsonValue
}

function surfaceMessage(surfaceId: string, state: SurfaceState): Record<string, unknown> {
  return {
    version: '1.0',
    createSurface: {
      surfaceId,
      catalogId: state.catalogId,
      components: state.components,
      ...state.dataModel === undefined ? {} : { dataModel: state.dataModel },
      ...state.metadata === undefined ? {} : { metadata: state.metadata },
    },
  }
}

/**
 * Apply one envelope to remembered Surface state and emit complete successors.
 * @param messages - validated messages of this call.
 * @param states - the Session's remembered Surfaces, mutated in place.
 * @returns messages a stateless renderer can draw, in first-touch order.
 */
function composeComplete(messages: readonly unknown[], states: Map<string, SurfaceState>): JsonValue[] {
  const touched = new Map<string, SurfaceState>()
  const removed: string[] = []
  for (const entry of messages) {
    /* v8 ignore next -- parsed messages are always objects. */
    if (typeof entry !== 'object' || entry === null) continue
    const message = entry as Record<string, unknown>
    const created = message.createSurface as {
      surfaceId: string
      catalogId: string
      components: unknown[]
      dataModel?: unknown
      metadata?: unknown
    } | undefined
    if (created !== undefined) {
      const state: SurfaceState = {
        catalogId: created.catalogId,
        components: keepReachableFromRoot(created.components),
        dataModel: created.dataModel,
        ...created.metadata === undefined ? {} : { metadata: created.metadata },
      }
      states.set(created.surfaceId, state)
      touched.set(created.surfaceId, state)
      continue
    }
    const updated = message.updateComponents as { surfaceId: string; components: unknown[] } | undefined
    if (updated !== undefined) {
      const state = states.get(updated.surfaceId)
      /* v8 ignore next -- the parser admits this target only when the Surface is known. */
      if (state === undefined) continue
      state.components = keepReachableFromRoot(mergeComponents(state.components, updated.components))
      touched.set(updated.surfaceId, state)
      continue
    }
    const data = message.updateDataModel as { surfaceId: string; path: string; value: unknown } | undefined
    if (data !== undefined) {
      const state = states.get(data.surfaceId)
      /* v8 ignore next -- the parser admits this target only when the Surface is known. */
      if (state === undefined) continue
      state.dataModel = setModelPath(state.dataModel, data.path, data.value)
      touched.set(data.surfaceId, state)
      continue
    }
    const deleted = message.deleteSurface as { surfaceId: string } | undefined
    /* v8 ignore next -- the parser admits only the four handled message kinds. */
    if (deleted !== undefined) {
      states.delete(deleted.surfaceId)
      touched.delete(deleted.surfaceId)
      removed.push(deleted.surfaceId)
    }
  }
  const composed = [...touched].map(([surfaceId, state]) => toJson(surfaceMessage(surfaceId, state)))
  for (const surfaceId of removed) composed.push(toJson({ version: '1.0', deleteSurface: { surfaceId } }))
  return composed
}

/** Register the `a2ui_render` tool for this plugin's lifetime. */
/** Model-facing routing between the renderer and workspace file edits. */
const GUIDANCE = `Interactive interfaces belong in \`a2ui_render\`, not in workspace files. When the user asks for a card, form, table, checklist, wizard, or dashboard panel, compose the A2UI messages directly in the tool call; do not write generator scripts, HTML, CSS, or JavaScript that produce them, and do not start a preview server.

Write files only for code the user keeps in their project. When both apply, draw the interface first and describe the files afterwards.`

export function apply(ctx: Context, config: Config): void {
  const limits = resolveConfig(config)
  ctx.systemPrompt.section({
    name,
    order: ctx.systemPrompt.getSectionOrder('TOOL_A2UI'),
    text: GUIDANCE,
  })
  const surfaceStates = new WeakMap<object, Map<string, SurfaceState>>()
  ctx.tools.register(defineTool({
    name: 'a2ui_render',
    description: 'Validate and persist declarative A2UI v1 Basic Catalog messages for a compatible conversation renderer. Render repeated content with a ChildList template (`children: {componentId, path}`) and bind each item by a path relative to the item, never an absolute one. When a user message starts with `[A2UI action]`, read its JSON and call this tool again with a complete successor Surface when the action changes visible state; do not rewrite the historical Surface. Task and metric interfaces may use the business components admitted under catalog `https://dsh.dev/a2ui/catalogs/task/v1`: `ActionButton` (label, variant, local set/toggle or Agent event), `DataTable` (label, columns with optional local sorting, scalar rows, emptyText, optional local filter, optional Agent row actions with local confirmation), `Progress` (label, optional value/max, tone), `StatusBadge` (label, tone), `Statistic` (label, value, trend, tone), and `TaskCard` (title, owner, priority, status, child); a Surface that uses them must name that catalog, and the Basic Catalog identifier still refuses them.',
    parameters: {
      messages: {
        type: 'array',
        required: true,
        description: 'A2UI v1 messages using only the admitted catalog components.',
        items: { type: 'object', additionalProperties: true },
      },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{
        type: 'text',
        text: `Accepted ${value.messages.length === 1 ? 'one' : String(value.messages.length)} A2UI message${value.messages.length === 1 ? '' : 's'} for a compatible renderer.`,
      }],
      presentationMeta: (_args, value) => value,
    },
    execute: (args, exec) => {
      try {
        const session = limits.allowIncremental && exec.agent !== undefined ? exec.agent.session : undefined
        let states: Map<string, SurfaceState> | undefined
        if (session !== undefined) {
          states = surfaceStates.get(session)
          if (states === undefined) {
            states = new Map<string, SurfaceState>()
            surfaceStates.set(session, states)
          }
          const overflow = states.size - MAX_REMEMBERED_SURFACES + 1
          if (overflow > 0) {
            for (const stale of [...states.keys()].slice(0, overflow)) states.delete(stale)
          }
        }
        const known = states === undefined ? undefined : new Set(states.keys())
        const parsed = parseA2uiEnvelope(args.messages, known)
        enforceLimits(parsed, limits)
        const composed = states === undefined
          ? parsed.envelope
          : { protocol: parsed.envelope.protocol, messages: composeComplete(parsed.envelope.messages, states) }
        if (composed !== parsed.envelope) enforceLimits({ envelope: composed, componentCount: parsed.componentCount }, limits)
        const approval = approvalNames(composed, limits.approvalActions)
        return Promise.resolve(approval.length === 0 ? composed : { ...composed, approval })
      } catch (error) {
        if (error instanceof ToolArgsError) throw error
        /* v8 ignore next -- Zod and this package's graph checks throw Error instances. */
        if (!(error instanceof Error)) throw error
        throw new ToolArgsError([error.message])
      }
    },
  }))
}
