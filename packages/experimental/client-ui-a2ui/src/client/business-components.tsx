/**
 * Business components this renderer adds beside the A2UI Basic Catalog.
 *
 * The model describes them; the design system lives here. Each entry owns its
 * CSS Module and reads `--dsw-*` tokens, so a Surface cannot choose colours,
 * fonts, or spacing, and a redesign changes these files rather than a prompt.
 */

import { useMemo, useState, type ReactNode } from 'react'
import z from 'zod'
import { createComponentImplementation } from '@a2ui/react'
import { componentId } from '@a2ui/web_core/v1_0'
import css from './BusinessComponents.module.css'

/** Tones shared with the `dsh_theme` surface extension. */
const tone = z.enum(['neutral', 'info', 'success', 'warning', 'danger'])

const TONE_CLASS: Readonly<Record<string, string | undefined>> = {
  neutral: css.neutral,
  info: css.info,
  success: css.success,
  warning: css.warning,
  danger: css.danger,
}

function toneClass(value: string | undefined): string {
  const name = value === undefined ? 'neutral' : value
  return TONE_CLASS[name] ?? ''
}

type LocalSetAction = {
  readonly kind: 'local'
  readonly operation: 'set'
  readonly path: string
  readonly value: unknown
}
type LocalToggleAction = {
  readonly kind: 'local'
  readonly operation: 'toggle'
  readonly path: string
}
type AgentEventAction = {
  readonly kind: 'agent'
  readonly name: string
  readonly context?: Record<string, unknown>
}
type ActionButtonProps = {
  readonly label: string
  readonly variant?: 'default' | 'primary' | 'danger' | 'borderless'
  readonly action: LocalSetAction | LocalToggleAction | AgentEventAction
}
type ActionButtonContext = {
  readonly dataContext: {
    set(path: string, value: unknown): void
    resolveDynamicValue(value: unknown): unknown
  }
  dispatchAction(action: Record<string, unknown>): Promise<void>
}

const ACTION_CLASS: Readonly<Record<string, string | undefined>> = {
  default: css.actionDefault,
  primary: css.actionPrimary,
  danger: css.actionDanger,
  borderless: css.actionBorderless,
}

/**
 * Render one business action whose local variants never reach the Agent.
 * @param props - closed label, visual variant, and action union.
 * @param context - owning Surface data and Agent action channels.
 * @returns one themed button.
 */
export function ActionButtonView({ props, context }: {
  readonly props: ActionButtonProps
  readonly context: ActionButtonContext
}) {
  const run = (): void => {
    if (props.action.kind === 'agent') {
      void context.dispatchAction({
        event: {
          name: props.action.name,
          ...props.action.context === undefined ? {} : { context: props.action.context },
        },
      })
      return
    }
    if (props.action.operation === 'set') {
      context.dataContext.set(props.action.path, props.action.value)
      return
    }
    const current = context.dataContext.resolveDynamicValue({ '@path': props.action.path })
    context.dataContext.set(props.action.path, current !== true)
  }
  const variant = props.variant ?? 'default'
  return <button type="button" className={`${css.actionButton} ${ACTION_CLASS[variant] ?? ''}`} onClick={run}>
    {props.label}
  </button>
}

const actionButton = createComponentImplementation({
  name: 'ActionButton',
  schema: z.strictObject({
    label: z.string(),
    variant: z.enum(['default', 'primary', 'danger', 'borderless']).optional(),
    action: z.union([
      z.strictObject({ kind: z.literal('local'), operation: z.literal('set'), path: z.string(), value: z.unknown() }),
      z.strictObject({ kind: z.literal('local'), operation: z.literal('toggle'), path: z.string() }),
      z.strictObject({ kind: z.literal('agent'), name: z.string(), context: z.record(z.string(), z.unknown()).optional() }),
    ]),
  }),
}, ({ props, context }) => <ActionButtonView props={props as ActionButtonProps} context={context} />)

type ProgressProps = {
  readonly label: string
  readonly value?: number
  readonly max?: number
  readonly tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}

/**
 * Render bounded determinate progress or an accessible indeterminate track.
 * @param props - label, optional value/max pair, and semantic tone.
 * @returns a progress bar with visible status text.
 */
