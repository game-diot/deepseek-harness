// @vitest-environment jsdom
import { onTestFinished } from 'vitest'
import { describe, expect, it } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { UiConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { apply as hostApply } from '../src/index.ts'
import { apply, inject } from '../src/client/index.ts'
import { A2uiToolRow } from '../src/client/A2uiToolRow.tsx'

async function bench() {
  const runtime = await SlotTestRuntime.create()
  onTestFinished(() => runtime.dispose())
  const locale = new LocaleRuntime(runtime.ctx)
  new UiConversation(runtime.ctx, runtime.sessions)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  await runtime.declare({
    'tool.call.toolview': { kind: 'keyed', scope: 'session' },
    'conversation.chat.turnTail': { kind: 'list', scope: 'session' },
  })
  const plugin = await runtime.mount({ inject: [...inject], apply })
  return { runtime, plugin }
}

describe('A2UI keyed Tool View registration', () => {
  it('keeps the Host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('registers on the declared slot and removes the keyed replacement on disposal', async () => {
    const { runtime, plugin } = await bench()
    const entry = runtime.slots.entries('tool.call.toolview').find(item => item.options.key === 'a2ui_render')

    expect(entry?.component).toBe(A2uiToolRow)
    expect(entry?.locale).toBe('a2ui.client')
    expect(runtime.slots.entries('conversation.chat.turnTail')).toHaveLength(1)

    await plugin.dispose()

    expect(runtime.slots.entries('tool.call.toolview').some(item => item.options.key === 'a2ui_render')).toBe(false)
    expect(runtime.slots.entries('conversation.chat.turnTail')).toHaveLength(0)
  })
})
