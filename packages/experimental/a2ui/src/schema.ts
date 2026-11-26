/** Runtime validation for the admitted A2UI v1 Basic Catalog subset. */

import { z } from 'zod'
import { isJsonValue, snapshotJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'
import {
  A2UI_BASIC_CATALOG_ID, A2UI_META_PROTOCOL, A2UI_TASK_CATALOG_ID,
} from './types.ts'

const binding = z.strictObject({ '@path': z.string() })
// The catalog admits any string id; bound the length and reject control characters.
const componentId = z.string().min(1).max(64).regex(/^[^\p{Cc}]+$/u)

/**
 * Catalog `ChildList`: static child ids, or a template component rendered once per
 * data-model entry at `path`.
 */
const childList = z.union([
  z.array(componentId),
  z.strictObject({ componentId, path: z.string().min(1) }),
])
const literalObject = z.record(z.string(), z.json()).refine(value => (
  Object.keys(value).every(key => !/^@(?:[^@]|$)/u.test(key))
))
const dynamicValue = z.union([
  z.string(), z.number(), z.boolean(), z.array(z.json()), literalObject, binding,
])
const event = z.strictObject({
  name: componentId,
  userMessage: z.string().optional(),
  context: z.record(z.string(), dynamicValue).optional(),
})
const dynamicString = z.union([z.string(), binding])
const dynamicBoolean = z.union([z.boolean(), binding])
const dynamicNumber = z.union([z.number(), binding])
const dynamicStringList = z.union([z.array(z.string()), binding])
/** The catalog's regex dialect forbids backreferences, lookarounds, named groups, and Unicode properties. */
const regexPattern = z.string().min(1).max(256).refine(
  pattern => !/\\[1-9]|\(\?(?:[=!]|<[=!]|<[^=!])|\\p\{/u.test(pattern),
  { message: 'the catalog regex dialect forbids backreferences, lookarounds, named groups, and Unicode property escapes' },
)

const checkExpression = z.lazy((): z.ZodType => z.union([
  z.strictObject({ '@call': z.literal('required'), args: z.strictObject({ value: z.json() }) }),
  z.strictObject({
    '@call': z.literal('regex'),
    args: z.strictObject({ value: dynamicString, pattern: regexPattern }),
  }),
  z.strictObject({
    '@call': z.literal('length'),
    args: z.strictObject({
      value: dynamicString,
      min: z.number().int().min(0).optional(),
      max: z.number().int().min(0).optional(),
    }),
  }),
  z.strictObject({
    '@call': z.literal('numeric'),
    args: z.strictObject({
      value: dynamicNumber,
      min: z.number().optional(),
      max: z.number().optional(),
    }),
  }),
  z.strictObject({ '@call': z.literal('email'), args: z.strictObject({ value: dynamicString }) }),
  z.strictObject({
    '@call': z.literal('and'),
    args: z.strictObject({ values: z.array(dynamicCheckValue).min(2) }),
  }),
  z.strictObject({
    '@call': z.literal('or'),
    args: z.strictObject({ values: z.array(dynamicCheckValue).min(2) }),
  }),
  z.strictObject({ '@call': z.literal('not'), args: z.strictObject({ value: dynamicCheckValue }) }),
]))
const dynamicCheckValue = z.lazy((): z.ZodType => z.union([z.boolean(), binding, checkExpression]))
const checks = z.array(z.strictObject({
  condition: z.union([binding, checkExpression]),
  message: z.string().min(1).max(200).optional(),
})).min(1).max(8).optional()

/** Tones shared by the theme extension and the business components. */
const SURFACE_TONE = ['neutral', 'info', 'success', 'warning', 'danger'] as const

const weight = z.number()
const align = z.enum(['start', 'center', 'end', 'stretch'])
const justify = z.enum(['start', 'center', 'end', 'spaceBetween', 'spaceAround', 'spaceEvenly', 'stretch'])
const component = z.discriminatedUnion('component', [
  z.strictObject({ id: componentId, component: z.literal('Card'), child: componentId, weight: weight.optional() }),
  z.strictObject({
    id: componentId,
    component: z.literal('Column'),
    children: childList,
    justify: justify.optional(),
    align: align.optional(),
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('Row'),
    children: childList,
    justify: justify.optional(),
    align: align.optional(),
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('Divider'),
    axis: z.enum(['horizontal', 'vertical']).optional(),
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('Image'),
    url: dynamicString,
    description: dynamicString.optional(),
    fit: z.enum(['contain', 'cover', 'fill', 'none', 'scaleDown']).optional(),
    variant: z.enum(['icon', 'avatar', 'smallFeature', 'mediumFeature', 'largeFeature', 'header']).optional(),
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('Icon'),
    name: z.string().regex(/^[\p{ID_Start}][\p{ID_Continue}]*$/u),
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('TextField'),
    checks,
    label: dynamicString,
    value: dynamicString,
    placeholder: dynamicString.optional(),
    variant: z.enum(['longText', 'number', 'shortText', 'obscured']).optional(),
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('CheckBox'),
    checks,
    label: dynamicString,
    value: dynamicBoolean,
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('ChoicePicker'),
    checks,
    label: dynamicString,
    options: z.array(z.strictObject({ label: dynamicString, value: z.string() })).min(1),
    value: dynamicStringList,
    variant: z.enum(['multipleSelection', 'mutuallyExclusive']).optional(),
    displayStyle: z.enum(['checkbox', 'chips']).optional(),
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('Slider'),
    checks,
    label: dynamicString.optional(),
    min: z.number().optional(),
    max: z.number(),
    value: dynamicNumber,
    steps: z.number().int().min(1).optional(),
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('List'),
    children: childList,
    direction: z.enum(['vertical', 'horizontal']).optional(),
    align: align.optional(),
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('Tabs'),
    tabs: z.array(z.strictObject({ title: dynamicString, child: componentId })).min(1),
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('Modal'),
    trigger: componentId,
    content: componentId,
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('DateTimeInput'),
    checks,
    value: dynamicString,
    label: dynamicString.optional(),
    enableDate: z.boolean().optional(),
    enableTime: z.boolean().optional(),
    min: dynamicString.optional(),
    max: dynamicString.optional(),
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('Video'),
    url: dynamicString,
    posterUrl: dynamicString.optional(),
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('AudioPlayer'),
    url: dynamicString,
    description: dynamicString.optional(),
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('Text'),
    text: dynamicString,
    variant: z.enum(['body', 'caption']).optional(),
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('Button'),
    checks,
    child: componentId,
    variant: z.enum(['default', 'primary', 'borderless']).optional(),
    action: z.strictObject({ event }),
    weight: weight.optional(),
  }),
  // Business components of A2UI_TASK_CATALOG_ID.
  z.strictObject({
    id: componentId,
    component: z.literal('ActionButton'),
    label: dynamicString,
    variant: z.enum(['default', 'primary', 'danger', 'borderless']).optional(),
    action: z.union([
      z.strictObject({
        kind: z.literal('local'),
        operation: z.literal('set'),
        path: z.string().min(1).max(256),
        value: z.json(),
      }),
      z.strictObject({
        kind: z.literal('local'),
        operation: z.literal('toggle'),
        path: z.string().min(1).max(256),
      }),
      z.strictObject({
        kind: z.literal('agent'),
        name: z.string().min(1).max(128),
        context: literalObject.optional(),
      }),
    ]),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('Progress'),
    label: dynamicString,
    value: dynamicNumber.optional(),
    max: dynamicNumber.optional(),
    tone: z.enum(SURFACE_TONE).optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('Chart'),
    type: z.enum(['bar', 'line', 'pie']),
    title: z.string().min(1).max(200),
    categories: z.array(z.string().min(1).max(40)).max(12),
    series: z.array(z.strictObject({
      name: z.string().min(1).max(60),
      values: z.array(z.number().min(0)).max(12),
    })).max(4),
    emptyText: z.string().min(1).max(200),
    interaction: z.strictObject({
      label: z.string().min(1).max(100),
      action: z.strictObject({ name: z.string().min(1).max(128) }),
    }).optional(),
  }).superRefine((value, ctx) => {
    if ((value.categories.length === 0) !== (value.series.length === 0)) {
      ctx.addIssue({ code: 'custom', message: 'empty Chart categories and series must be empty together', path: ['series'] })
    }
    const categories = new Set<string>()
    for (const [index, category] of value.categories.entries()) {
      if (categories.has(category)) ctx.addIssue({ code: 'custom', message: `duplicate Chart category "${category}"`, path: ['categories', index] })
      categories.add(category)
    }
    const seriesNames = new Set<string>()
    for (const [index, item] of value.series.entries()) {
      if (item.values.length !== value.categories.length) {
        ctx.addIssue({ code: 'custom', message: `Chart series "${item.name}" values must match categories`, path: ['series', index, 'values'] })
      }
      if (seriesNames.has(item.name)) ctx.addIssue({ code: 'custom', message: `duplicate Chart series "${item.name}"`, path: ['series', index, 'name'] })
      seriesNames.add(item.name)
    }
    if (value.type === 'pie' && value.categories.length > 0) {
      const [pieSeries] = value.series
      if (value.categories.length < 2 || value.categories.length > 6) {
        ctx.addIssue({ code: 'custom', message: 'pie Chart requires 2 to 6 categories', path: ['categories'] })
      }
      if (value.series.length !== 1) {
        ctx.addIssue({ code: 'custom', message: 'pie Chart requires exactly one series', path: ['series'] })
      } else if (pieSeries !== undefined && pieSeries.values.reduce((total, item) => total + item, 0) <= 0) {
        ctx.addIssue({ code: 'custom', message: 'pie Chart requires a positive total', path: ['series', 0, 'values'] })
      }
    }
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('DataTable'),
    label: z.string().min(1).max(200),
    columns: z.array(z.strictObject({
      key: componentId,
      label: z.string().min(1).max(100),
      align: z.enum(['start', 'center', 'end']).optional(),
      sortable: z.boolean().optional(),
    })).min(1).max(12),
    rows: z.array(z.strictObject({
      id: componentId,
      cells: z.record(componentId, z.union([z.string(), z.number(), z.boolean(), z.null()])),
    })).max(100),
    emptyText: z.string().min(1).max(200),
    filter: z.strictObject({
      placeholder: z.string().min(1).max(100),
      clearLabel: z.string().min(1).max(100),
    }).optional(),
    selection: z.union([
      z.strictObject({ mode: z.literal('single'), label: z.string().min(1).max(100) }),
      z.strictObject({
        mode: z.literal('multiple'),
        label: z.string().min(1).max(100),
        selectAllLabel: z.string().min(1).max(100),
        actionsLabel: z.string().min(1).max(100).optional(),
        actions: z.array(z.strictObject({
          label: z.string().min(1).max(100),
          name: z.string().min(1).max(128),
          variant: z.enum(['default', 'primary', 'danger', 'borderless']).optional(),
          confirm: z.strictObject({
            prompt: z.string().min(1).max(200),
            confirmLabel: z.string().min(1).max(100),
            cancelLabel: z.string().min(1).max(100),
          }).optional(),
        })).min(1).max(4).optional(),
      }).superRefine((selection, selectionCtx) => {
        if ((selection.actionsLabel === undefined) !== (selection.actions === undefined)) {
          selectionCtx.addIssue({ code: 'custom', message: 'actionsLabel and batch actions must be provided together', path: ['actions'] })
        }
        const names = new Set<string>()
        for (const [index, action] of (selection.actions ?? []).entries()) {
          if (names.has(action.name)) selectionCtx.addIssue({ code: 'custom', message: `duplicate batch action name "${action.name}"`, path: ['actions', index, 'name'] })
          names.add(action.name)
        }
      }),
    ]).optional(),
    actionsLabel: z.string().min(1).max(100).optional(),
    rowActions: z.array(z.strictObject({
      label: z.string().min(1).max(100),
      name: z.string().min(1).max(128),
      variant: z.enum(['default', 'primary', 'danger', 'borderless']).optional(),
      confirm: z.strictObject({
        prompt: z.string().min(1).max(200),
        confirmLabel: z.string().min(1).max(100),
        cancelLabel: z.string().min(1).max(100),
      }).optional(),
    })).min(1).max(4).optional(),
  }).superRefine((value, ctx) => {
    const columnKeys = new Set<string>()
    for (const [index, column] of value.columns.entries()) {
      if (columnKeys.has(column.key)) {
        ctx.addIssue({ code: 'custom', message: `duplicate column key "${column.key}"`, path: ['columns', index, 'key'] })
      }
      columnKeys.add(column.key)
    }
    const rowIds = new Set<string>()
    for (const [index, row] of value.rows.entries()) {
      if (rowIds.has(row.id)) {
        ctx.addIssue({ code: 'custom', message: `duplicate row id "${row.id}"`, path: ['rows', index, 'id'] })
      }
      rowIds.add(row.id)
    }
    if ((value.actionsLabel === undefined) !== (value.rowActions === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'actionsLabel and rowActions must be provided together', path: ['rowActions'] })
    }
    const actionNames = new Set<string>()
    for (const [index, action] of (value.rowActions ?? []).entries()) {
      if (actionNames.has(action.name)) {
        ctx.addIssue({ code: 'custom', message: `duplicate row action name "${action.name}"`, path: ['rowActions', index, 'name'] })
      }
      actionNames.add(action.name)
    }
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('StatusBadge'),
    label: dynamicString,
    tone: z.enum(SURFACE_TONE).optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('Statistic'),
    label: dynamicString,
    value: dynamicString,
    trend: z.strictObject({ direction: z.enum(['up', 'down', 'flat']), text: dynamicString }).optional(),
    tone: z.enum(SURFACE_TONE).optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('Timeline'),
    title: z.string().min(1).max(200),
    items: z.array(z.strictObject({
      id: componentId,
      title: z.string().min(1).max(200),
      description: z.string().min(1).max(1000).optional(),
      summary: z.string().min(1).max(300).optional(),
      details: z.string().min(1).max(3000).optional(),
      expandLabel: z.string().min(1).max(100).optional(),
      collapseLabel: z.string().min(1).max(100).optional(),
      time: z.string().min(1).max(100).optional(),
      tone: z.enum(SURFACE_TONE).optional(),
      action: z.strictObject({
        label: z.string().min(1).max(100),
        name: z.string().min(1).max(128),
        variant: z.enum(['default', 'primary', 'danger', 'borderless']).optional(),
        confirm: z.strictObject({
          prompt: z.string().min(1).max(200),
          confirmLabel: z.string().min(1).max(100),
          cancelLabel: z.string().min(1).max(100),
        }).optional(),
      }).optional(),
    }).superRefine((item, itemCtx) => {
      const detailCount = [item.summary, item.details, item.expandLabel, item.collapseLabel].filter(value => value !== undefined).length
      if (detailCount !== 0 && detailCount !== 4) {
        itemCtx.addIssue({ code: 'custom', message: 'Timeline detail fields must be provided together' })
      }
    })).max(50),
    emptyText: z.string().min(1).max(200),
  }).superRefine((value, ctx) => {
    const ids = new Set<string>()
    for (const [index, item] of value.items.entries()) {
      if (ids.has(item.id)) ctx.addIssue({ code: 'custom', message: `duplicate Timeline item id "${item.id}"`, path: ['items', index, 'id'] })
      ids.add(item.id)
    }
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('TaskCard'),
    title: dynamicString,
    owner: dynamicString.optional(),
    priority: z.enum(['high', 'medium', 'low']).optional(),
    status: z.enum(['todo', 'doing', 'done']).optional(),
    child: componentId.optional(),
    weight: weight.optional(),
  }),
])

/** Component names this renderer adds beside the Basic Catalog. */
const TASK_COMPONENTS = new Set(['ActionButton', 'Chart', 'DataTable', 'Progress', 'StatusBadge', 'Statistic', 'TaskCard', 'Timeline'])
/** Closed token sets for the `dsh_theme` surface extension. */
export const SURFACE_THEME = {
  tone: SURFACE_TONE,
  density: ['compact', 'comfortable', 'spacious'],
  textScale: ['sm', 'md', 'lg'],
} as const

const surfaceTheme = z.strictObject({
  tone: z.enum(SURFACE_THEME.tone).optional(),
  density: z.enum(SURFACE_THEME.density).optional(),
  textScale: z.enum(SURFACE_THEME.textScale).optional(),
})

/**
 * Reject a Surface whose components do not belong to the catalog it names.
 * @param value - one parsed `createSurface` payload.
 * @param ctx - validation context reporting the offending component.
 */
function checkCatalogComponents(
  value: { catalogId: string; components: readonly { component: string; id: string }[] },
  ctx: z.RefinementCtx,
): void {
  if (value.catalogId !== A2UI_BASIC_CATALOG_ID) return
  for (const entry of value.components) {
    if (!TASK_COMPONENTS.has(entry.component)) continue
    ctx.addIssue({
      code: 'custom',
      message: `component "${entry.component}" (${entry.id}) requires catalog ${A2UI_TASK_CATALOG_ID}`,
      path: ['components'],
    })
  }
}

const createSurfaceMessage = z.strictObject({
  version: z.literal('1.0'),
  createSurface: z.strictObject({
    surfaceId: componentId,
    catalogId: z.union([z.literal(A2UI_BASIC_CATALOG_ID), z.literal(A2UI_TASK_CATALOG_ID)]),
    components: z.array(component).min(1),
    dataModel: z.record(z.string(), z.json()).optional(),
    metadata: z.strictObject({
      extensions: z.strictObject({ dsh_theme: surfaceTheme.optional() }).optional(),
    }).optional(),
  }),
}).superRefine((value, ctx) => { checkCatalogComponents(value.createSurface, ctx) })
const message = z.union([
  createSurfaceMessage,
  z.strictObject({
    version: z.literal('1.0'),
    updateComponents: z.strictObject({ surfaceId: componentId, components: z.array(component).min(1) }),
  }),
  z.strictObject({
    version: z.literal('1.0'),
    updateDataModel: z.strictObject({ surfaceId: componentId, path: z.string(), value: z.json() }),
  }),
  z.strictObject({
    version: z.literal('1.0'),
    deleteSurface: z.strictObject({ surfaceId: componentId }),
  }),
])
const envelope = z.strictObject({
  protocol: z.literal(A2UI_META_PROTOCOL),
  messages: z.array(message).min(1),
})

type ParsedEnvelope = z.infer<typeof envelope>
type ParsedComponent = z.infer<typeof component>
type ParsedChildList = z.infer<typeof childList>

function childIds(children: ParsedChildList | undefined): readonly string[] {
  if (children === undefined) return []
  return Array.isArray(children) ? children : [children.componentId]
}

function referencedIds(value: ParsedComponent): readonly string[] {
  switch (value.component) {
    case 'Card': return [value.child]
    case 'Column': return childIds(value.children)
    case 'Row': return childIds(value.children)
    case 'Button': return [value.child]
    case 'ActionButton': return []
    case 'Chart': return []
    case 'DataTable': return []
    case 'Progress': return []
    case 'TaskCard': return value.child === undefined ? [] : [value.child]
    case 'StatusBadge': return []
    case 'Statistic': return []
    case 'Timeline': return []
    case 'Divider': return []
    case 'Icon': return []
    case 'Image': return []
    case 'TextField': return []
    case 'CheckBox': return []
    case 'ChoicePicker': return []
    case 'Slider': return []
    case 'List': return childIds(value.children)
    case 'Tabs': return value.tabs.map(tab => tab.child)
    case 'Modal': return [value.trigger, value.content]
    case 'DateTimeInput': return []
    case 'Video': return []
    case 'AudioPlayer': return []
    case 'Text': return []
  }
}

function collectBindingPaths(value: unknown, visit: (path: string) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) collectBindingPaths(item, visit)
    return
  }
  if (typeof value !== 'object' || value === null) return
  for (const [key, entry] of Object.entries(value)) {
    if (key === '@path' && typeof entry === 'string') {
      visit(entry)
      continue
    }
    collectBindingPaths(entry, visit)
  }
}

