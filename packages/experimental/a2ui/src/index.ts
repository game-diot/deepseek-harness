/** Experimental model-facing tool for validated, replayable A2UI v1 messages. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool, ToolArgsError } from '@deepseek-ai/dsh-tools'
import { parseA2uiEnvelope } from './schema.ts'
import { A2UI_META_PROTOCOL } from './types.ts'

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'a2ui'

/** Tool registry required by this model-facing consumer. */
export const inject = ['tools']

/** Deployment-owned message and component limits. */
export interface Config {
  /** Maximum messages accepted by one call. */
  maxMessages?: number
  /** Maximum components accepted across one call. */
  maxComponents?: number
  /** Maximum UTF-8 bytes in the canonical envelope. */
  maxBytes?: number
}

/** Loader configuration schema for A2UI resource bounds. */
export const Config: z<Config> = z.object({
  maxMessages: z.number().step(1).min(1).default(8),
  maxComponents: z.number().step(1).min(1).default(100),
  maxBytes: z.number().step(1).min(1).default(65_536),
})

interface ResolvedConfig {
  readonly maxMessages: number
  readonly maxComponents: number
  readonly maxBytes: number
}

function resolveConfig(config: Config): ResolvedConfig {
  return {
    maxMessages: config.maxMessages ?? 8,
    maxComponents: config.maxComponents ?? 100,
    maxBytes: config.maxBytes ?? 65_536,
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
  },
}

/** Register the `a2ui_render` tool for this plugin's lifetime. */
export function apply(ctx: Context, config: Config): void {
  const limits = resolveConfig(config)
  ctx.tools.register(defineTool({
    name: 'a2ui_render',
    description: 'Validate and persist declarative A2UI v1 Basic Catalog messages for a compatible conversation renderer. When a user message starts with `[A2UI action]`, read its JSON and call this tool again with a complete successor Surface when the action changes visible state; do not rewrite the historical Surface.',
    parameters: {
      messages: {
        type: 'array',
        required: true,
        description: 'A2UI v1 messages using only the supported Basic Catalog components.',
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
    execute: (args) => {
      try {
        const parsed = parseA2uiEnvelope(args.messages)
        enforceLimits(parsed, limits)
        return Promise.resolve(parsed.envelope)
      } catch (error) {
        if (error instanceof ToolArgsError) throw error
        /* v8 ignore next -- Zod and this package's graph checks throw Error instances. */
        if (!(error instanceof Error)) throw error
        throw new ToolArgsError([error.message])
      }
    },
  }))
}
