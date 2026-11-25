/**
 * Standalone AG-UI client example.
 *
 * Speaks AG-UI with `@ag-ui/client` and reads A2UI from the run's state snapshots.
 * It imports nothing from dsh: any AG-UI client plus an A2UI renderer can do this.
 */

import { HttpAgent } from '@ag-ui/client'

const log = document.getElementById('log')
const surfacesEl = document.getElementById('surfaces')
const promptEl = document.getElementById('prompt')

function note(text) {
  const line = document.createElement('div')
  line.textContent = text
  log.append(line)
  log.scrollTop = log.scrollHeight
}

const agent = new HttpAgent({
  agentId: 'standalone-example',
  url: '/ag-ui/run',
  threadId: `standalone-${String(Date.now())}`,
  initialMessages: [],
  initialState: {},
  debug: false,
})

/** Surface id → components from the latest snapshot. */
const surfaces = new Map()

function applyA2ui(payload) {
  for (const message of payload.messages ?? []) {
    if (message.createSurface) {
      surfaces.set(message.createSurface.surfaceId, [...(message.createSurface.components ?? [])])
    } else if (message.updateComponents) {
      const existing = surfaces.get(message.updateComponents.surfaceId) ?? []
      const merged = new Map(existing.map(component => [component.id, component]))
      for (const component of message.updateComponents.components ?? []) merged.set(component.id, component)
      surfaces.set(message.updateComponents.surfaceId, [...merged.values()])
    } else if (message.deleteSurface) {
      surfaces.delete(message.deleteSurface.surfaceId)
    }
  }
  render()
}

const CONTAINERS = new Set(['Card', 'Column', 'Row', 'List'])

function renderComponent(byId, id, depth) {
  const component = byId.get(id)
  if (component === undefined || depth > 8) return null
  if (CONTAINERS.has(component.component)) {
    const box = document.createElement('div')
    box.className = component.component === 'Row' ? 'row' : 'stack'
    const children = Array.isArray(component.children) ? component.children : [component.child]
    for (const child of children) {
      if (typeof child !== 'string') continue
      const rendered = renderComponent(byId, child, depth + 1)
      if (rendered !== null) box.append(rendered)
    }
    return box
  }
  if (typeof component.text === 'string') {
    const el = document.createElement('div')
    el.textContent = component.text
    return el
  }
  return null
}

function render() {
  surfacesEl.textContent = ''
  for (const [surfaceId, components] of surfaces) {
    const byId = new Map(components.map(component => [component.id, component]))
    const rendered = renderComponent(byId, 'root', 0)
    if (rendered === null) continue
    const card = document.createElement('section')
    card.className = 'card'
    const header = document.createElement('header')
    header.textContent = surfaceId
    card.append(header, rendered)
    surfacesEl.append(card)
  }
}

async function submit() {
  const text = promptEl.value.trim()
  if (text === '') return
  promptEl.value = ''
  agent.addMessage({ id: `user-${String(Date.now())}`, role: 'user', content: text })
  try {
    await agent.runAgent({ runId: `run-${String(Date.now())}` }, {
      onEvent({ event }) {
        if (event.type === 'STATE_SNAPSHOT' && event.snapshot && event.snapshot.a2ui) {
          note('snapshot: a2ui')
          applyA2ui(event.snapshot.a2ui)
          return
        }
        // Argument deltas dominate a tool call's stream; one line per event is enough.
        if (event.type !== 'TOOL_CALL_ARGS') note(event.type)
      },
    })
    note('run finished')
  } catch (error) {
    note(`run failed: ${String(error)}`)
  }
}

document.getElementById('send').addEventListener('click', () => { void submit() })
note('ready: @ag-ui/client only — no dsh imports')
