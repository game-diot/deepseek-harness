import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import * as A2ui from '../src/index.ts'

const signal = new AbortController().signal
let callNumber = 0

async function setup(config: A2ui.Config = {}) {
  const ctx = new Context()
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(A2ui, config)
  return ctx
}

async function setupDirect() {
  const ctx = new Context()
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(ToolRuntime)
  A2ui.apply(ctx, {})
  return ctx
}

function call(ctx: Context, messages: unknown[]) {
  return executeToolFixture(ctx, {
    signal,
    callId: brandString<ToolCallId>(`a2ui-${++callNumber}`),
    name: 'a2ui_render',
    arguments: { messages },
  })
}

function resultText(result: { content: readonly { type: string; text?: string }[] }): string {
  return result.content.flatMap(block => block.type === 'text' && block.text !== undefined ? [block.text] : []).join('')
}

const createSurface = {
  version: '1.0',
  createSurface: {
    surfaceId: 'learningCard',
    catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
    components: [
      { id: 'root', component: 'Card', child: 'content' },
      { id: 'content', component: 'Column', children: ['title', 'confirmButton'] },
      { id: 'title', component: 'Text', text: '学习任务' },
      {
        id: 'confirmButton', component: 'Button', child: 'confirmLabel',
        action: { event: { name: 'confirm_learning', context: { accepted: true } } },
      },
      { id: 'confirmLabel', component: 'Text', text: '确认' },
    ],
    dataModel: { status: 'ready' },
  },
}

