/** One isolated A2UI processor and its rendered Surfaces. */

import { useEffect, useInsertionEffect, useRef, useState } from 'react'
import { A2uiSurface, MarkdownComponentContext, type ReactCatalogComponent } from '@a2ui/react'
import { SafeMarkdown } from './Markdown.tsx'
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
}

interface A2uiRendererProps {
  readonly metadata: A2uiClientEnvelope
  readonly copy: RendererCopy
  /** Admit an action into the owning application. False keeps the local fallback visible. */
  readonly onAction?: (action: ActionPayload) => boolean
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
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const [state, setState] = useState<RendererState>()
  useInsertionEffect(() => acquireStyles(), [])
  useEffect(() => {
    const processor = new MessageProcessor<ReactCatalogComponent>([basicCatalog], (action) => {
      const handler = onActionRef.current
      if (handler !== undefined && handler(action)) {
        setActionNotice(undefined)
        return
      }
      setActionNotice(copy.actionUnavailable)
    }, { validationConfig: STRICT_VALIDATION })
    try {
      processor.processMessages(metadata.messages as ProcessableMessagePayload)
      setState({ processor, surfaces: [...processor.getSurfaces().values()], error: false })
    } catch {
      setState({ processor, surfaces: [], error: true })
    }
    return () => { processor.dispose() }
  }, [metadata.messages])

  if (state === undefined) return <div className={css.root}>{copy.loading ?? ''}</div>
  if (state.error) return <div role="alert" className={css.error}>{copy.renderFailed}</div>
  if (state.surfaces.length === 0) return <div role="alert" className={css.error}>{copy.renderFailed}</div>
  return <div className={css.root}>
    <MarkdownComponentContext.Provider value={SafeMarkdown}>
      {state.surfaces.map(surface => surface === undefined ? null : <A2uiSurface key={surface.id} surface={surface} />)}
    </MarkdownComponentContext.Provider>
    {actionNotice !== undefined && <div role="status" className={css.notice}>{actionNotice}</div>}
  </div>
}
