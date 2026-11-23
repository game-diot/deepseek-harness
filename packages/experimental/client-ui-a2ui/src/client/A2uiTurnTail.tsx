/** Completed-Turn A2UI cards outside the collapsible Tool process. */

import { lazy, Suspense } from 'react'
import type { ActionPayload } from '@a2ui/web_core/state'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

import type { NS } from './locales.ts'
import { formatA2uiActionMessage } from './action-message.ts'
import type { A2uiTurnTailData } from './turn-tail-projection.ts'
import css from './A2uiTurnTail.module.css'

const LazyA2uiRenderer = lazy(async () => ({ default: (await import('./A2uiRenderer.tsx')).A2uiRenderer }))

interface AtomicInputActions {
  readonly submitText?: (text: string) => boolean
}
interface A2uiTurnTailRuntimeProps {
  readonly turn: { readonly data: { get(key: 'a2ui-turn-tail'): Readonly<A2uiTurnTailData> | undefined } }
  readonly inputActions: AtomicInputActions

}
type A2uiTurnTailProps = A2uiTurnTailRuntimeProps & PropsLocale<typeof NS>

/** Submit one admitted Action through the native conversation input. */
export function submitA2uiAction(
  action: ActionPayload,
  inputActions: AtomicInputActions,
): boolean {
  const message = formatA2uiActionMessage(action)
  if (message === null) return false
  return inputActions.submitText?.(message) ?? false
}

interface A2uiTurnTailContentProps {
  readonly data: A2uiTurnTailData
  readonly inputActions: AtomicInputActions
  readonly t: A2uiTurnTailProps['t']
}

/** Render an admitted Turn projection with explicit input state. */
export function A2uiTurnTailContent({ data, inputActions, t }: A2uiTurnTailContentProps) {
  const submitAction = (action: ActionPayload): boolean => submitA2uiAction(action, inputActions)
  return <div className={css.root} data-a2ui-turn-tail="">
    {data.envelopes.map((metadata, index) => <Suspense key={`${metadata.protocol}:${index}`} fallback={<div>{t('loading')}</div>}>
      <LazyA2uiRenderer metadata={metadata} copy={{
        renderFailed: t('renderFailed'), actionUnavailable: t('actionUnavailable'),
        confirmRequired: t('confirmRequired'), confirm: t('confirm'), cancel: t('cancel'),
      }} onAction={submitAction} />
    </Suspense>)}
  </div>
}

/**
 * Render persisted A2UI metadata after its completed Turn.
 * @param props - Turn data and localized renderer copy.
 * @returns one independent renderer per accepted A2UI result, or null.
 */
export function A2uiTurnTail({ turn, t, inputActions }: A2uiTurnTailProps) {
  const data = turn.data.get('a2ui-turn-tail')
  if (data === undefined) return null
  return <A2uiTurnTailContent data={data} inputActions={inputActions} t={t} />
}