/**
 * Reject absolute bindings inside a template: the renderer resolves them against the
 * Surface data model rather than the item, which silently renders empty values.
 */
function assertTemplateBindingsRelative(
  surfaceId: string,
  components: ReadonlyMap<string, ParsedComponent>,
): void {
  const queue: string[] = []
  for (const component of components.values()) {
    if ('children' in component && !Array.isArray(component.children)) queue.push(component.children.componentId)
  }
  while (queue.length > 0) {
    const id = queue.pop()
    /* v8 ignore next -- the loop condition proves an id is present. */
    if (id === undefined) break
    const item = components.get(id)
    /* v8 ignore next -- the traversal above rejects a missing component before this walk. */
    if (item === undefined) continue
    collectBindingPaths(item, (path) => {
      if (path.startsWith('/')) {
        throw new Error(`surface "${surfaceId}" template component "${id}" binds "${path}"; bindings inside a ChildList template are relative to the item`)
      }
    })
    queue.push(...referencedIds(item))
  }
}

/**
 * Drop components that no path reaches from `root`.
 * A composed Surface merges older and newer components, so replaced branches can
 * leave orphans that renderers reject.
 * @param components - the merged component list in insertion order.
 * @returns the reachable components in the original order.
 */
export function keepReachableFromRoot(components: readonly unknown[]): unknown[] {
  const byId = new Map<string, Record<string, unknown>>()
  for (const component of components) {
    if (typeof component !== 'object' || component === null) continue
    const id = (component as Record<string, unknown>).id
    if (typeof id === 'string') byId.set(id, component as Record<string, unknown>)
  }
  if (!byId.has('root')) return [...components]
  const reachable = new Set<string>()
  const queue = ['root']
  while (queue.length > 0) {
    const id = queue.pop()
    /* v8 ignore next -- the loop condition proves an id is present. */
    if (id === undefined || reachable.has(id)) continue
    reachable.add(id)
    const component = byId.get(id)
    /* v8 ignore next -- only ids recorded from this map enter the queue. */
    if (component === undefined) continue
    for (const reference of childIds(component.children as ParsedChildList | undefined)) {
      queue.push(reference)
    }
    for (const key of ['child', 'trigger', 'content'] as const) {
      const value = component[key]
      if (typeof value === 'string') queue.push(value)
    }
    const tabs = component.tabs
    if (Array.isArray(tabs)) {
      for (const tab of tabs) {
        if (typeof tab === 'object' && tab !== null) {
          const child = (tab as { child?: unknown }).child
          if (typeof child === 'string') queue.push(child)
        }
      }
    }
  }
  return components.filter(component => (
    typeof component === 'object' && component !== null
    && typeof (component as { id?: unknown }).id === 'string'
    && reachable.has((component as { id: string }).id)
  ))
}

