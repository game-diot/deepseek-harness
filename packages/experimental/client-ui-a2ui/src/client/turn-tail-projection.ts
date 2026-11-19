/** Turn-scoped projection of durable A2UI Tool result metadata. */

import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { A2uiClientEnvelope } from './metadata.ts'
import { parseA2uiMetadata } from './metadata.ts'

/** Published A2UI cards for one completed Turn. */
export interface A2uiTurnTailData {
  readonly envelopes: readonly A2uiClientEnvelope[]
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    /** Durable A2UI result metadata displayed after the completed Turn. */
    'a2ui-turn-tail': A2uiTurnTailData
  }
}

interface A2uiTurnState {
  readonly turn: number
  readonly names: ReadonlyMap<string, string>
  readonly envelopes: readonly A2uiClientEnvelope[]
}

/** Fold A2UI calls and results without scanning the Session window. */
export const a2uiTurnDefinition: ConversationNodeDefinition<A2uiTurnState> = {
  kind: 'a2ui-turn-tail',
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'tool/call' || event.type === 'tool/result') {
      return { id: String(event.data.turn), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'turn/start') throw new Error('a2ui-turn-tail start requires turn/start')
    return { turn: match.event.data.turn, names: new Map(), envelopes: [] }
  },
  update: (context, match) => {
    const event = match.event
    if (event.type === 'tool/call') {
      const names = new Map(context.state.names)
      names.set(String(event.data.callId), event.data.name)
      return { ...context.state, names }
    }
    if (event.type !== 'tool/result') return context.state
    const callId = String(event.data.message.source.callId)
    if (context.state.names.get(callId) !== 'a2ui_render' || event.data.message.isError === true) return context.state
    const envelope = parseA2uiMetadata(event.data.meta)
    return envelope === null ? context.state : { ...context.state, envelopes: [...context.state.envelopes, envelope] }
  },
  publication: match => match.event.type === 'tool/result' ? 'immediate' : 'none',
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn' || context.state === undefined || context.state.envelopes.length === 0) return null
    if (previous?.kind === 'turn' && previous.key === 'a2ui-turn-tail'
      && previous.value.envelopes === context.state.envelopes) return previous
    return {
      kind: 'turn', turn: context.state.turn, key: 'a2ui-turn-tail',
      value: { envelopes: context.state.envelopes },
    }
  },
}
