// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageProcessor, STRICT_VALIDATION, type ProcessableMessagePayload } from '@a2ui/web_core/v1_0'
import { basicCatalog } from '@a2ui/web_core/catalogs/basic/v1'
import { catalogs, TASK_CATALOG_ID, taskCatalog } from '../src/client/catalogs.ts'
import { ActionButtonView } from '../src/client/business-components.tsx'

afterEach(cleanup)

const basicCatalogId = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json'

const board = (catalogId: string, components: unknown[]) => ({
  version: '1.0' as const,
  createSurface: { surfaceId: 'board', catalogId, components },
})

const components = [
  { id: 'root', component: 'Column', children: ['card', 'stat'] },
  { id: 'card', component: 'TaskCard', title: 'Q4 复盘', owner: '林嘉怡', priority: 'high', status: 'doing', child: 'actions' },
  { id: 'actions', component: 'Row', children: ['badge', 'done'] },
  { id: 'badge', component: 'StatusBadge', label: '进行中', tone: 'info' },
  { id: 'done', component: 'Button', child: 'doneLabel', action: { event: { name: 'completeTask' } } },
  { id: 'doneLabel', component: 'Text', text: '完成' },
  { id: 'stat', component: 'Statistic', label: '任务', value: '4', trend: { direction: 'up', text: '2' } },
]

describe('contract: the business catalog renders beside the Basic Catalog', () => {
  it('admits the business components only through its own catalog', () => {
    expect(taskCatalog.id).toBe(TASK_CATALOG_ID)
    expect(taskCatalog.components.has('TaskCard')).toBe(true)
    expect(taskCatalog.components.has('StatusBadge')).toBe(true)
    expect(taskCatalog.components.has('Statistic')).toBe(true)
    expect(taskCatalog.components.has('ActionButton')).toBe(true)
    expect(basicCatalog.components.has('Card')).toBe(true)
    expect(basicCatalog.components.has('TaskCard')).toBe(false)
    expect(catalogs).toHaveLength(2)
  })

  it('processes a Surface that mixes both sets under the business catalog', () => {
    const processor = new MessageProcessor(catalogs as never, () => { /* no actions */ }, { validationConfig: STRICT_VALIDATION })
    expect(() => {
      processor.processMessages([board(TASK_CATALOG_ID, components)] as ProcessableMessagePayload)
    }).not.toThrow()
    expect(processor.getSurface('board')).toBeDefined()
    processor.dispose()
  })

  it('updates the data model locally or dispatches one Agent event', () => {
    const set = vi.fn()
    const dispatchAction = vi.fn(() => Promise.resolve())
    const context = { dataContext: { set }, dispatchAction }

    const local = render(<ActionButtonView props={{
      label: '展开', variant: 'default', action: { kind: 'local', operation: 'set', path: '/expanded', value: true },
    }} context={context as never} />)
    fireEvent.click(local.getByRole('button', { name: '展开' }))
    expect(set).toHaveBeenCalledWith('/expanded', true)
    expect(dispatchAction).not.toHaveBeenCalled()
    local.unmount()

    const toggleContext = {
      dataContext: { set, resolveDynamicValue: vi.fn(() => true) }, dispatchAction,
    }
    const toggle = render(<ActionButtonView props={{
      label: '切换', variant: 'default', action: { kind: 'local', operation: 'toggle', path: '/expanded' },
    }} context={toggleContext as never} />)
    fireEvent.click(toggle.getByRole('button', { name: '切换' }))
    expect(set).toHaveBeenCalledWith('/expanded', false)
    expect(dispatchAction).not.toHaveBeenCalled()
    toggle.unmount()

    const agent = render(<ActionButtonView props={{
      label: '完成', variant: 'primary', action: { kind: 'agent', name: 'completeTask', context: { taskId: 'T-1' } },
    }} context={context as never} />)
    fireEvent.click(agent.getByRole('button', { name: '完成' }))
    expect(dispatchAction).toHaveBeenCalledWith({ event: { name: 'completeTask', context: { taskId: 'T-1' } } })
  })

  it('refuses the business components under the Basic Catalog identifier', () => {
    const processor = new MessageProcessor(catalogs as never, () => { /* no actions */ }, { validationConfig: STRICT_VALIDATION })
    expect(() => {
      processor.processMessages([board(basicCatalogId, [
        { id: 'root', component: 'TaskCard', title: 'no' },
      ])] as ProcessableMessagePayload)
    }).toThrow()
    processor.dispose()
  })
})