function validateSurfaceGraph(surfaceId: string, components: ReadonlyMap<string, ParsedComponent>): void {
  if (!components.has('root')) throw new Error(`surface "${surfaceId}" must declare component id "root"`)
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: { id: string; exit: boolean }[] = [{ id: 'root', exit: false }]
  while (stack.length > 0) {
    const frame = stack.pop()
    /* v8 ignore next -- loop entry proves the stack has an item. */
    if (frame === undefined) throw new Error('component traversal stack is empty')
    if (frame.exit) {
      visiting.delete(frame.id)
      visited.add(frame.id)
      continue
    }
    if (visited.has(frame.id)) continue
    if (visiting.has(frame.id)) throw new Error(`surface "${surfaceId}" contains a component cycle at "${frame.id}"`)
    const item = components.get(frame.id)
    if (item === undefined) throw new Error(`surface "${surfaceId}" references missing component "${frame.id}"`)
    visiting.add(frame.id)
    stack.push({ id: frame.id, exit: true })
    for (const reference of referencedIds(item)) stack.push({ id: reference, exit: false })
  }
  if (visited.size !== components.size) {
    const orphan = [...components.keys()].find(id => !visited.has(id))
    /* v8 ignore next -- unequal set sizes prove an unvisited component exists. */
    if (orphan === undefined) throw new Error('unreachable component is missing')
    throw new Error(`surface "${surfaceId}" contains unreachable component "${orphan}"`)
  }
  assertTemplateBindingsRelative(surfaceId, components)
}

