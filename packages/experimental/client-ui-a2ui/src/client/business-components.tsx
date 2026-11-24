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
export const taskComponents = [badge, taskCard, statistic] as const

/** Children a Surface may place inside a business component. */
export type BusinessComponentChild = ReactNode
