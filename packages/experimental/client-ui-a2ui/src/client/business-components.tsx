/**
 * Business components this renderer adds beside the A2UI Basic Catalog.
 *
 * The model describes them; the design system lives here. Each entry owns its
 * CSS Module and reads `--dsw-*` tokens, so a Surface cannot choose colours,
 * fonts, or spacing, and a redesign changes these files rather than a prompt.
 */

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
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

type ChartInteraction = { readonly label: string; readonly action: { readonly name: string } }
type ChartContext = { dispatchAction(action: Record<string, unknown>): Promise<void> }
type ChartTargetContext = {
  readonly chartType: 'bar' | 'line' | 'pie'
  readonly category: string
  readonly categoryIndex: number
  readonly series: string
  readonly seriesIndex: number
  readonly value: number
  readonly percentage?: number
}

type BarChartProps = {
  readonly title: string
  readonly categories: readonly string[]
  readonly series: readonly { readonly name: string; readonly values: readonly number[] }[]
  readonly emptyText: string
  readonly interaction?: ChartInteraction
  readonly context?: ChartContext
}

function activateChartTarget(
  interaction: ChartInteraction | undefined,
  context: ChartContext | undefined,
  target: ChartTargetContext,
): void {
  if (interaction === undefined) return
  void context?.dispatchAction({ event: { name: interaction.action.name, context: target } })
}

function handleChartKey(
  event: KeyboardEvent<SVGElement>,
  interaction: ChartInteraction | undefined,
  context: ChartContext | undefined,
  target: ChartTargetContext,
): void {
  if (interaction === undefined || (event.key !== 'Enter' && event.key !== ' ')) return
  event.preventDefault()
  activateChartTarget(interaction, context, target)
}

type ChartProps = BarChartProps & { readonly type: 'bar' | 'line' | 'pie' }
type ChartTooltip = {
  readonly key: string
  readonly text: string
  readonly x: number
  readonly y: number
}

const CHART_PLOT = { left: 24, top: 12, width: 552, height: 188 } as const

