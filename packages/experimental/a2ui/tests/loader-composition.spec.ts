import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as A2ui from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('a2ui real Loader composition through cordis.yml', () => {
  it('registers and removes a2ui_render with its config row', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-a2ui-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      '- name: cordis:system-prompt',
      '- name: cordis:tools',
      '- id: a2ui',
      '  name: cordis:a2ui',
      '  config:',
      '    maxMessages: 1',
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    context.loader.builtins['system-prompt'] = SystemPrompt
    context.loader.builtins.tools = ToolRuntime
    context.loader.builtins.a2ui = A2ui
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await context.loader.await()

    expect(context.tools.get('a2ui_render')).toBeDefined()
    const entry = [...context.loader.entries()].find(item => item.options.id === 'a2ui')
    expect(entry).toBeDefined()
    await entry?.fiber?.dispose()
    expect(context.tools.get('a2ui_render')).toBeUndefined()
  })
})
