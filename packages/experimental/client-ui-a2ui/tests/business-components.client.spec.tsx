// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageProcessor, STRICT_VALIDATION, type ProcessableMessagePayload } from '@a2ui/web_core/v1_0'
import { basicCatalog } from '@a2ui/web_core/catalogs/basic/v1'
import { catalogs, TASK_CATALOG_ID, taskCatalog } from '../src/client/catalogs.ts'
import { ActionButtonView, BarChartView, DataTableView, LineChartView, PieChartView, ProgressView, TimelineView } from '../src/client/business-components.tsx'

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
    expect(taskCatalog.components.has('Progress')).toBe(true)
    expect(taskCatalog.components.has('DataTable')).toBe(true)
    expect(taskCatalog.components.has('Chart')).toBe(true)
    expect(taskCatalog.components.has('Timeline')).toBe(true)
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

  it('renders bounded determinate and accessible indeterminate progress', () => {
    const done = render(<ProgressView label="导入任务" value={125} max={100} tone="success" />)
    const bar = done.getByRole('progressbar', { name: '导入任务' })
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
    expect(bar.getAttribute('aria-valuetext')).toBe('100%')
    expect(done.getByText('100%')).toBeTruthy()
    done.unmount()

    const pending = render(<ProgressView label="分析中" tone="info" />)
    const indeterminate = pending.getByRole('progressbar', { name: '分析中' })
    expect(indeterminate.hasAttribute('aria-valuenow')).toBe(false)
    expect(indeterminate.hasAttribute('aria-valuetext')).toBe(false)
    expect(pending.queryByText('进行中')).toBeNull()
    expect(indeterminate.getAttribute('data-indeterminate')).toBe('true')
  })

  it('renders a semantic timeline with tones and one empty state', () => {
    const timeline = render(<TimelineView
      title="任务执行记录"
      items={[
        { id: 'created', title: '任务已创建', description: '等待执行资源', time: '10:20', tone: 'neutral' },
        { id: 'running', title: '正在分析数据', description: '已完成 3 个数据源', time: '10:22', tone: 'info' },
        { id: 'done', title: '分析完成', time: '10:25', tone: 'success' },
      ]}
      emptyText="暂无执行记录"
    />)
    expect(timeline.getByRole('region', { name: '任务执行记录' })).toBeTruthy()
    expect(timeline.getByRole('list').tagName).toBe('OL')
    expect(timeline.getAllByRole('listitem')).toHaveLength(3)
    expect(timeline.getByText('已完成 3 个数据源')).toBeTruthy()
    expect(timeline.getByText('10:25')).toBeTruthy()
    expect(timeline.getAllByTestId('timeline-item').map(item => item.getAttribute('data-tone'))).toEqual([
      'neutral', 'info', 'success',
    ])
    timeline.unmount()

    const empty = render(<TimelineView title="空记录" items={[]} emptyText="暂无执行记录" />)
    expect(empty.getByText('暂无执行记录')).toBeTruthy()
    expect(empty.queryByRole('list')).toBeNull()
  })

  it('refuses duplicate Timeline ids in the Client catalog', () => {
    const processor = new MessageProcessor(catalogs as never, () => { /* no actions */ }, { validationConfig: STRICT_VALIDATION })
    expect(() => {
      processor.processMessages([board(TASK_CATALOG_ID, [{
        id: 'root', component: 'Timeline', title: '执行记录', emptyText: '暂无记录',
        items: [{ id: 'step', title: '开始' }, { id: 'step', title: '完成' }],
      }])] as ProcessableMessagePayload)
    }).toThrow()
    processor.dispose()
  })

  it('renders semantic rows in column order and one spanning empty state', () => {
    const table = render(<DataTableView
      label="任务列表"
      columns={[
        { key: 'name', label: '任务名称' },
        { key: 'owner', label: '负责人' },
        { key: 'done', label: '完成', align: 'center' },
      ]}
      rows={[
        { id: 'T-1', cells: { owner: '林嘉怡', name: '季度增长复盘报告', done: false } },
        { id: 'T-2', cells: { name: '发布说明', owner: null, done: true } },
      ]}
      emptyText="暂无任务"
    />)
    expect(table.getByRole('table', { name: '任务列表' })).toBeTruthy()
    expect(table.getAllByRole('columnheader').map(node => node.textContent)).toEqual(['任务名称', '负责人', '完成'])
    expect(table.getAllByRole('row')[1]?.textContent).toBe('季度增长复盘报告林嘉怡false')
    expect(table.getAllByRole('row')[2]?.textContent).toBe('发布说明true')
    table.unmount()

    const empty = render(<DataTableView
      label="任务列表" columns={[{ key: 'name', label: '任务名称' }, { key: 'owner', label: '负责人' }]}
      rows={[]} emptyText="暂无任务"
    />)
    const cell = empty.getByRole('cell', { name: '暂无任务' })
    expect(cell.getAttribute('colspan')).toBe('2')
  })

  it('filters and cycles sortable columns without an Agent channel', () => {
    const table = render(<DataTableView
      label="任务列表"
      columns={[
        { key: 'name', label: '任务名称', sortable: true },
        { key: 'owner', label: '负责人' },
      ]}
      rows={[
        { id: 'T-2', cells: { name: '发布说明', owner: '周明' } },
        { id: 'T-1', cells: { name: '季度复盘', owner: '林嘉怡' } },
      ]}
      emptyText="暂无任务"
      filter={{ placeholder: '筛选任务', clearLabel: '清空筛选' }}
    />)
    const input = table.getByRole('searchbox', { name: '筛选任务' })
    fireEvent.change(input, { target: { value: '林' } })
    expect(table.getAllByRole('row')).toHaveLength(2)
    expect(table.queryByText('发布说明')).toBeNull()
    fireEvent.click(table.getByRole('button', { name: '清空筛选' }))
    expect(table.getAllByRole('row')).toHaveLength(3)

    const sort = table.getByRole('button', { name: '任务名称' })
    fireEvent.click(sort)
    expect(sort.closest('th')?.getAttribute('aria-sort')).toBe('ascending')
    expect(table.getAllByRole('row')[1]?.textContent).toBe('发布说明周明')
    fireEvent.click(sort)
    expect(sort.closest('th')?.getAttribute('aria-sort')).toBe('descending')
    expect(table.getAllByRole('row')[1]?.textContent).toBe('季度复盘林嘉怡')
    fireEvent.click(sort)
    expect(sort.closest('th')?.getAttribute('aria-sort')).toBe('none')
    expect(table.getAllByRole('row')[1]?.textContent).toBe('发布说明周明')
  })

  it('selects rows locally and selects only currently visible rows', () => {
    const table = render(<DataTableView
      label="任务列表"
      columns={[{ key: 'name', label: '任务名称' }]}
      rows={[
        { id: 'T-1', cells: { name: '季度复盘' } },
        { id: 'T-2', cells: { name: '发布说明' } },
        { id: 'T-3', cells: { name: '数据分析' } },
      ]}
      emptyText="暂无任务"
      filter={{ placeholder: '筛选任务', clearLabel: '清空筛选' }}
      selection={{ mode: 'multiple', label: '选择任务', selectAllLabel: '选择全部可见任务' }}
    />)
    const task1 = table.getByRole('checkbox', { name: '选择任务：季度复盘' })
    fireEvent.click(task1)
    expect((task1 as HTMLInputElement).checked).toBe(true)
    expect(task1.closest('tr')?.getAttribute('data-selected')).toBe('true')
    expect((table.getByRole('checkbox', { name: '选择全部可见任务' }) as HTMLInputElement).indeterminate).toBe(true)

    fireEvent.change(table.getByRole('searchbox', { name: '筛选任务' }), { target: { value: '发布' } })
    fireEvent.click(table.getByRole('checkbox', { name: '选择全部可见任务' }))
    expect((table.getByRole('checkbox', { name: '选择任务：发布说明' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(table.getByRole('button', { name: '清空筛选' }))
    expect((table.getByRole('checkbox', { name: '选择任务：季度复盘' }) as HTMLInputElement).checked).toBe(true)
    expect((table.getByRole('checkbox', { name: '选择任务：发布说明' }) as HTMLInputElement).checked).toBe(true)
    expect((table.getByRole('checkbox', { name: '选择任务：数据分析' }) as HTMLInputElement).checked).toBe(false)
  })

  it('keeps single selection mutually exclusive by stable row id', () => {
    const table = render(<DataTableView
      label="任务列表" columns={[{ key: 'name', label: '任务名称', sortable: true }]}
      rows={[
        { id: 'T-2', cells: { name: '发布说明' } },
        { id: 'T-1', cells: { name: '季度复盘' } },
      ]}
      emptyText="暂无任务"
      selection={{ mode: 'single', label: '选择任务' }}
    />)
    const first = table.getByRole('radio', { name: '选择任务：发布说明' })
    const second = table.getByRole('radio', { name: '选择任务：季度复盘' })
    fireEvent.click(first)
    fireEvent.click(second)
    expect((first as HTMLInputElement).checked).toBe(false)
    expect((second as HTMLInputElement).checked).toBe(true)
    fireEvent.click(table.getByRole('button', { name: '任务名称' }))
    expect((table.getByRole('radio', { name: '选择任务：季度复盘' }) as HTMLInputElement).checked).toBe(true)
  })

  it('dispatches one batch action with selected ids and scalar row snapshots', () => {
    const dispatchAction = vi.fn(() => Promise.resolve())
    const table = render(<DataTableView
      label="任务列表" columns={[{ key: 'name', label: '任务名称' }]}
      rows={[
        { id: 'T-1', cells: { name: '季度复盘' } },
        { id: 'T-2', cells: { name: '发布说明' } },
      ]}
      emptyText="暂无任务"
      selection={{
        mode: 'multiple', label: '选择任务', selectAllLabel: '选择全部可见任务', actionsLabel: '批量操作',
        actions: [
          { label: '批量完成', name: 'completeTasks', variant: 'primary' },
          {
            label: '批量删除', name: 'deleteTasks', variant: 'danger',
            confirm: { prompt: '确认删除已选任务？', confirmLabel: '确认删除', cancelLabel: '取消' },
          },
        ],
      }}
      context={{ dispatchAction }}
    />)
    const complete = table.getByRole('button', { name: '批量完成' })
    const remove = table.getByRole('button', { name: '批量删除' })
    expect((complete as HTMLButtonElement).disabled).toBe(true)
    expect((remove as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(table.getByRole('checkbox', { name: '选择任务：季度复盘' }))
    fireEvent.click(table.getByRole('checkbox', { name: '选择任务：发布说明' }))
    fireEvent.click(complete)
    expect(dispatchAction).toHaveBeenCalledTimes(1)
    expect(dispatchAction).toHaveBeenCalledWith({ event: {
      name: 'completeTasks',
      context: {
        selectedRowIds: ['T-1', 'T-2'],
        selectedRows: [
          { id: 'T-1', cells: { name: '季度复盘' } },
          { id: 'T-2', cells: { name: '发布说明' } },
        ],
      },
    } })
    dispatchAction.mockClear()

    fireEvent.click(remove)
    expect(table.getByRole('group', { name: '确认删除已选任务？' })).toBeTruthy()
    expect(dispatchAction).not.toHaveBeenCalled()
    fireEvent.click(table.getByRole('button', { name: '取消' }))
    expect(dispatchAction).not.toHaveBeenCalled()
    fireEvent.click(remove)
    fireEvent.click(table.getByRole('button', { name: '确认删除' }))
    expect(dispatchAction).toHaveBeenCalledWith({ event: {
      name: 'deleteTasks',
      context: {
        selectedRowIds: ['T-1', 'T-2'],
        selectedRows: [
          { id: 'T-1', cells: { name: '季度复盘' } },
          { id: 'T-2', cells: { name: '发布说明' } },
        ],
      },
    } })
    expect(table.getByText('季度复盘')).toBeTruthy()
    expect(table.getByText('发布说明')).toBeTruthy()
  })

  it('refuses incomplete selection labels in the Client catalog', () => {
    const processor = new MessageProcessor(catalogs as never, () => { /* no actions */ }, { validationConfig: STRICT_VALIDATION })
    expect(() => {
      processor.processMessages([board(TASK_CATALOG_ID, [{
        id: 'root', component: 'DataTable', label: '任务列表', emptyText: '暂无任务',
        columns: [{ key: 'name', label: '任务' }], rows: [], selection: { mode: 'multiple', label: '选择任务' },
      }])] as ProcessableMessagePayload)
    }).toThrow()
    processor.dispose()
  })

  it('renders grouped bars, a legend, and an accessible value summary', () => {
    const chart = render(<BarChartView
      title="任务完成量"
      categories={['周一', '周二']}
      series={[{ name: '完成', values: [3, 5] }, { name: '新增', values: [4, 2] }]}
      emptyText="暂无数据"
    />)
    expect(chart.getByRole('img', { name: '任务完成量' })).toBeTruthy()
    expect(chart.getAllByTestId('bar-chart-bar')).toHaveLength(4)
    expect(chart.getByText('完成')).toBeTruthy()
    expect(chart.getByText('新增')).toBeTruthy()
    expect(chart.getByText('周一：完成 3；新增 4')).toBeTruthy()
    expect(chart.getByText('周二：完成 5；新增 2')).toBeTruthy()
    chart.unmount()

    const empty = render(<BarChartView title="空图表" categories={[]} series={[]} emptyText="暂无数据" />)
    expect(empty.getByText('暂无数据')).toBeTruthy()
    expect(empty.queryByRole('img')).toBeNull()
  })

  it('renders line paths and points with the shared accessible summary', () => {
    const chart = render(<LineChartView
      title="任务趋势"
      categories={['周一', '周二', '周三']}
      series={[{ name: '完成', values: [3, 5, 4] }, { name: '新增', values: [4, 2, 6] }]}
      emptyText="暂无数据"
    />)
    expect(chart.getByRole('img', { name: '任务趋势' })).toBeTruthy()
    expect(chart.getAllByTestId('line-chart-path')).toHaveLength(2)
    expect(chart.getAllByTestId('line-chart-point')).toHaveLength(6)
    expect(chart.getByText('周一：完成 3；新增 4')).toBeTruthy()
    expect(chart.getByText('周三：完成 4；新增 6')).toBeTruthy()
  })

  it('shows chart values locally on pointer hover and keyboard focus', () => {
    const bars = render(<BarChartView
      title="任务完成量"
      categories={['周一', '周二']}
      series={[{ name: '完成', values: [3, 5] }]}
      emptyText="暂无数据"
    />)
    const firstBar = bars.getAllByTestId('bar-chart-bar')[0]!
    expect(bars.queryByRole('tooltip')).toBeNull()
    fireEvent.mouseEnter(firstBar)
    expect(bars.getByRole('tooltip').textContent).toBe('周一 · 完成 3')
    fireEvent.mouseLeave(firstBar)
    expect(bars.queryByRole('tooltip')).toBeNull()
    fireEvent.focus(firstBar)
    expect(bars.getByRole('tooltip').textContent).toBe('周一 · 完成 3')
    expect(firstBar.getAttribute('aria-describedby')).toBe(bars.getByRole('tooltip').id)
    fireEvent.blur(firstBar)
    expect(bars.queryByRole('tooltip')).toBeNull()
    bars.unmount()

    const lines = render(<LineChartView
      title="任务趋势"
      categories={['周一', '周二']}
      series={[{ name: '新增', values: [4, 2] }]}
      emptyText="暂无数据"
    />)
    const secondPoint = lines.getAllByTestId('line-chart-point')[1]!
    fireEvent.mouseEnter(secondPoint)
    expect(lines.getByRole('tooltip').textContent).toBe('周二 · 新增 2')
    fireEvent.mouseLeave(secondPoint)
    expect(lines.queryByRole('tooltip')).toBeNull()
    fireEvent.focus(secondPoint)
    expect(lines.getByRole('tooltip').textContent).toBe('周二 · 新增 2')
    fireEvent.blur(secondPoint)
    expect(lines.queryByRole('tooltip')).toBeNull()
  })

  it('dispatches chart target actions by click, Enter, and Space', () => {
    const dispatchAction = vi.fn(() => Promise.resolve())
    const context = { dispatchAction }
    const interaction = { label: '查看任务明细', action: { name: 'showTaskDetails' } }

    const bars = render(<BarChartView
      title="任务完成量" categories={['周一', '周二']}
      series={[{ name: '完成', values: [3, 5] }]} emptyText="暂无数据"
      interaction={interaction} context={context}
    />)
    fireEvent.click(bars.getAllByTestId('bar-chart-bar')[1]!)
    expect(dispatchAction).toHaveBeenLastCalledWith({ event: {
      name: 'showTaskDetails',
      context: { chartType: 'bar', category: '周二', categoryIndex: 1, series: '完成', seriesIndex: 0, value: 5 },
    } })
    bars.unmount()

    const lines = render(<LineChartView
      title="任务趋势" categories={['周一', '周二']}
      series={[{ name: '新增', values: [4, 2] }]} emptyText="暂无数据"
      interaction={interaction} context={context}
    />)
    fireEvent.keyDown(lines.getAllByTestId('line-chart-point')[1]!, { key: 'Enter' })
    expect(dispatchAction).toHaveBeenLastCalledWith({ event: {
      name: 'showTaskDetails',
      context: { chartType: 'line', category: '周二', categoryIndex: 1, series: '新增', seriesIndex: 0, value: 2 },
    } })
    lines.unmount()

    const pie = render(<PieChartView
      title="任务状态分布" categories={['待处理', '已完成']}
      series={[{ name: '任务数', values: [3, 12] }]} emptyText="暂无任务"
      interaction={interaction} context={context}
    />)
    fireEvent.keyDown(pie.getAllByTestId('pie-chart-segment')[1]!, { key: ' ' })
    expect(dispatchAction).toHaveBeenLastCalledWith({ event: {
      name: 'showTaskDetails',
      context: {
        chartType: 'pie', category: '已完成', categoryIndex: 1,
        series: '任务数', seriesIndex: 0, value: 12, percentage: 80,
      },
    } })
  })

  it('keeps charts display-only without an interaction contract', () => {
    const chart = render(<BarChartView
      title="任务完成量" categories={['周一']} series={[{ name: '完成', values: [3] }]} emptyText="暂无数据"
    />)
    const bar = chart.getByTestId('bar-chart-bar')
    expect(bar.getAttribute('role')).toBeNull()
    fireEvent.click(bar)
  })

  it('renders one accessible donut segment per category with local percentages', () => {
    const chart = render(<PieChartView
      title="任务状态分布"
      categories={['待处理', '进行中', '已完成']}
      series={[{ name: '任务数', values: [3, 5, 12] }]}
      emptyText="暂无任务"
    />)
    expect(chart.getByRole('img', { name: '任务状态分布' })).toBeTruthy()
    const segments = chart.getAllByTestId('pie-chart-segment')
    expect(segments).toHaveLength(3)
    expect(segments.map((segment) => {
      const dasharray = segment.getAttribute('stroke-dasharray')
      return Number(dasharray?.split(' ')[0])
    })).toEqual([
      expect.closeTo(65.97, 2), expect.closeTo(109.96, 2), expect.closeTo(263.89, 2),
    ])
    expect(chart.getByText('待处理：任务数 3')).toBeTruthy()
    fireEvent.mouseEnter(segments[1]!)
    expect(chart.getByRole('tooltip').textContent).toBe('进行中 · 任务数 5 · 25%')
    fireEvent.mouseLeave(segments[1]!)
    expect(chart.queryByRole('tooltip')).toBeNull()
    fireEvent.focus(segments[2]!)
    expect(chart.getByRole('tooltip').textContent).toBe('已完成 · 任务数 12 · 60%')
    expect(segments[2]!.getAttribute('aria-describedby')).toBe(chart.getByRole('tooltip').id)
  })

  it.each([
    {
      name: 'multiple pie series',
      series: [{ name: '任务数', values: [3, 5] }, { name: '占比', values: [4, 4] }],
    },
    { name: 'an all-zero pie series', series: [{ name: '任务数', values: [0, 0] }] },
  ])('refuses $name in the Client catalog', ({ series }) => {
    const processor = new MessageProcessor(catalogs as never, () => { /* no actions */ }, { validationConfig: STRICT_VALIDATION })
    expect(() => {
      processor.processMessages([board(TASK_CATALOG_ID, [{
        id: 'root', component: 'Chart', type: 'pie', title: '任务状态分布',
        categories: ['待处理', '已完成'], series, emptyText: '暂无任务',
      }])] as ProcessableMessagePayload)
    }).toThrow()
    processor.dispose()
  })

  it('dispatches row actions and confirms destructive actions before dispatch', () => {
    const dispatchAction = vi.fn(() => Promise.resolve())
    const table = render(<DataTableView
      label="任务列表"
      columns={[{ key: 'name', label: '任务名称' }]}
      rows={[{ id: 'T-1', cells: { name: '季度复盘' } }]}
      emptyText="暂无任务"
      rowActions={[
        { label: '完成', name: 'completeTask', variant: 'primary' },
        {
          label: '删除', name: 'deleteTask', variant: 'danger',
          confirm: { prompt: '确认删除季度复盘？', confirmLabel: '确认删除', cancelLabel: '取消' },
        },
      ]}
      context={{ dispatchAction }}
    />)
    fireEvent.click(table.getByRole('button', { name: '完成' }))
    expect(dispatchAction).toHaveBeenCalledWith({
      event: { name: 'completeTask', context: { rowId: 'T-1', row: { name: '季度复盘' } } },
    })
    dispatchAction.mockClear()

    fireEvent.click(table.getByRole('button', { name: '删除' }))
    expect(table.getByRole('group', { name: '确认删除季度复盘？' })).toBeTruthy()
    expect(dispatchAction).not.toHaveBeenCalled()
    fireEvent.click(table.getByRole('button', { name: '取消' }))
    expect(table.queryByRole('group', { name: '确认删除季度复盘？' })).toBeNull()
    expect(dispatchAction).not.toHaveBeenCalled()

    fireEvent.click(table.getByRole('button', { name: '删除' }))
    fireEvent.click(table.getByRole('button', { name: '确认删除' }))
    expect(dispatchAction).toHaveBeenCalledWith({
      event: { name: 'deleteTask', context: { rowId: 'T-1', row: { name: '季度复盘' } } },
    })
    expect(table.getByText('季度复盘')).toBeTruthy()
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

  it('refuses duplicate DataTable keys in the Client catalog', () => {
    const processor = new MessageProcessor(catalogs as never, () => { /* no actions */ }, { validationConfig: STRICT_VALIDATION })
    expect(() => {
      processor.processMessages([board(TASK_CATALOG_ID, [{
        id: 'root', component: 'DataTable', label: '任务列表', emptyText: '暂无任务',
        columns: [{ key: 'name', label: '任务' }, { key: 'name', label: '重复' }], rows: [],
      }])] as ProcessableMessagePayload)
    }).toThrow()
    processor.dispose()
  })

  it('refuses an incomplete DataTable action contract in the Client catalog', () => {
    const processor = new MessageProcessor(catalogs as never, () => { /* no actions */ }, { validationConfig: STRICT_VALIDATION })
    expect(() => {
      processor.processMessages([board(TASK_CATALOG_ID, [{
        id: 'root', component: 'DataTable', label: '任务列表', emptyText: '暂无任务',
        columns: [{ key: 'name', label: '任务' }], rows: [],
        rowActions: [{ label: '完成', name: 'completeTask' }],
      }])] as ProcessableMessagePayload)
    }).toThrow()
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
