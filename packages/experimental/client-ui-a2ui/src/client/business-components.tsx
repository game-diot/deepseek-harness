/**
 * Business components this renderer adds beside the A2UI Basic Catalog.
 *
 * The model describes them; the design system lives here. Each entry owns its
 * CSS Module and reads `--dsw-*` tokens, so a Surface cannot choose colours,
 * fonts, or spacing, and a redesign changes these files rather than a prompt.
 */

import type { ReactNode } from 'react'
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
export const taskComponents = [actionButton, badge, taskCard, statistic] as const

/** Children a Surface may place inside a business component. */
export type BusinessComponentChild = ReactNode