describe('a2ui_render', () => {
  it('tells the model how to render a successor after a durable A2UI action', async () => {
    const ctx = await setup()

    expect(ctx.tools.schemas().find(tool => tool.name === 'a2ui_render')?.description).toContain(
      'When a user message starts with `[A2UI action]`, read its JSON and call this tool again',
    )
  })

  it('returns validated A2UI messages as durable presentation metadata', async () => {
    const ctx = await setup()

    const result = await call(ctx, [createSurface])

    expect(result).toMatchObject({
      isError: false,
      value: { protocol: 'a2ui/v1', messages: [createSurface] },
      meta: { protocol: 'a2ui/v1', messages: [createSurface] },
      content: [{ type: 'text', text: 'Accepted one A2UI message for a compatible renderer.' }],
    })
  })

  it('applies deployment defaults in direct function-plugin composition', async () => {
    const ctx = await setupDirect()

    const result = await call(ctx, [createSurface])

    expect(result.isError).toBe(false)
  })

  it('rejects an empty message batch', async () => {
    const ctx = await setup()

    const result = await call(ctx, [])

    expect(result).toMatchObject({
      isError: true,
      error: { info: { name: 'ToolArgsError', code: 'INVALID_ARGS' } },
    })
  })

  it('rejects a createSurface component reference that is not declared', async () => {
    const ctx = await setup()
    const invalid = structuredClone(createSurface)
    invalid.createSurface.components[0] = { id: 'root', component: 'Card', child: 'missingContent' }

    const result = await call(ctx, [invalid])

    expect(result).toMatchObject({
      isError: true,
      error: { info: { name: 'ToolArgsError', code: 'INVALID_ARGS' } },
    })
    expect(resultText(result)).toContain('references missing component "missingContent"')
  })

  it('rejects duplicate component ids in one createSurface', async () => {
    const ctx = await setup()
    const invalid = structuredClone(createSurface)
    invalid.createSurface.components[1] = { id: 'root', component: 'Text', text: 'duplicate' }

    const result = await call(ctx, [invalid])

    expect(result).toMatchObject({
      isError: true,
      error: { info: { name: 'ToolArgsError', code: 'INVALID_ARGS' } },
    })
    expect(resultText(result)).toContain('duplicate component id "root"')
  })

  it('rejects a call above the configured message limit', async () => {
    const ctx = await setup({ maxMessages: 1 })
    const secondSurface = structuredClone(createSurface)
    secondSurface.createSurface.surfaceId = 'learningCard2'

    const result = await call(ctx, [createSurface, secondSurface])

    expect(result).toMatchObject({
      isError: true,
      error: { info: { name: 'ToolArgsError', code: 'INVALID_ARGS' } },
    })
    expect(resultText(result)).toContain('messages exceeds maxMessages 1')
  })

  it('rejects a call above the configured component limit', async () => {
    const ctx = await setup({ maxComponents: 4 })

    const result = await call(ctx, [createSurface])

    expect(result).toMatchObject({
      isError: true,
      error: { info: { name: 'ToolArgsError', code: 'INVALID_ARGS' } },
    })
    expect(resultText(result)).toContain('components exceeds maxComponents 4')
  })

  it('counts updateComponents entries toward the component limit', async () => {
    const ctx = await setup({ maxComponents: 1 })
    const update = {
      version: '1.0',
      updateComponents: {
        surfaceId: 'learningCard',
        components: [
          { id: 'first', component: 'Text', text: '一' },
          { id: 'second', component: 'Text', text: '二' },
        ],
      },
    }

    const result = await call(ctx, [update])

    expect(result).toMatchObject({
      isError: true,
      error: { info: { name: 'ToolArgsError', code: 'INVALID_ARGS' } },
    })
  })

  it('rejects a canonical envelope above the configured UTF-8 byte limit', async () => {
    const ctx = await setup({ maxBytes: 64 })

    const result = await call(ctx, [createSurface])

    expect(result).toMatchObject({
      isError: true,
      error: { info: { name: 'ToolArgsError', code: 'INVALID_ARGS' } },
    })
    expect(resultText(result)).toContain('envelope exceeds maxBytes 64')
  })

  it('preserves component, data-model, and deletion updates in metadata', async () => {
    const ctx = await setup()
    const updates = [
      createSurface,
      {
        version: '1.0',
        updateComponents: {
          surfaceId: 'learningCard',
          components: [{ id: 'title', component: 'Text', text: '进行中', variant: 'caption' }],
        },
      },
      {
        version: '1.0',
        updateDataModel: { surfaceId: 'learningCard', path: '/status', value: 'running' },
      },
      { version: '1.0', deleteSurface: { surfaceId: 'learningCard' } },
    ]

    const result = await call(ctx, updates)

    expect(result).toMatchObject({
      isError: false,
      value: { protocol: 'a2ui/v1', messages: updates },
      meta: { protocol: 'a2ui/v1', messages: updates },
    })
  })

  it('rejects cyclic, unreachable, and update-only component graphs', async () => {
    const ctx = await setup()
    const cyclic = structuredClone(createSurface)
    cyclic.createSurface.components[0] = { id: 'root', component: 'Card', child: 'root' }
    expect((await call(ctx, [cyclic])).isError).toBe(true)

    const unreachable = structuredClone(createSurface)
    unreachable.createSurface.components.push({ id: 'orphan', component: 'Text', text: 'orphan' })
    expect((await call(ctx, [unreachable])).isError).toBe(true)

    const updateOnly = {
      version: '1.0', updateComponents: {
        surfaceId: 'missing', components: [{ id: 'root', component: 'Text', text: 'missing' }],
      },
    }
    expect((await call(ctx, [updateOnly])).isError).toBe(true)
  })

  it('accepts a reachable component referenced more than once', async () => {
    const ctx = await setup()
    const shared = structuredClone(createSurface)
    shared.createSurface.components = [
      { id: 'root', component: 'Column', children: ['title', 'title'] },
      { id: 'title', component: 'Text', text: 'shared' },
    ]
    expect((await call(ctx, [shared])).isError).toBe(false)
  })

  it('rejects duplicate Surface creation and data updates for unknown Surfaces', async () => {
    const ctx = await setup()
    expect((await call(ctx, [createSurface, createSurface])).isError).toBe(true)
    expect((await call(ctx, [{
      version: '1.0', updateDataModel: { surfaceId: 'missing', path: '/status', value: 'done' },
    }])).isError).toBe(true)
  })

  it('rejects a component outside the admitted Basic Catalog subset', async () => {
    const ctx = await setup()
    const invalid = structuredClone(createSurface)
    const component: unknown = {
      id: 'script', component: 'ArbitraryScript', code: 'alert("unsafe")',
    }

    const result = await call(ctx, [{
      ...invalid,
      createSurface: {
        ...invalid.createSurface,
        components: [component, ...invalid.createSurface.components.slice(1)],
      },
    }])

    expect(result).toMatchObject({
      isError: true,
      error: { info: { name: 'ToolArgsError', code: 'INVALID_ARGS' } },
    })
    expect(JSON.stringify(result)).not.toContain('alert("unsafe")')
  })

  it('rejects a Button variant outside the A2UI v1 Basic Catalog', async () => {
    const ctx = await setup()
    const invalid = structuredClone(createSurface)
    const button = invalid.createSurface.components[3]
    if (button?.component !== 'Button') throw new Error('fixture Button is missing')

    const result = await call(ctx, [{
      ...invalid,
      createSurface: {
        ...invalid.createSurface,
        components: invalid.createSurface.components.map((item, index) => (
          index === 3 ? { ...button, variant: 'secondary' } : item
        )),
      },
    }])

    expect(result.isError).toBe(true)
  })

  it('rejects a non-object createSurface dataModel', async () => {
    const ctx = await setup()
    const invalid = structuredClone(createSurface)

    const result = await call(ctx, [{
      ...invalid,
      createSurface: { ...invalid.createSurface, dataModel: 'not-an-object' },
    }])

    expect(result.isError).toBe(true)
  })

  it('rejects non-DynamicValue action context entries', async () => {
    const ctx = await setup()
    const invalid = structuredClone(createSurface)
    const button = invalid.createSurface.components[3]
    if (button?.component !== 'Button') throw new Error('fixture Button is missing')

    const result = await call(ctx, [{
      ...invalid,
      createSurface: {
        ...invalid.createSurface,
        components: invalid.createSurface.components.map((item, index) => index === 3
          ? {
            ...button,
            action: { event: {
              ...button.action?.event,
              context: { nullValue: null, reservedObject: { '@path': '/status', extra: true } },
            } },
          }
          : item),
      },
    }])

    expect(result.isError).toBe(true)
  })

  it('accepts path and call as ordinary literal-object keys', async () => {
    const ctx = await setup()
    const invalid = structuredClone(createSurface)
    const button = invalid.createSurface.components[3]
    if (button?.component !== 'Button') throw new Error('fixture Button is missing')

    const result = await call(ctx, [{
      ...invalid,
      createSurface: {
        ...invalid.createSurface,
        components: invalid.createSurface.components.map((item, index) => index === 3
          ? {
            ...button,
            action: { event: {
              ...button.action?.event,
              context: { literalObject: { path: 'plain', call: 'plain' } },
            } },
          }
          : item),
      },
    }])

    expect(result.isError).toBe(false)
  })

  it.each(['@evil', '@'])('rejects a literal action context object containing reserved key %s', async (key) => {
    const ctx = await setup()
    const invalid = structuredClone(createSurface)
    const button = invalid.createSurface.components[3]
    if (button?.component !== 'Button') throw new Error('fixture Button is missing')

    const result = await call(ctx, [{
      ...invalid,
      createSurface: {
        ...invalid.createSurface,
        components: invalid.createSurface.components.map((item, index) => index === 3
          ? {
            ...button,
            action: { event: {
              ...button.action?.event,
              context: { reservedObject: { [key]: '/status', extra: true } },
            } },
          }
          : item),
      },
    }])

    expect(result.isError).toBe(true)
  })

  it('rejects an empty updateComponents list', async () => {
    const ctx = await setup()

    const result = await call(ctx, [{
      version: '1.0', updateComponents: { surfaceId: 'learningCard', components: [] },
    }])

    expect(result.isError).toBe(true)
  })

  it('rejects createSurface without the canonical root component', async () => {
    const ctx = await setup()
    const invalid = structuredClone(createSurface)

    const result = await call(ctx, [{
      ...invalid,
      createSurface: {
        ...invalid.createSurface,
        components: invalid.createSurface.components.slice(1),
      },
    }])

    expect(result.isError).toBe(true)
  })
})
