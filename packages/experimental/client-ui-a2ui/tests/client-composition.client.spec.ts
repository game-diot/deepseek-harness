// @vitest-environment jsdom
/** Whole-client loading and unloading of the opt-in A2UI Tool View. */
import { expect, vi } from 'vitest'
import { FiberState } from '@deepseek-ai/cordis'
import {
  ClientRoster, createClientTest, webApp,
} from '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import * as a2uiClient from '../src/client/index.ts'

const A2UI = '@deepseek-ai/dsh-client-ui-a2ui'
const LOCALE = '@deepseek-ai/dsh-client-locale'
const TOOL = '@deepseek-ai/dsh-client-ui-tool'
const roster = ClientRoster.of([
  ...webApp.rows,
  { name: A2UI, inject: [LOCALE, TOOL], immediately: false },
])
const it = createClientTest({ roster, provide: { [A2UI]: a2uiClient } })

it('activates the A2UI module through the Client Loader and removes its Tool View on unload', async ({ start }) => {
  const client = await start()
  const registered = () => client.ctx.slots.entries('tool.call.toolview')
    .some(entry => entry.options.key === 'a2ui_render')
  const entry = (name: string) => [...client.ctx.loader.entries()].find(candidate => candidate.options.name === name)

  expect(entry(TOOL)?.fiber?.state).toBe(FiberState.ACTIVE)
  expect(entry(A2UI)?.fiber?.state).toBe(FiberState.ACTIVE)
  await vi.waitFor(() => { expect(registered()).toBe(true) })

  await client.unload(A2UI)

  expect(registered()).toBe(false)
}, 60_000)
