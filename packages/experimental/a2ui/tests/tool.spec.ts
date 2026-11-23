import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import * as A2ui from '../src/index.ts'
import { keepReachableFromRoot } from '../src/schema.ts'

const signal = new AbortController().signal
let callNumber = 0

async function setup(config: A2ui.Config = {}) {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(A2ui, config)
  return ctx
}

async function setupDirect() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(ToolRuntime)
  A2ui.apply(ctx, {})
  return ctx
}

function call(ctx: Context, messages: unknown[], agent?: { session: object }) {
  return executeToolFixture(ctx, {
    signal,
    callId: brandString<ToolCallId>(`a2ui-${++callNumber}`),
    name: 'a2ui_render',
    arguments: { messages },
    ...agent === undefined ? {} : { agent: agent as never },
  })
}

type ToolMessage = {
  createSurface?: { components: { id: string; text?: string }[]; dataModel?: Record<string, unknown>; metadata?: unknown }
  deleteSurface?: { surfaceId: string }
}

function toolMessages(result: { readonly value?: { readonly messages: ToolMessage[] } }): ToolMessage[] {
  return result.value?.messages ?? []
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

  it('accepts the layout, media, and icon components of the Basic Catalog', async () => {
    const ctx = await setup()
    const result = await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'richSurface',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          { id: 'body', component: 'Column', children: ['headline', 'split', 'rule', 'note'], align: 'stretch' },
          { id: 'headline', component: 'Row', children: ['badge', 'title'], justify: 'start', align: 'center' },
          { id: 'badge', component: 'Icon', name: 'check' },
          { id: 'title', component: 'Text', text: 'Rich card', variant: 'body' },
          { id: 'split', component: 'Row', children: ['avatar', 'rule2'], justify: 'spaceBetween' },
          {
            id: 'avatar', component: 'Image',
            url: 'https://example.com/a.png', description: 'avatar', fit: 'cover', variant: 'avatar',
          },
          { id: 'rule2', component: 'Divider', axis: 'vertical' },
          { id: 'rule', component: 'Divider' },
          { id: 'note', component: 'Text', text: 'caption', variant: 'caption', weight: 1 },
        ],
      },
    }])

    expect(result).toMatchObject({ isError: false, value: { protocol: 'a2ui/v1' } })
  })

  it('rejects a layout property outside the Basic Catalog enum', async () => {
    const ctx = await setup()
    const result = await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'badLayout',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        components: [
          { id: 'root', component: 'Column', children: ['t'], justify: 'sideways' },
          { id: 't', component: 'Text', text: 'x' },
        ],
      },
    }])

    expect(result.isError).toBe(true)
  })

  it('rejects an Icon name that is not a plain identifier and unknown component props', async () => {
    const ctx = await setup()
    const batches = [
      [{ id: 'root', component: 'Icon', name: '<svg onload=alert(1)>' }],
      [{ id: 'root', component: 'Divider', colour: 'red' }],
      [{ id: 'root', component: 'Image', url: 'x', style: 'color:red' }],
    ]
    for (const components of batches) {
      const result = await call(ctx, [{
        version: '1.0',
        createSurface: {
          surfaceId: 'badProps',
          catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
          components,
        },
      }])
      expect(result.isError).toBe(true)
    }
  })

  it('accepts the four form controls bound to the data model', async () => {
    const ctx = await setup()
    const result = await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'formSurface',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        dataModel: { form: { name: '', agree: false, city: [], age: 30 } },
        components: [
          { id: 'root', component: 'Card', child: 'form' },
          { id: 'form', component: 'Column', children: ['name', 'agree', 'city', 'age', 'submit'] },
          {
            id: 'name', component: 'TextField',
            label: '姓名', value: { '@path': '/form/name' }, placeholder: '请输入', variant: 'shortText',
          },
          { id: 'agree', component: 'CheckBox', label: '同意条款', value: { '@path': '/form/agree' } },
          {
            id: 'city', component: 'ChoicePicker', label: '城市',
            options: [{ label: '北京', value: 'bj' }, { label: '重庆', value: 'cq' }],
            value: { '@path': '/form/city' }, variant: 'mutuallyExclusive',
          },
          { id: 'age', component: 'Slider', label: '年龄', min: 0, max: 120, value: { '@path': '/form/age' }, steps: 120 },
          {
            id: 'submit', component: 'Button', child: 'submitLabel',
            action: { event: { name: 'submitForm', context: { name: { '@path': '/form/name' } } } },
          },
          { id: 'submitLabel', component: 'Text', text: '提交' },
        ],
      },
    }])

    expect(result).toMatchObject({ isError: false, value: { protocol: 'a2ui/v1' } })
  })

  it('rejects form controls with missing required fields or out-of-catalog options', async () => {
    const ctx = await setup()
    const batches = [
      [{ id: 'root', component: 'TextField', label: 'x' }],
      [{ id: 'root', component: 'CheckBox', label: 'x', value: 'yes' }],
      [{ id: 'root', component: 'Slider', value: 1 }],
      [{ id: 'root', component: 'Slider', value: 1, max: 10, steps: 0 }],
      [{
        id: 'root', component: 'ChoicePicker', label: 'x', value: [],
        options: [{ label: 'a', value: 'a', extra: true }],
      }],
      [{ id: 'root', component: 'TextField', label: 'x', value: 'v', checks: [] }],
    ]
    for (const components of batches) {
      const result = await call(ctx, [{
        version: '1.0',
        createSurface: {
          surfaceId: 'badForm',
          catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
          components,
        },
      }])
      expect(result.isError).toBe(true)
    }
  })

  it('accepts catalog-legal ids with hyphens and rejects over-long ids', async () => {
    const ctx = await setup()
    const ok = await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'form-1',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        components: [
          { id: 'root', component: 'Card', child: 'body-1' },
          { id: 'body-1', component: 'Column', children: ['submit-btn'] },
          {
            id: 'submit-btn', component: 'Button', child: 'label-1',
            action: { event: { name: 'submit-form' } },
          },
          { id: 'label-1', component: 'Text', text: '提交' },
        ],
      },
    }])
    expect(ok).toMatchObject({ isError: false })

    const longId = 'x'.repeat(65)
    const rejected = await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'long-id',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        components: [{ id: longId, component: 'Text', text: 'x' }],
      },
    }])
    expect(rejected.isError).toBe(true)
  })

  it('accepts the remaining Basic Catalog components', async () => {
    const ctx = await setup()
    const result = await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'kitchenSink',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          { id: 'body', component: 'Column', children: ['list', 'tabs', 'modal', 'when', 'clip', 'track'] },
          { id: 'list', component: 'List', direction: 'horizontal', children: ['item1', 'item2'] },
          { id: 'item1', component: 'Text', text: 'one' },
          { id: 'item2', component: 'Text', text: 'two' },
          {
            id: 'tabs', component: 'Tabs',
            tabs: [{ title: '第一页', child: 'tabOne' }, { title: '第二页', child: 'tabTwo' }],
          },
          { id: 'tabOne', component: 'Text', text: '第一个标签页' },
          { id: 'tabTwo', component: 'Text', text: '第二个标签页' },
          { id: 'modal', component: 'Modal', trigger: 'openBtn', content: 'modalText' },
          { id: 'openBtn', component: 'Text', text: '打开弹窗' },
          { id: 'modalText', component: 'Text', text: '弹窗内容' },
          { id: 'when', component: 'DateTimeInput', label: '时间', value: '', enableDate: true, enableTime: true },
          { id: 'clip', component: 'Video', url: 'https://example.com/v.mp4', posterUrl: 'https://example.com/p.png' },
          { id: 'track', component: 'AudioPlayer', url: 'https://example.com/a.mp3', description: '示例音频' },
        ],
      },
    }])

    expect(result).toMatchObject({ isError: false, value: { protocol: 'a2ui/v1' } })
  })

  it('rejects incomplete tabs, modals, and date-time inputs', async () => {
    const ctx = await setup()
    const batches = [
      [{ id: 'root', component: 'Tabs', tabs: [] }],
      [{ id: 'root', component: 'Modal', trigger: 'a' }],
      [{ id: 'root', component: 'DateTimeInput', label: 'x' }],
      [{ id: 'root', component: 'Video' }],
      [{ id: 'root', component: 'AudioPlayer', url: 'x', autoplay: true }],
    ]
    for (const components of batches) {
      const result = await call(ctx, [{
        version: '1.0',
        createSurface: {
          surfaceId: 'badKitchenSink',
          catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
          components,
        },
      }])
      expect(result.isError).toBe(true)
    }
  })

  it('admits the closed dsh_theme surface tokens and rejects anything else', async () => {
    const ctx = await setup()
    const build = (metadata: unknown) => ({
      version: '1.0',
      createSurface: {
        surfaceId: 'themed',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        components: [{ id: 'root', component: 'Text', text: 'themed' }],
        metadata,
      },
    })

    const admitted = await call(ctx, [build({
      extensions: { dsh_theme: { tone: 'danger', density: 'compact', textScale: 'lg' } },
    })])
    expect(admitted).toMatchObject({ isError: false })

    const batches = [
      { extensions: { dsh_theme: { tone: 'chartreuse' } } },
      { extensions: { dsh_theme: { color: '#ff0000' } } },
      { extensions: { other_theme: { tone: 'info' } } },
      { unknown: true },
    ]
    for (const metadata of batches) {
      expect((await call(ctx, [build(metadata)])).isError).toBe(true)
    }
  })

  it('admits a ChildList template that renders one component per data entry', async () => {
    const ctx = await setup()
    const result = await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'templated',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        dataModel: { rows: [{ label: '第一行' }, { label: '第二行' }] },
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          { id: 'body', component: 'Column', children: { componentId: 'row', path: '/rows' } },
          { id: 'row', component: 'Text', text: { '@path': 'label' } },
        ],
      },
    }])
    expect(result).toMatchObject({ isError: false })
  })

  it('rejects a ChildList template with an unknown component or extra fields', async () => {
    const ctx = await setup()
    const build = (children: unknown) => ({
      version: '1.0',
      createSurface: {
        surfaceId: 'badTemplate',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          { id: 'body', component: 'Column', children },
        ],
      },
    })
    const batches = [
      { componentId: 'missingRow', path: '/rows' },
      { componentId: 'body', path: '/rows', extra: true },
      { componentId: 'body', path: '' },
    ]
    for (const children of batches) {
      expect((await call(ctx, [build(children)])).isError).toBe(true)
    }
  })

  it('rejects an absolute binding inside a ChildList template', async () => {
    const ctx = await setup()
    const result = await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'absoluteTemplate',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        dataModel: { rows: [{ label: '第一行' }] },
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          { id: 'body', component: 'Column', children: { componentId: 'row', path: '/rows' } },
          { id: 'row', component: 'Text', text: { '@path': '/label' } },
        ],
      },
    }])
    expect(result.isError).toBe(true)
    expect(resultText(result)).toContain('relative to the item')
  })

  it('admits relative bindings nested in a template array field', async () => {
    const ctx = await setup()
    const result = await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'relativeNestedTemplate',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        dataModel: { rows: [{ title: '第一页' }] },
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          { id: 'body', component: 'Column', children: { componentId: 'rowTabs', path: '/rows' } },
          {
            id: 'rowTabs', component: 'Tabs',
            tabs: [{ title: { '@path': 'title' }, child: 'pane' }],
          },
          { id: 'pane', component: 'Text', text: '内容' },
        ],
      },
    }])
    expect(result).toMatchObject({ isError: false })
  })

  it('rejects an absolute binding nested in a template array field', async () => {
    const ctx = await setup()
    const result = await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'nestedTemplate',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        dataModel: { rows: [{ title: '第一页' }] },
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          { id: 'body', component: 'Column', children: { componentId: 'rowTabs', path: '/rows' } },
          {
            id: 'rowTabs', component: 'Tabs',
            tabs: [{ title: { '@path': '/title' }, child: 'pane' }],
          },
          { id: 'pane', component: 'Text', text: '内容' },
        ],
      },
    }])
    expect(result.isError).toBe(true)
    expect(resultText(result)).toContain('relative to the item')
  })

  it('records approval-gated action names in the tool metadata', async () => {
    const build = (name: string) => ({
      version: '1.0',
      createSurface: {
        surfaceId: 'guarded',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        components: [
          { id: 'root', component: 'Card', child: 'btn' },
          { id: 'btn', component: 'Button', child: 'label', action: { event: { name } } },
          { id: 'label', component: 'Text', text: 'Go' },
        ],
      },
    })

    const guarded = await setup({ approvalActions: ['submitForm'] })
    const matched = await call(guarded, [build('submitForm')])
    expect(matched).toMatchObject({ isError: false, meta: { approval: ['submitForm'] } })

    const unmatched = await call(guarded, [build('goNext')])
    expect(unmatched).toMatchObject({ isError: false })
    expect((unmatched as { meta?: unknown }).meta).not.toMatchObject({ approval: ['goNext'] })

    const plain = await setup()
    const none = await call(plain, [build('submitForm')])
    expect((none as { meta?: { approval?: unknown } }).meta?.approval).toBeUndefined()
  })

  it('admits catalog check rules on a checkable component', async () => {
    const ctx = await setup()
    const result = await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'checkedForm',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        dataModel: { form: { name: '', email: '' } },
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          { id: 'body', component: 'Column', children: ['nameField', 'emailField', 'submit'] },
          {
            id: 'nameField', component: 'TextField', label: '姓名',
            value: { '@path': '/form/name' },
            checks: [
              { condition: { '@call': 'required', args: { value: { '@path': '/form/name' } } }, message: '姓名必填' },
              {
                condition: {
                  '@call': 'and',
                  args: {
                    values: [
                      { '@call': 'length', args: { value: { '@path': '/form/name' }, min: 2, max: 20 } },
                      { '@call': 'not', args: { value: { '@call': 'required', args: { value: '' } } } },
                    ],
                  },
                },
                message: '姓名长度需在 2 到 20 之间',
              },
            ],
          },
          {
            id: 'emailField', component: 'TextField', label: '邮箱',
            value: { '@path': '/form/email' },
            checks: [{ condition: { '@call': 'email', args: { value: { '@path': '/form/email' } } } }],
          },
          {
            id: 'submit', component: 'Button', child: 'submitLabel',
            action: { event: { name: 'submitForm' } },
          },
          { id: 'submitLabel', component: 'Text', text: '提交' },
        ],
      },
    }])
    expect(result).toMatchObject({ isError: false })
  })

  it('rejects checks outside the catalog function set or its regex dialect', async () => {
    const ctx = await setup()
    const build = (checks: unknown) => ({
      version: '1.0',
      createSurface: {
        surfaceId: 'badChecks',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        components: [
          { id: 'root', component: 'TextField', label: 'x', value: '', checks },
        ],
      },
    })
    const batches = [
      [{ condition: { '@call': 'fetch', args: { url: 'https://example.com' } } }],
      [{ condition: { '@call': 'regex', args: { value: 'x', pattern: '(?<=x)y' } } }],
      [{ condition: { '@call': 'regex', args: { value: 'x', pattern: '\\p{L}' } } }],
      [{ condition: { '@call': 'required', args: { value: 'x', extra: true } } }],
      [{ condition: { '@call': 'required' } }],
      [],
    ]
    for (const checks of batches) {
      expect((await call(ctx, [build(checks)])).isError).toBe(true)
    }
  })

  it('evicts the oldest remembered surface beyond the per-Session bound', async () => {
    const ctx = await setup({ allowIncremental: true })
    const agent = { session: {} }
    const surface = (index: number) => ({
      version: '1.0',
      createSurface: {
        surfaceId: `bound-${String(index)}`,
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        components: [{ id: 'root', component: 'Text', text: String(index) }],
      },
    })

    for (let index = 1; index <= 33; index += 1) {
      expect((await call(ctx, [surface(index)], agent)).isError).toBe(false)
    }

    const newest = await call(ctx, [
      { version: '1.0', updateDataModel: { surfaceId: 'bound-33', path: '/x', value: 1 } },
    ], agent)
    expect(newest.isError).toBe(false)

    const oldest = await call(ctx, [
      { version: '1.0', updateDataModel: { surfaceId: 'bound-1', path: '/x', value: 1 } },
    ], agent)
    expect(oldest.isError).toBe(true)
  })

  it('rejects an incremental message that names a surface without any Session', async () => {
    const ctx = await setup()
    const result = await call(ctx, [
      { version: '1.0', updateDataModel: { surfaceId: 'unknown', path: '/x', value: 1 } },
    ])
    expect(result.isError).toBe(true)
  })

  it('composes a complete successor Surface for incremental messages', async () => {
    const ctx = await setup({ allowIncremental: true })
    const agent = { session: {} }
    const created = await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'composed',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        dataModel: { form: { name: '旧' } },
        metadata: { extensions: { dsh_theme: { tone: 'info' } } },
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          { id: 'body', component: 'Column', children: ['head'] },
          { id: 'head', component: 'Text', text: '版本 1' },
        ],
      },
    }], agent)
    expect(created.isError).toBe(false)

    const updated = await call(ctx, [
      { version: '1.0', updateComponents: { surfaceId: 'composed', components: [{ id: 'head', component: 'Text', text: '版本 2' }] } },
      { version: '1.0', updateDataModel: { surfaceId: 'composed', path: '/form/name', value: '新' } },
    ], agent)

    expect(updated.isError).toBe(false)
    const messages = toolMessages(updated)
    expect(messages).toHaveLength(1)
    const surface = messages[0]?.createSurface
    expect(surface?.components.find(component => component.id === 'head')?.text).toBe('版本 2')
    expect(surface?.dataModel?.form?.name).toBe('新')
    expect(surface?.metadata).toMatchObject({ extensions: { dsh_theme: { tone: 'info' } } })
  })

  it('leaves a component list without a root untouched when pruning', () => {
    const entries: unknown[] = [
      'not-a-component',
      { component: 'Text', text: 'id-less' },
      { id: 'a', component: 'Tabs', tabs: ['not-a-tab', { title: 'no-child' }] },
    ]
    expect(keepReachableFromRoot(entries)).toEqual(entries)
    const oddTabs = [{ id: 'root', component: 'Tabs', tabs: ['not-a-tab', { title: 'no-child' }] }]
    expect(keepReachableFromRoot(oddTabs)).toEqual(oddTabs)
  })

  it('drops components the composed Surface no longer reaches', async () => {
    const ctx = await setup({ allowIncremental: true })
    const agent = { session: {} }
    await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'pruned',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          { id: 'body', component: 'Column', children: ['first'] },
          { id: 'first', component: 'Text', text: '第一' },
        ],
      },
    }], agent)

    const updated = await call(ctx, [
      {
        version: '1.0',
        updateComponents: {
          surfaceId: 'pruned',
          components: [
            { id: 'body', component: 'Column', children: ['second'] },
            { id: 'second', component: 'Text', text: '第二' },
          ],
        },
      },
    ], agent)

    const surface = toolMessages(updated)[0]?.createSurface
    expect(surface?.components.map(component => component.id)).toEqual(['root', 'body', 'second'])
  })

  it('keeps modal and tab children reachable when composing', async () => {
    const ctx = await setup({ allowIncremental: true })
    const agent = { session: {} }
    await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'branches',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          { id: 'body', component: 'Column', children: ['tabs', 'modal'] },
          {
            id: 'tabs', component: 'Tabs',
            tabs: [{ title: 'A', child: 'paneA' }, { title: 'B', child: 'paneB' }],
          },
          { id: 'paneA', component: 'Text', text: 'A' },
          { id: 'paneB', component: 'Text', text: 'B' },
          { id: 'modal', component: 'Modal', trigger: 'openText', content: 'modalText' },
          { id: 'openText', component: 'Text', text: '打开' },
          { id: 'modalText', component: 'Text', text: '内容' },
        ],
      },
    }], agent)

    const updated = await call(ctx, [
      { version: '1.0', updateComponents: { surfaceId: 'branches', components: [{ id: 'paneB', component: 'Text', text: 'B2' }] } },
    ], agent)

    const ids = toolMessages(updated)[0]?.createSurface?.components.map(component => component.id) ?? []
    expect(ids).toEqual(['root', 'body', 'tabs', 'paneA', 'paneB', 'modal', 'openText', 'modalText'])
  })

  it('composes one Surface when a call creates and then updates it', async () => {
    const ctx = await setup({ allowIncremental: true })
    const agent = { session: {} }
    const result = await call(ctx, [
      {
        version: '1.0',
        createSurface: {
          surfaceId: 'inline',
          catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
          components: [
            { id: 'root', component: 'Card', child: 'body' },
            { id: 'body', component: 'Column', children: ['head'] },
            { id: 'head', component: 'Text', text: '第一版' },
          ],
        },
      },
      { version: '1.0', updateComponents: { surfaceId: 'inline', components: [{ id: 'head', component: 'Text', text: '第二版' }] } },
    ], agent)

    const messages = toolMessages(result)
    expect(messages).toHaveLength(1)
    expect(messages[0]?.createSurface?.components.find(component => component.id === 'head')?.text).toBe('第二版')
  })

  it('composes root and nested data-model updates', async () => {
    const ctx = await setup({ allowIncremental: true })
    const agent = { session: {} }
    await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'modeled',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        dataModel: { form: 'scalar' },
        components: [{ id: 'root', component: 'Text', text: 'x' }],
      },
    }], agent)

    const replaced = await call(ctx, [
      { version: '1.0', updateDataModel: { surfaceId: 'modeled', path: '', value: { rows: [1, 2] } } },
      { version: '1.0', updateDataModel: { surfaceId: 'modeled', path: '/nested/deep/value', value: 7 } },
    ], agent)

    const messages = toolMessages(replaced)
    const model = messages[0]?.createSurface?.dataModel as
      { rows?: number[]; nested?: { deep?: { value?: number } } } | undefined
    expect(model?.rows).toEqual([1, 2])
    expect(model?.nested?.deep?.value).toBe(7)
  })

  it('composes a deletion and forgets the Surface', async () => {
    const ctx = await setup({ allowIncremental: true })
    const agent = { session: {} }
    await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'gone',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        components: [{ id: 'root', component: 'Text', text: 'x' }],
      },
    }], agent)

    const deleted = await call(ctx, [{ version: '1.0', deleteSurface: { surfaceId: 'gone' } }], agent)
    expect(deleted).toMatchObject({ isError: false })
    const messages = toolMessages(deleted)
    expect(messages[0]?.deleteSurface).toEqual({ surfaceId: 'gone' })

    const after = await call(ctx, [
      { version: '1.0', updateComponents: { surfaceId: 'gone', components: [{ id: 'root', component: 'Text', text: 'y' }] } },
    ], agent)
    expect(after.isError).toBe(true)
  })

  it('rejects a cross-call incremental message unless the deployment opts in', async () => {
    const ctx = await setup()
    const agent = { session: {} }
    const created = await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'defaultIncremental',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        components: [{ id: 'root', component: 'Text', text: 'v1' }],
      },
    }], agent)
    expect(created.isError).toBe(false)

    const update = await call(ctx, [
      { version: '1.0', updateDataModel: { surfaceId: 'defaultIncremental', path: '/x', value: 1 } },
    ], agent)
    expect(update.isError).toBe(true)
    expect(resultText(update)).toContain('send a complete createSurface instead')
  })

  it('admits incremental messages for a surface this session created earlier', async () => {
    const ctx = await setup({ allowIncremental: true })
    const agent = { session: {} }
    const created = await call(ctx, [{
      version: '1.0',
      createSurface: {
        surfaceId: 'incremental',
        catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          { id: 'body', component: 'Column', children: ['head'] },
          { id: 'head', component: 'Text', text: '版本 1' },
        ],
      },
    }], agent)
    expect(created.isError).toBe(false)

    const updated = await call(ctx, [
      { version: '1.0', updateComponents: { surfaceId: 'incremental', components: [{ id: 'head', component: 'Text', text: '版本 2' }] } },
      { version: '1.0', updateDataModel: { surfaceId: 'incremental', path: '/status', value: 'ready' } },
    ], agent)
    expect(updated).toMatchObject({ isError: false })

    const withoutSession = await call(ctx, [
      { version: '1.0', updateComponents: { surfaceId: 'incremental', components: [{ id: 'head', component: 'Text', text: '版本 3' }] } },
    ])
    expect(withoutSession.isError).toBe(true)

    const deleted = await call(ctx, [{ version: '1.0', deleteSurface: { surfaceId: 'incremental' } }], agent)
    expect(deleted.isError).toBe(false)
    const afterDelete = await call(ctx, [
      { version: '1.0', updateDataModel: { surfaceId: 'incremental', path: '/status', value: 'gone' } },
    ], agent)
    expect(afterDelete.isError).toBe(true)
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
