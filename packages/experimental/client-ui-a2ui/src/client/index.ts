/** Register the A2UI tool-result row and its localized browser copy. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { A2uiToolRow } from './A2uiToolRow.tsx'
import { A2uiTurnTail } from './A2uiTurnTail.tsx'
import { de, en, es, fr, ja, NS, pt, ru, zh, type A2uiClientKey } from './locales.ts'
import { a2uiTurnDefinition } from './turn-tail-projection.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** A2UI result admission, fallback, and renderer status copy. */
    'a2ui.client': A2uiClientKey
  }
}

/** Required services for dictionary and keyed Tool View registration. */
export const inject = ['slots', 'locale', 'uiConversation']

/**
 * Register the A2UI Tool View for this Client plugin's lifetime.
 * @param ctx - browser Slot and locale services.
 */
export function apply(ctx: Context): void {
  ctx.uiConversation.events.register(a2uiTurnDefinition)
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'client-ui-a2ui: dictionaries')
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: 'a2ui_render', locale: NS }, A2uiToolRow,
  ))
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register(
    { name: 'conversation.chat.turnTail', id: '@deepseek-ai/dsh-client-ui-a2ui', locale: NS }, A2uiTurnTail,
  ))
}
