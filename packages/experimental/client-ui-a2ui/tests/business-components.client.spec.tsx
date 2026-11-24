// @vitest-environment jsdom
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MessageProcessor, STRICT_VALIDATION, type ProcessableMessagePayload } from '@a2ui/web_core/v1_0'
import { basicCatalog } from '@a2ui/web_core/catalogs/basic/v1'
import { catalogs, TASK_CATALOG_ID, taskCatalog } from '../src/client/catalogs.ts'

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
