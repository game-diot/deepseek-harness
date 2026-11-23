/** One isolated A2UI processor and its rendered Surfaces. */

import { useEffect, useInsertionEffect, useRef, useState } from 'react'
import { A2uiSurface, MarkdownComponentContext, type ReactCatalogComponent } from '@a2ui/react'
import { SafeMarkdown } from './Markdown.tsx'
import { readSurfaceTheme, surfaceThemeStyle } from './theme.ts'
import { injectStyles, removeStyles } from '@a2ui/react/styles'
import { MessageProcessor, STRICT_VALIDATION, type ProcessableMessagePayload } from '@a2ui/web_core/v1_0'
import { basicCatalog } from '@a2ui/web_core/catalogs/basic/v1'
import type { ActionPayload } from '@a2ui/web_core/state'
import type { A2uiClientEnvelope } from './metadata.ts'
import css from './A2uiRenderer.module.css'

interface RendererCopy {
  readonly loading?: string
  readonly renderFailed: string
  readonly actionUnavailable: string
  /** Shown when a result only updates a Surface this renderer never created. */
  readonly incrementalUnavailable: string
  /** Copy for an action that needs explicit confirmation before it is submitted. */
  readonly confirmRequired: string
  readonly confirm: string
  readonly cancel: string
}

interface A2uiRendererProps {
  readonly metadata: A2uiClientEnvelope
  readonly copy: RendererCopy
  /** Admit an action into the owning application. False keeps the local fallback visible. */
  readonly onAction?: (action: ActionPayload) => boolean
}

/** Variant an earlier schema admitted for `Image`, which the renderer rejects. */
const LEGACY_IMAGE_VARIANT = 'hero'

function isLegacyImage(component: unknown): boolean {
  if (typeof component !== 'object' || component === null) return false
  const record = component as { component?: unknown; variant?: unknown }
  return record.component === 'Image' && record.variant === LEGACY_IMAGE_VARIANT
}

function repairBatch(batch: { readonly components?: readonly unknown[] } | undefined): unknown[] | undefined {
  if (batch === undefined || !Array.isArray(batch.components)) return undefined
  const components: readonly unknown[] = batch.components
  if (!components.some(isLegacyImage)) return undefined
  const repaired: unknown[] = components.map(component => (
    isLegacyImage(component)
      ? { ...(component as Record<string, unknown>), variant: 'header' }
      : component
  ))
  return repaired
}

/**
 * Repair data written by an earlier schema that admitted `hero` for `Image.variant`,
 * which the renderer rejects, so historical cards keep rendering.
 * @param messages - persisted messages about to be validated.
 * @returns the messages with recovered variants.
 */
function recoverLegacyVariants(messages: A2uiClientEnvelope['messages']): A2uiClientEnvelope['messages'] {
  return messages.map((message) => {
    const record = message as {
      readonly createSurface?: { readonly components?: readonly unknown[] }
      readonly updateComponents?: { readonly components?: readonly unknown[] }
    }
    const surface = repairBatch(record.createSurface)
    const batch = repairBatch(record.updateComponents)
    if (surface === undefined && batch === undefined) return message
    return {
      ...message,
      ...surface === undefined ? {} : { createSurface: { ...record.createSurface, components: surface } },
      ...batch === undefined ? {} : { updateComponents: { ...record.updateComponents, components: batch } },
    } as A2uiClientEnvelope['messages'][number]
  })
}

interface RendererState {
  readonly processor: MessageProcessor<ReactCatalogComponent>
  readonly surfaces: ReturnType<MessageProcessor<ReactCatalogComponent>['getSurface']>[]
  readonly error: boolean
}

let styleUsers = 0

function acquireStyles(): () => void {
  const first = styleUsers === 0
  styleUsers += 1
  if (first) injectStyles()
  return () => {
    styleUsers -= 1
    if (styleUsers !== 0) return
    removeStyles()
  }
}

/**
 * Render one persisted A2UI envelope with a card-owned processor.
 * @param props - admitted messages and localized fallback copy.
 * @returns rendered Surfaces, a local action notice, or a visible validation failure.
 */
export function A2uiRenderer({ metadata, copy, onAction }: A2uiRendererProps) {
  const [actionNotice, setActionNotice] = useState<string>()
  const [pendingAction, setPendingAction] = useState<ActionPayload>()
  const approval = new Set(metadata.approval ?? [])
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const [state, setState] = useState<RendererState>()
  const incrementalOnly = !metadata.messages.some(message => 'createSurface' in message)
  useInsertionEffect(() => acquireStyles(), [])
  useEffect(() => {
    if (incrementalOnly) return
    const processor = new MessageProcessor<ReactCatalogComponent>([basicCatalog], (action) => {
      if (approval.has(action.name)) {
        setPendingAction(action)
        return
      }
      const handler = onActionRef.current
      if (handler !== undefined && handler(action)) {
        setActionNotice(undefined)
        return
      }
      setActionNotice(copy.actionUnavailable)
    }, { validationConfig: STRICT_VALIDATION })
    try {
      processor.processMessages(recoverLegacyVariants(metadata.messages) as ProcessableMessagePayload)
      setState({ processor, surfaces: [...processor.getSurfaces().values()], error: false })
    } catch {
      setState({ processor, surfaces: [], error: true })
    }
    return () => { processor.dispose() }
  }, [metadata.messages, incrementalOnly])

  if (incrementalOnly) return <div role="alert" className={css.error}>{copy.incrementalUnavailable}</div>
  if (state === undefined) return <div className={css.root}>{copy.loading ?? ''}</div>
  if (state.error) return <div role="alert" className={css.error}>{copy.renderFailed}</div>
  if (state.surfaces.length === 0) return <div role="alert" className={css.error}>{copy.renderFailed}</div>
  const theme = readSurfaceTheme(metadata.messages)
  const themed = surfaceThemeStyle(theme)
  return <div className={css.root}>
    <div className={css.surfaceHost} data-tone={themed.tone} style={{ ...themed.vars }}>
      <MarkdownComponentContext.Provider value={SafeMarkdown}>
        {state.surfaces.map(surface => surface === undefined ? null : <A2uiSurface key={surface.id} surface={surface} />)}
      </MarkdownComponentContext.Provider>
    </div>
    {pendingAction !== undefined && <div role="group" className={css.notice}>
      <span>{copy.confirmRequired}</span>
      <button type="button" onClick={() => {
        const action = pendingAction
        setPendingAction(undefined)
        const handler = onActionRef.current
        if (handler !== undefined && handler(action)) {
          setActionNotice(undefined)
          return
        }
        setActionNotice(copy.actionUnavailable)
      }}>{copy.confirm}</button>
      <button type="button" onClick={() => { setPendingAction(undefined) }}>{copy.cancel}</button>
    </div>}
    {actionNotice !== undefined && <div role="status" className={css.notice}>{actionNotice}</div>}
  </div>
}