function componentMap(surfaceId: string, components: readonly ParsedComponent[]): Map<string, ParsedComponent> {
  const result = new Map<string, ParsedComponent>()
  for (const item of components) {
    if (result.has(item.id)) throw new Error(`surface "${surfaceId}" declares duplicate component id "${item.id}"`)
    result.set(item.id, item)
  }
  return result
}

/**
 * Validate the component graph across the messages of one call.
 * @param value - the parsed envelope.
 * @param known - surfaces this session created in earlier calls; when a message
 *   targets one of them, only its component shapes are checked because this call
 *   holds no graph for that surface.
 */
function validateComponentGraph(value: ParsedEnvelope, known?: Set<string>): void {
  const surfaces = new Map<string, Map<string, ParsedComponent>>()
  for (const messageValue of value.messages) {
    if ('createSurface' in messageValue) {
      const { surfaceId, components } = messageValue.createSurface
      if (surfaces.has(surfaceId)) throw new Error(`createSurface duplicates surface "${surfaceId}"`)
      const graph = componentMap(surfaceId, components)
      validateSurfaceGraph(surfaceId, graph)
      surfaces.set(surfaceId, graph)
      known?.add(surfaceId)
    } else if ('updateComponents' in messageValue) {
      const { surfaceId, components } = messageValue.updateComponents
      const graph = surfaces.get(surfaceId)
      if (graph === undefined) {
        if (known === undefined || !known.has(surfaceId)) {
          throw new Error(`updateComponents references surface "${surfaceId}" that this call does not create; send a complete createSurface instead`)
        }
        componentMap(surfaceId, components)
        continue
      }
      const updates = componentMap(surfaceId, components)
      for (const [id, item] of updates) graph.set(id, item)
      validateSurfaceGraph(surfaceId, graph)
    } else if ('deleteSurface' in messageValue) {
      surfaces.delete(messageValue.deleteSurface.surfaceId)
      known?.delete(messageValue.deleteSurface.surfaceId)
    } else {
      const { surfaceId } = messageValue.updateDataModel
      if (!surfaces.has(surfaceId) && (known === undefined || !known.has(surfaceId))) {
        throw new Error(`updateDataModel references surface "${surfaceId}" that this call does not create; send a complete createSurface instead`)
      }
    }
  }
}