function ChartFrame({
  title, series, categories, children, tooltip, tooltipId, categoryLegend = false,
}: BarChartProps & {
  readonly children: ReactNode
  readonly tooltip: ChartTooltip | null
  readonly tooltipId: string
  readonly categoryLegend?: boolean
}) {
  return <figure className={css.chart}>
    <figcaption className={css.chartTitle}>{title}</figcaption>
    <div className={css.chartLegend}>{(categoryLegend ? categories : series.map(item => item.name)).map((item, index) => <span key={item}>
      <i data-series={String(index)} />{item}
    </span>)}</div>
    <div className={css.chartPlot}>
      {children}
      {tooltip === null ? null : <div
        id={tooltipId} role="tooltip" className={css.chartTooltip}
        style={{ left: `${String((tooltip.x / 600) * 100)}%`, top: `${String((tooltip.y / 236) * 100)}%` }}
      >{tooltip.text}</div>}
    </div>
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
export function BarChartView({ title, categories, series, emptyText, interaction, context }: BarChartProps) {
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null)
  const tooltipId = useId()
  if (categories.length === 0 || series.length === 0) return <div className={css.chartEmpty}>{emptyText}</div>
  const maximum = Math.max(1, ...series.flatMap(item => item.values))
  const plot = CHART_PLOT
  const groupWidth = plot.width / categories.length
  const clusterWidth = groupWidth * 0.72
  const barWidth = clusterWidth / series.length
  return <ChartFrame
    title={title} categories={categories} series={series} emptyText={emptyText}
    tooltip={tooltip} tooltipId={tooltipId}
  >
    <svg className={css.barChart} viewBox="0 0 600 236" role="img" aria-label={title}>
      <line className={css.chartAxis} x1={plot.left} y1={plot.top + plot.height} x2={plot.left + plot.width} y2={plot.top + plot.height} />
      {categories.map((category, categoryIndex) => {
        const clusterLeft = plot.left + categoryIndex * groupWidth + (groupWidth - clusterWidth) / 2
        return <g key={category}>
          {series.map((item, seriesIndex) => {
            const value = item.values[categoryIndex] ?? 0
            const height = (value / maximum) * plot.height
            const x = clusterLeft + seriesIndex * barWidth + 1
            const y = plot.top + plot.height - height
            const target = {
              key: `${category}:${item.name}`,
              text: `${category} · ${item.name} ${String(value)}`,
              x: x + Math.max(1, barWidth - 2) / 2,
              y,
            }
            const actionTarget = {
              chartType: 'bar' as const, category, categoryIndex, series: item.name, seriesIndex, value,
            }
            return <rect
              key={item.name} className={css.chartBar} data-series={String(seriesIndex)} data-testid="bar-chart-bar"
              x={x} y={y} width={Math.max(1, barWidth - 2)} height={height} rx={2}
              tabIndex={0} aria-label={target.text}
              role={interaction === undefined ? undefined : 'button'} data-interactive={interaction === undefined ? undefined : 'true'}
              aria-describedby={tooltip?.key === target.key ? tooltipId : undefined}
              onMouseEnter={() => { setTooltip(target) }} onMouseLeave={() => { setTooltip(null) }}
              onFocus={() => { setTooltip(target) }} onBlur={() => { setTooltip(null) }}
              onClick={() => { activateChartTarget(interaction, context, actionTarget) }}
              onKeyDown={(event) => { handleChartKey(event, interaction, context, actionTarget) }}
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
export function LineChartView({ title, categories, series, emptyText, interaction, context }: BarChartProps) {
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null)
  const tooltipId = useId()
  if (categories.length === 0 || series.length === 0) return <div className={css.chartEmpty}>{emptyText}</div>
  const maximum = Math.max(1, ...series.flatMap(item => item.values))
  const plot = CHART_PLOT
  const x = (index: number): number => plot.left + (categories.length === 1
    ? plot.width / 2
    : (index / (categories.length - 1)) * plot.width)
  const y = (value: number): number => plot.top + plot.height - (value / maximum) * plot.height
  return <ChartFrame
    title={title} categories={categories} series={series} emptyText={emptyText}
    tooltip={tooltip} tooltipId={tooltipId}
  >
    <svg className={css.barChart} viewBox="0 0 600 236" role="img" aria-label={title}>
      <line className={css.chartAxis} x1={plot.left} y1={plot.top + plot.height} x2={plot.left + plot.width} y2={plot.top + plot.height} />
      {series.map((item, seriesIndex) => <g key={item.name}>
        <path
          className={css.chartLine} data-series={String(seriesIndex)} data-testid="line-chart-path"
          d={item.values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${String(x(index))} ${String(y(value))}`).join(' ')}
        />
        {item.values.map((value, index) => {
          const category = categories[index] ?? ''
          const target = {
            key: `${category}:${item.name}`,
            text: `${category} · ${item.name} ${String(value)}`,
            x: x(index),
            y: y(value),
          }
          const actionTarget = {
            chartType: 'line' as const, category, categoryIndex: index, series: item.name, seriesIndex, value,
          }
          return <circle
            key={category} className={css.chartPoint} data-series={String(seriesIndex)} data-testid="line-chart-point"
            cx={target.x} cy={target.y} r={3} tabIndex={0} aria-label={target.text}
            role={interaction === undefined ? undefined : 'button'} data-interactive={interaction === undefined ? undefined : 'true'}
            aria-describedby={tooltip?.key === target.key ? tooltipId : undefined}
            onMouseEnter={() => { setTooltip(target) }} onMouseLeave={() => { setTooltip(null) }}
            onFocus={() => { setTooltip(target) }} onBlur={() => { setTooltip(null) }}
            onClick={() => { activateChartTarget(interaction, context, actionTarget) }}
            onKeyDown={(event) => { handleChartKey(event, interaction, context, actionTarget) }}
          />
        })}
      </g>)}
      {categories.map((category, index) => <text
        key={category} className={css.chartCategory} x={x(index)} y={222} textAnchor="middle"
      >{category}</text>)}
    </svg>
  </ChartFrame>
}

/**
 * Render one bounded series as a Host-owned donut chart.
 * @param props - title, category labels, one numeric series, and caller-owned empty text.
 * @returns a themed SVG with focusable segments and local value tooltips.
 */
export function PieChartView({ title, categories, series, emptyText, interaction, context }: BarChartProps) {
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null)
  const tooltipId = useId()
  const [pieSeries] = series
  if (categories.length === 0 || pieSeries === undefined) return <div className={css.chartEmpty}>{emptyText}</div>
  const values = pieSeries.values
  const total = values.reduce((sum, value) => sum + value, 0)
  const radius = 70
  const circumference = 2 * Math.PI * radius
  let consumed = 0
  return <ChartFrame
    title={title} categories={categories} series={series} emptyText={emptyText}
    tooltip={tooltip} tooltipId={tooltipId} categoryLegend
  >
    <svg className={css.pieChart} viewBox="0 0 600 236" role="img" aria-label={title}>
      {values.map((value, index) => {
        const category = categories[index] ?? ''
        const fraction = value / total
        const length = fraction * circumference
        const midpoint = (consumed + fraction / 2) * Math.PI * 2 - Math.PI / 2
        const tooltipRadius = radius + 35
        const target = {
          key: category,
          text: `${category} · ${pieSeries.name} ${String(value)} · ${String(Math.round(fraction * 100))}%`,
          x: 300 + Math.cos(midpoint) * tooltipRadius,
          y: 118 + Math.sin(midpoint) * tooltipRadius,
        }
        const actionTarget = {
          chartType: 'pie' as const, category, categoryIndex: index,
          series: pieSeries.name, seriesIndex: 0, value, percentage: Math.round(fraction * 100),
        }
        const offset = -consumed * circumference
        consumed += fraction
        return <circle
          key={category} className={css.pieSegment} data-series={String(index)} data-testid="pie-chart-segment"
          cx={300} cy={118} r={radius} fill="none"
          strokeDasharray={`${String(length)} ${String(circumference - length)}`}
          strokeDashoffset={offset} transform="rotate(-90 300 118)"
          tabIndex={0} aria-label={target.text} aria-describedby={tooltip?.key === target.key ? tooltipId : undefined}
          role={interaction === undefined ? undefined : 'button'} data-interactive={interaction === undefined ? undefined : 'true'}
          onMouseEnter={() => { setTooltip(target) }} onMouseLeave={() => { setTooltip(null) }}
          onFocus={() => { setTooltip(target) }} onBlur={() => { setTooltip(null) }}
          onClick={() => { activateChartTarget(interaction, context, actionTarget) }}
          onKeyDown={(event) => { handleChartKey(event, interaction, context, actionTarget) }}
        />
      })}
      <text className={css.pieTotal} x={300} y={124} textAnchor="middle">{total}</text>
    </svg>
  </ChartFrame>
}

const chartString = z.string().min(1)
const barChartProps = z.strictObject({
  type: z.enum(['bar', 'line', 'pie']),
  title: chartString,
  categories: z.array(chartString).max(12),
  series: z.array(z.strictObject({
    name: chartString, values: z.array(z.number().min(0)).max(12),
  })).max(4),
  emptyText: chartString,
  interaction: z.strictObject({
    label: z.string().min(1).max(100),
    action: z.strictObject({ name: z.string().min(1).max(128) }),
  }).optional(),
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
})

const chart = createComponentImplementation({ name: 'Chart', schema: barChartProps }, ({ props, context }) => {
  const value = props as ChartProps
  if (value.type === 'bar') return <BarChartView {...value} context={context} />
  if (value.type === 'line') return <LineChartView {...value} context={context} />
  return <PieChartView {...value} context={context} />
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
  readonly selection?:
    | { readonly mode: 'single'; readonly label: string }
    | {
      readonly mode: 'multiple'
      readonly label: string
      readonly selectAllLabel: string
      readonly actionsLabel?: string
      readonly actions?: readonly {
        readonly label: string
        readonly name: string
        readonly variant?: 'default' | 'primary' | 'danger' | 'borderless'
        readonly confirm?: { readonly prompt: string; readonly confirmLabel: string; readonly cancelLabel: string }
      }[]
    }
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

function VisibleRowsCheckbox({
  label, checked, indeterminate, onChange,
}: {
  readonly label: string
  readonly checked: boolean
  readonly indeterminate: boolean
  readonly onChange: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (input.current !== null) input.current.indeterminate = indeterminate
  }, [indeterminate])
  return <input ref={input} type="checkbox" aria-label={label} checked={checked} onChange={onChange} />
}

/**
 * Render bounded scalar records as a semantic, horizontally scrollable table.
 * @param props - accessible label, columns, rows, and caller-owned empty text.
 * @returns one read-only table.
 */
export function DataTableView({
  label, columns, rows, emptyText, filter, selection, actionsLabel, rowActions = [], context,
}: DataTableProps & { readonly context?: DataTableContext }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null)
  const [pending, setPending] = useState<{ rowId: string; actionName: string } | null>(null)
  const [pendingBatch, setPendingBatch] = useState<string | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
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
  const rowLabel = (row: DataTableProps['rows'][number]): string => {
    const firstColumn = columns[0]
    return firstColumn === undefined ? row.id : cellText(row.cells[firstColumn.key]) || row.id
  }
  const toggleRow = (rowId: string): void => {
    setSelected((current) => {
      if (selection?.mode === 'single') return current.has(rowId) ? new Set() : new Set([rowId])
      const next = new Set(current)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every(row => selected.has(row.id))
  const someVisibleSelected = visibleRows.some(row => selected.has(row.id))
  const toggleVisibleRows = (): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (allVisibleSelected) for (const row of visibleRows) next.delete(row.id)
      else for (const row of visibleRows) next.add(row.id)
      return next
    })
  }
  const selectedRows = rows.filter(row => selected.has(row.id))
  const dispatchBatchAction = (name: string): void => {
    void context?.dispatchAction({ event: {
      name,
      context: {
        selectedRowIds: selectedRows.map(row => row.id),
        selectedRows: selectedRows.map(row => ({ id: row.id, cells: row.cells })),
      },
    } })
  }
  const columnCount = columns.length + (selection === undefined ? 0 : 1) + (rowActions.length === 0 ? 0 : 1)
  return <div className={css.tableShell}>
    {filter === undefined ? null : <div className={css.tableFilter}>
      <input
        type="search" value={query} placeholder={filter.placeholder} aria-label={filter.placeholder}
        onChange={(event) => { setQuery(event.currentTarget.value) }}
      />
      <button type="button" onClick={() => { setQuery('') }}>{filter.clearLabel}</button>
    </div>}
    {selection?.mode !== 'multiple' || selection.actions === undefined ? null : <div
      className={css.tableBatchActions} role="group" aria-label={selection.actionsLabel}
    >
      {selection.actions.map(action => <button
        key={action.name} type="button" disabled={selectedRows.length === 0}
        className={`${css.actionButton} ${ACTION_CLASS[action.variant ?? 'default'] ?? ''}`}
        onClick={() => {
          if (action.confirm === undefined) dispatchBatchAction(action.name)
          else setPendingBatch(action.name)
        }}
      >{action.label}</button>)}
      {selection.actions.map((action) => {
        if (action.confirm === undefined || pendingBatch !== action.name) return null
        return <div key={`${action.name}:confirm`} className={css.tableConfirm} role="group" aria-label={action.confirm.prompt}>
          <span>{action.confirm.prompt}</span>
          <button type="button" onClick={() => { setPendingBatch(null) }}>{action.confirm.cancelLabel}</button>
          <button type="button" onClick={() => {
            setPendingBatch(null)
            dispatchBatchAction(action.name)
          }}>{action.confirm.confirmLabel}</button>
        </div>
      })}
    </div>}
    <div className={css.tableScroll}>
      <table className={css.dataTable} aria-label={label}>
        <thead>
          <tr>{selection === undefined ? null : <th scope="col" className={css.tableSelection}>
            {selection.mode === 'multiple' ? <VisibleRowsCheckbox
              label={selection.selectAllLabel} checked={allVisibleSelected}
              indeterminate={someVisibleSelected && !allVisibleSelected} onChange={toggleVisibleRows}
            /> : <span className={css.visuallyHidden}>{selection.label}</span>}
          </th>}{columns.map(column => <th
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
          : visibleRows.map(row => <tr key={row.id} data-selected={selected.has(row.id) ? 'true' : undefined}>
            {selection === undefined ? null : <td className={css.tableSelection}>
              <input
                type={selection.mode === 'single' ? 'radio' : 'checkbox'}
                name={selection.mode === 'single' ? `${label}:selection` : undefined}
                aria-label={`${selection.label}：${rowLabel(row)}`} checked={selected.has(row.id)}
                onChange={() => { toggleRow(row.id) }}
              />
            </td>}{columns.map((column) => {
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
        if (names.has(action.name)) selectionCtx.addIssue({ code: 'custom', message: 'duplicate batch action name', path: ['actions', index, 'name'] })
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