export function ProgressView({ label, value, max = 100, tone: progressTone = 'neutral' }: ProgressProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100
  const percent = value === undefined
    ? undefined
    : Math.round(Math.min(1, Math.max(0, value / safeMax)) * 100)
  return <div className={css.progress} data-tone={progressTone}>
    <div className={css.progressHeader}>
      <span className={css.progressLabel}>{label}</span>
      {percent === undefined ? null : <span className={css.progressValue}>{String(percent)}%</span>}
    </div>
    <div
      className={css.progressTrack}
      role="progressbar"
      aria-label={label}
      aria-valuemin={percent === undefined ? undefined : 0}
      aria-valuemax={percent === undefined ? undefined : 100}
      aria-valuenow={percent}
      aria-valuetext={percent === undefined ? undefined : `${String(percent)}%`}
      data-indeterminate={percent === undefined ? 'true' : undefined}
    >
      <span className={css.progressFill} style={percent === undefined ? undefined : { width: `${String(percent)}%` }} />
    </div>
  </div>
}

const progress = createComponentImplementation({
  name: 'Progress',
  schema: z.strictObject({
    label: z.string(),
    value: z.number().optional(),
    max: z.number().optional(),
    tone: tone.optional(),
  }),
}, ({ props }) => <ProgressView {...props as ProgressProps} />)

type BarChartProps = {
  readonly title: string
  readonly categories: readonly string[]
  readonly series: readonly { readonly name: string; readonly values: readonly number[] }[]
  readonly emptyText: string
}

type ChartProps = BarChartProps & { readonly type: 'bar' | 'line' }

const CHART_PLOT = { left: 24, top: 12, width: 552, height: 188 } as const

function ChartFrame({ title, series, categories, children }: BarChartProps & { readonly children: ReactNode }) {
  return <figure className={css.chart}>
    <figcaption className={css.chartTitle}>{title}</figcaption>
    <div className={css.chartLegend}>{series.map((item, index) => <span key={item.name}>
      <i data-series={String(index)} />{item.name}
    </span>)}</div>
    {children}
    <ul className={css.visuallyHidden}>{categories.map((category, categoryIndex) => <li key={category}>
      {category}：{series.map(item => `${item.name} ${String(item.values[categoryIndex] ?? 0)}`).join('；')}
    </li>)}</ul>
  </figure>
}

/**
 * Render a bounded grouped bar chart whose coordinates and palette the Host owns.
 * @param props - title, category labels, numeric series, and caller-owned empty text.
 * @returns a themed SVG plus a screen-reader value summary.
 */
export function BarChartView({ title, categories, series, emptyText }: BarChartProps) {
  if (categories.length === 0 || series.length === 0) return <div className={css.chartEmpty}>{emptyText}</div>
  const maximum = Math.max(1, ...series.flatMap(item => item.values))
  const plot = CHART_PLOT
  const groupWidth = plot.width / categories.length
  const clusterWidth = groupWidth * 0.72
  const barWidth = clusterWidth / series.length
  return <ChartFrame title={title} categories={categories} series={series} emptyText={emptyText}>
    <svg className={css.barChart} viewBox="0 0 600 236" role="img" aria-label={title}>
      <line className={css.chartAxis} x1={plot.left} y1={plot.top + plot.height} x2={plot.left + plot.width} y2={plot.top + plot.height} />
      {categories.map((category, categoryIndex) => {
        const clusterLeft = plot.left + categoryIndex * groupWidth + (groupWidth - clusterWidth) / 2
        return <g key={category}>
          {series.map((item, seriesIndex) => {
            const value = item.values[categoryIndex] ?? 0
            const height = (value / maximum) * plot.height
            return <rect
              key={item.name} className={css.chartBar} data-series={String(seriesIndex)} data-testid="bar-chart-bar"
              x={clusterLeft + seriesIndex * barWidth + 1} y={plot.top + plot.height - height}
              width={Math.max(1, barWidth - 2)} height={height} rx={2}
            />
          })}
          <text className={css.chartCategory} x={plot.left + categoryIndex * groupWidth + groupWidth / 2} y={222} textAnchor="middle">
            {category}
          </text>
        </g>
      })}
    </svg>
  </ChartFrame>
}

/**
 * Render bounded line series with Host-owned paths, points, and palette.
 * @param props - title, category labels, numeric series, and caller-owned empty text.
 * @returns a themed SVG plus the shared screen-reader value summary.
 */
