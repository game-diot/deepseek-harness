/** Runtime validation for the admitted A2UI v1 Basic Catalog subset. */

import { z } from 'zod'
import { isJsonValue, snapshotJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'
import {
  A2UI_BASIC_CATALOG_ID, A2UI_META_PROTOCOL,
} from './types.ts'

const binding = z.strictObject({ '@path': z.string() })
// The catalog admits any string id; bound the length and reject control characters.
const componentId = z.string().min(1).max(64).regex(/^[^\p{Cc}]+$/u)
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
const weight = z.number()
const align = z.enum(['start', 'center', 'end', 'stretch'])
const justify = z.enum(['start', 'center', 'end', 'spaceBetween', 'spaceAround', 'spaceEvenly', 'stretch'])
const component = z.discriminatedUnion('component', [
  z.strictObject({ id: componentId, component: z.literal('Card'), child: componentId, weight: weight.optional() }),
  z.strictObject({
    id: componentId,
    component: z.literal('Column'),
    children: z.array(componentId),
    justify: justify.optional(),
    align: align.optional(),
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('Row'),
    children: z.array(componentId),
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
    variant: z.enum(['icon', 'avatar', 'smallFeature', 'mediumFeature', 'largeFeature', 'hero']).optional(),
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
    label: dynamicString,
    value: dynamicString,
    placeholder: dynamicString.optional(),
    variant: z.enum(['longText', 'number', 'shortText', 'obscured']).optional(),
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('CheckBox'),
    label: dynamicString,
    value: dynamicBoolean,
    weight: weight.optional(),
  }),
  z.strictObject({
    id: componentId,
    component: z.literal('ChoicePicker'),
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
    label: dynamicString.optional(),
    min: z.number().optional(),
    max: z.number(),
    value: dynamicNumber,
    steps: z.number().int().min(1).optional(),
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
    child: componentId,
    variant: z.enum(['default', 'primary', 'borderless']).optional(),
    action: z.strictObject({ event }),
    weight: weight.optional(),
  }),
])
const createSurfaceMessage = z.strictObject({
  version: z.literal('1.0'),
  createSurface: z.strictObject({
    surfaceId: componentId,
    catalogId: z.literal(A2UI_BASIC_CATALOG_ID),
    components: z.array(component).min(1),
    dataModel: z.record(z.string(), z.json()).optional(),
  }),
})
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

function referencedIds(value: ParsedComponent): readonly string[] {
  switch (value.component) {
    case 'Card': return [value.child]
    case 'Column': return value.children
    case 'Row': return value.children
    case 'Button': return [value.child]
    case 'Divider': return []
    case 'Icon': return []
    case 'Image': return []
    case 'TextField': return []
    case 'CheckBox': return []
    case 'ChoicePicker': return []
    case 'Slider': return []
    case 'Text': return []
  }
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
}

function componentMap(surfaceId: string, components: readonly ParsedComponent[]): Map<string, ParsedComponent> {
  const result = new Map<string, ParsedComponent>()
  for (const item of components) {
    if (result.has(item.id)) throw new Error(`surface "${surfaceId}" declares duplicate component id "${item.id}"`)
    result.set(item.id, item)
  }
  return result
}

function validateComponentGraph(value: ParsedEnvelope): void {
  const surfaces = new Map<string, Map<string, ParsedComponent>>()
  for (const messageValue of value.messages) {
    if ('createSurface' in messageValue) {
      const { surfaceId, components } = messageValue.createSurface
      if (surfaces.has(surfaceId)) throw new Error(`createSurface duplicates surface "${surfaceId}"`)
      const graph = componentMap(surfaceId, components)
      validateSurfaceGraph(surfaceId, graph)
      surfaces.set(surfaceId, graph)
    } else if ('updateComponents' in messageValue) {
      const { surfaceId, components } = messageValue.updateComponents
      const graph = surfaces.get(surfaceId)
      if (graph === undefined) throw new Error(`updateComponents references unknown surface "${surfaceId}"`)
      const updates = componentMap(surfaceId, components)
      for (const [id, item] of updates) graph.set(id, item)
      validateSurfaceGraph(surfaceId, graph)
    } else if ('deleteSurface' in messageValue) {
      surfaces.delete(messageValue.deleteSurface.surfaceId)
    } else if ('updateDataModel' in messageValue && !surfaces.has(messageValue.updateDataModel.surfaceId)) {
      throw new Error(`updateDataModel references unknown surface "${messageValue.updateDataModel.surfaceId}"`)
    }
  }
}

/**
 * Validate and detach model-authored A2UI messages.
 * @param messages - untrusted messages admitted by the tool argument schema.
 * @returns the canonical envelope and its validated component count.
 * @throws a ZodError when a message or component is outside the admitted subset.
 */
export function parseA2uiEnvelope(messages: unknown): {
  envelope: { protocol: string; messages: JsonValue[] }
  componentCount: number
} {
  const value = envelope.parse({ protocol: A2UI_META_PROTOCOL, messages })
  validateComponentGraph(value)
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