/**
 * Validate and detach model-authored A2UI messages.
 * @param messages - untrusted messages admitted by the tool argument schema.
 * @param known - surfaces this session created in earlier calls; required for
 *   incremental messages whose surface is not created in the same call.
 * @returns the canonical envelope and its validated component count.
 * @throws a ZodError when a message or component is outside the admitted subset.
 */
export function parseA2uiEnvelope(messages: unknown, known?: Set<string>): {
  envelope: { protocol: string; messages: JsonValue[] }
  componentCount: number
} {
  const value = envelope.parse({ protocol: A2UI_META_PROTOCOL, messages })
  validateComponentGraph(value, known)
  const canonical = {
    protocol: value.protocol,
    messages: value.messages.map((messageValue) => {
      const snapshot: unknown = snapshotJsonValue(messageValue)
      /* v8 ignore next -- z.json and strict component schemas admit only lossless JSON. */
      if (!isJsonValue(snapshot)) throw new TypeError('validated A2UI message is not lossless JSON')
      return snapshot as JsonValue
    }),
  }
  const componentCount = value.messages.reduce((total, messageValue) => {
    if ('createSurface' in messageValue) return total + messageValue.createSurface.components.length
    if ('updateComponents' in messageValue) return total + messageValue.updateComponents.components.length
    return total
  }, 0)
  return { envelope: canonical, componentCount }
}