export function LineChartView({ title, categories, series, emptyText }: BarChartProps) {
  if (categories.length === 0 || series.length === 0) return <div className={css.chartEmpty}>{emptyText}</div>
  const maximum = Math.max(1, ...series.flatMap(item => item.values))
  const plot = CHART_PLOT
  const x = (index: number): number => plot.left + (categories.length === 1
    ? plot.width / 2
    : (index / (categories.length - 1)) * plot.width)
  const y = (value: number): number => plot.top + plot.height - (value / maximum) * plot.height
  return <ChartFrame title={title} categories={categories} series={series} emptyText={emptyText}>
    <svg className={css.barChart} viewBox="0 0 600 236" role="img" aria-label={title}>
      <line className={css.chartAxis} x1={plot.left} y1={plot.top + plot.height} x2={plot.left + plot.width} y2={plot.top + plot.height} />
      {series.map((item, seriesIndex) => <g key={item.name}>
        <path
          className={css.chartLine} data-series={String(seriesIndex)} data-testid="line-chart-path"
          d={item.values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${String(x(index))} ${String(y(value))}`).join(' ')}
        />
        {item.values.map((value, index) => <circle
          key={categories[index]} className={css.chartPoint} data-series={String(seriesIndex)} data-testid="line-chart-point"
          cx={x(index)} cy={y(value)} r={3}
        />)}
      </g>)}
      {categories.map((category, index) => <text
        key={category} className={css.chartCategory} x={x(index)} y={222} textAnchor="middle"
      >{category}</text>)}
    </svg>
  </ChartFrame>
}

const chartString = z.string().min(1)
const barChartProps = z.strictObject({
  type: z.enum(['bar', 'line']),
  title: chartString,
  categories: z.array(chartString).max(12),
  series: z.array(z.strictObject({
    name: chartString, values: z.array(z.number().min(0)).max(12),
  })).max(4),
  emptyText: chartString,
}).superRefine((value, ctx) => {
  if ((value.categories.length === 0) !== (value.series.length === 0)) {
    ctx.addIssue({ code: 'custom', message: 'empty categories and series must be empty together', path: ['series'] })
  }
  const categories = new Set<string>()
  for (const [index, category] of value.categories.entries()) {
    if (categories.has(category)) ctx.addIssue({ code: 'custom', message: 'duplicate category', path: ['categories', index] })
    categories.add(category)
  }
  const names = new Set<string>()
  for (const [index, item] of value.series.entries()) {
    if (item.values.length !== value.categories.length) ctx.addIssue({ code: 'custom', message: 'values must match categories', path: ['series', index, 'values'] })
    if (names.has(item.name)) ctx.addIssue({ code: 'custom', message: 'duplicate series name', path: ['series', index, 'name'] })
    names.add(item.name)
  }
})

const chart = createComponentImplementation({ name: 'Chart', schema: barChartProps }, ({ props }) => {
  const value = props as ChartProps
  return value.type === 'bar' ? <BarChartView {...value} /> : <LineChartView {...value} />
})

type TableCell = string | number | boolean | null
type DataTableProps = {
  readonly label: string
  readonly columns: readonly {
    readonly key: string
    readonly label: string
    readonly align?: 'start' | 'center' | 'end'
    readonly sortable?: boolean
  }[]
  readonly rows: readonly {
    readonly id: string
    readonly cells: Readonly<Record<string, TableCell>>
  }[]
  readonly emptyText: string
  readonly filter?: { readonly placeholder: string; readonly clearLabel: string }
  readonly actionsLabel?: string
  readonly rowActions?: readonly {
    readonly label: string
    readonly name: string
    readonly variant?: 'default' | 'primary' | 'danger' | 'borderless'
    readonly confirm?: { readonly prompt: string; readonly confirmLabel: string; readonly cancelLabel: string }
  }[]
}
type DataTableContext = { dispatchAction(action: Record<string, unknown>): Promise<void> }

function cellText(value: TableCell | undefined): string {
  return value === undefined || value === null ? '' : String(value)
}

/**
 * Render bounded scalar records as a semantic, horizontally scrollable table.
 * @param props - accessible label, columns, rows, and caller-owned empty text.
 * @returns one read-only table.
 */
export function DataTableView({
  label, columns, rows, emptyText, filter, actionsLabel, rowActions = [], context,
}: DataTableProps & { readonly context?: DataTableContext }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null)
  const [pending, setPending] = useState<{ rowId: string; actionName: string } | null>(null)
  const visibleRows = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    const filtered = term === '' ? [...rows] : rows.filter(row => (
      columns.some(column => cellText(row.cells[column.key]).toLocaleLowerCase().includes(term))
    ))
    if (sort === null) return filtered
    return filtered.map((row, index) => ({ row, index })).sort((left, right) => {
      const compared = cellText(left.row.cells[sort.key]).localeCompare(
        cellText(right.row.cells[sort.key]), undefined, { numeric: true, sensitivity: 'base' },
      )
      return (compared === 0 ? left.index - right.index : compared) * (sort.direction === 'ascending' ? 1 : -1)
    }).map(item => item.row)
  }, [columns, query, rows, sort])
  const cycleSort = (key: string): void => {
    setSort(current => current?.key !== key
      ? { key, direction: 'ascending' }
      : current.direction === 'ascending'
        ? { key, direction: 'descending' }
        : null)
  }
  const dispatchRowAction = (name: string, row: DataTableProps['rows'][number]): void => {
    void context?.dispatchAction({ event: { name, context: { rowId: row.id, row: row.cells } } })
  }
  const columnCount = columns.length + (rowActions.length === 0 ? 0 : 1)
  return <div className={css.tableShell}>
    {filter === undefined ? null : <div className={css.tableFilter}>
      <input
        type="search" value={query} placeholder={filter.placeholder} aria-label={filter.placeholder}
        onChange={(event) => { setQuery(event.currentTarget.value) }}
      />
      <button type="button" onClick={() => { setQuery('') }}>{filter.clearLabel}</button>
    </div>}
    <div className={css.tableScroll}>
      <table className={css.dataTable} aria-label={label}>
        <thead>
          <tr>{columns.map(column => <th
            key={column.key} scope="col" data-align={column.align ?? 'start'}
            aria-sort={column.sortable === true && sort?.key === column.key ? sort.direction : 'none'}
          >
            {column.sortable === true
              ? <button type="button" className={css.tableSort} onClick={() => { cycleSort(column.key) }}>
                {column.label}<span aria-hidden="true">{sort?.key !== column.key ? '↕' : sort.direction === 'ascending' ? '↑' : '↓'}</span>
              </button>
              : column.label}
          </th>)}{rowActions.length === 0 ? null : <th scope="col">{actionsLabel}</th>}</tr>
        </thead>
        <tbody>{visibleRows.length === 0
          ? <tr><td className={css.tableEmpty} colSpan={columnCount}>{emptyText}</td></tr>
          : visibleRows.map(row => <tr key={row.id}>{columns.map((column) => {
            const text = cellText(row.cells[column.key])
            return <td key={column.key} data-align={column.align ?? 'start'} title={text || undefined}>{text}</td>
          })}{rowActions.length === 0 ? null : <td className={css.tableActions}>
            {rowActions.map(action => <button
              key={action.name} type="button"
              className={`${css.actionButton} ${ACTION_CLASS[action.variant ?? 'default'] ?? ''}`}
              onClick={() => {
                if (action.confirm === undefined) dispatchRowAction(action.name, row)
                else setPending({ rowId: row.id, actionName: action.name })
              }}
            >{action.label}</button>)}
            {rowActions.map((action) => {
              if (action.confirm === undefined || pending?.rowId !== row.id || pending.actionName !== action.name) return null
              return <div key={`${action.name}:confirm`} className={css.tableConfirm} role="group" aria-label={action.confirm.prompt}>
                <span>{action.confirm.prompt}</span>
                <button type="button" onClick={() => { setPending(null) }}>{action.confirm.cancelLabel}</button>
                <button type="button" onClick={() => {
                  setPending(null)
                  dispatchRowAction(action.name, row)
                }}>{action.confirm.confirmLabel}</button>
              </div>
            })}
          </td>}</tr>)}</tbody>
      </table>
    </div>
  </div>
}

const tableId = z.string().min(1).max(64).regex(/^[^\p{Cc}]+$/u)
const tableColumn = z.strictObject({
  key: tableId,
  label: z.string().min(1).max(100),
  align: z.enum(['start', 'center', 'end']).optional(),
  sortable: z.boolean().optional(),
})
const tableRow = z.strictObject({
  id: tableId,
  cells: z.record(tableId, z.union([z.string(), z.number(), z.boolean(), z.null()])),
})
const dataTableProps = z.strictObject({
  label: z.string().min(1).max(200),
  columns: z.array(tableColumn).min(1).max(12),
  rows: z.array(tableRow).max(100),
  emptyText: z.string().min(1).max(200),
  filter: z.strictObject({
    placeholder: z.string().min(1).max(100), clearLabel: z.string().min(1).max(100),
  }).optional(),
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
  const columns = new Set<string>()
  for (const [index, column] of value.columns.entries()) {
    if (columns.has(column.key)) ctx.addIssue({ code: 'custom', message: 'duplicate column key', path: ['columns', index, 'key'] })
    columns.add(column.key)
  }
  const rows = new Set<string>()
  for (const [index, row] of value.rows.entries()) {
    if (rows.has(row.id)) ctx.addIssue({ code: 'custom', message: 'duplicate row id', path: ['rows', index, 'id'] })
    rows.add(row.id)
  }
  if ((value.actionsLabel === undefined) !== (value.rowActions === undefined)) {
    ctx.addIssue({ code: 'custom', message: 'actionsLabel and rowActions must be provided together', path: ['rowActions'] })
  }
  const actionNames = new Set<string>()
  for (const [index, action] of (value.rowActions ?? []).entries()) {
    if (actionNames.has(action.name)) ctx.addIssue({ code: 'custom', message: 'duplicate row action name', path: ['rowActions', index, 'name'] })
    actionNames.add(action.name)
  }
})

const dataTable = createComponentImplementation({
  name: 'DataTable',
  schema: dataTableProps,
}, ({ props, context }) => <DataTableView {...props as DataTableProps} context={context} />)

const badge = createComponentImplementation({
  name: 'StatusBadge',
  schema: z.strictObject({ label: z.string(), tone: tone.optional() }),
}, ({ props }) => <span className={`${css.badge} ${toneClass(props.tone)}`}>{props.label}</span>)

const PRIORITY_LABEL: Readonly<Record<string, string>> = { high: 'P0', medium: 'P1', low: 'P2' }
const STATUS_LABEL: Readonly<Record<string, string>> = { todo: '待处理', doing: '进行中', done: '已完成' }
const STATUS_TONE: Readonly<Record<string, string>> = { todo: 'neutral', doing: 'info', done: 'success' }

const taskCard = createComponentImplementation({
  name: 'TaskCard',
  schema: z.strictObject({
    title: z.string(),
    owner: z.string().optional(),
    priority: z.enum(['high', 'medium', 'low']).optional(),
    status: z.enum(['todo', 'doing', 'done']).optional(),
    // `componentId()` marks the property so the binder resolves the id to a node.
    child: componentId().optional(),
  }),
}, ({ props, buildChild }) => <article className={css.taskCard} data-status={props.status ?? 'todo'}>
  <header className={css.taskHeader}>
    <h3 className={css.taskTitle}>{props.title}</h3>
    {props.status === undefined ? null : <span className={`${css.badge} ${toneClass(STATUS_TONE[props.status])}`}>
      {STATUS_LABEL[props.status]}
    </span>}
  </header>
  <div className={css.taskMeta}>
    {props.owner === undefined ? null : <span className={css.metaItem}>负责人 {props.owner}</span>}
    {props.priority === undefined ? null : <span className={`${css.metaItem} ${css.priority}`}>
      {PRIORITY_LABEL[props.priority] ?? props.priority}
    </span>}
  </div>
  {props.child === undefined ? null : <div className={css.taskActions}>{buildChild(props.child)}</div>}
</article>)

const statistic = createComponentImplementation({
  name: 'Statistic',
  schema: z.strictObject({
    label: z.string(),
    value: z.string(),
    trend: z.strictObject({ direction: z.enum(['up', 'down', 'flat']), text: z.string() }).optional(),
    tone: tone.optional(),
  }),
}, ({ props }) => <div className={`${css.statistic} ${toneClass(props.tone)}`}>
  <span className={css.statisticLabel}>{props.label}</span>
  <span className={css.statisticValue}>{props.value}</span>
  {props.trend === undefined ? null : <span className={css.trend} data-direction={props.trend.direction}>
    {props.trend.direction === 'up' ? '↑' : props.trend.direction === 'down' ? '↓' : '→'} {props.trend.text}
  </span>}
</div>)

/** Implementations keyed by the name the model sends. */
export const taskComponents = [actionButton, chart, dataTable, progress, badge, taskCard, statistic] as const

/** Children a Surface may place inside a business component. */
export type BusinessComponentChild = ReactNode
