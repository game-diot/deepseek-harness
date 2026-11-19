/** A2UI tool status, safe metadata admission, and visible fallback result. */

import { DisclosureRow, IconSparkleRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallPhaseProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { parseA2uiMetadata } from './metadata.ts'
import type { NS } from './locales.ts'
import css from './A2uiToolRow.module.css'

type A2uiToolRowProps = ToolCallPhaseProps & PropsLocale<typeof NS>

/* v8 ignore next -- Non-expandable B1 rows never invoke DisclosureRow's required toggle callback. */
const noop = (): void => undefined


function resultText(block: Extract<A2uiToolRowProps, { phase: 'result' }>['block']): string {
  return block.content.flatMap(item => item.type === 'text' ? [item.text] : []).join('\n')
}

/**
 * Render A2UI preparation, admitted metadata, or a visible raw-result fallback.
 * @param props - current Tool phase and localized copy.
 * @returns a compact status row that never hides malformed historical data.
 */
export function A2uiToolRow(props: A2uiToolRowProps) {
  if (props.phase === 'preparing') {
    return <div className={css.root} data-tool="a2ui_render" data-state="preparing">
      <DisclosureRow title={props.t('title')} icon={<IconSparkleRegular size={14} />}
        open={false} expandable={false} onToggle={noop} running
        collapsedContent={<span className={css.summary}>{props.t('preparing')}</span>} />
    </div>
  }
  if (props.phase === 'start') {
    return <div className={css.root} data-tool="a2ui_render" data-state="running">
      <DisclosureRow title={props.t('title')} icon={<IconSparkleRegular size={14} />}
        open={false} expandable={false} onToggle={noop} running
        collapsedContent={<span className={css.summary}>{props.t('running')}</span>} />
    </div>
  }
  const output = resultText(props.block)
  const metadata = props.block.isError ? null : parseA2uiMetadata(props.block.meta)
  const failed = props.block.isError
  const status = failed ? props.t('failed') : metadata === null ? props.t('invalid') : props.t('ready')
  return <div className={css.root} data-tool="a2ui_render" data-state={failed ? 'error' : metadata === null ? 'invalid' : 'ready'}>
    <DisclosureRow title={props.t('title')} icon={<IconSparkleRegular size={14} />}
      open={output !== ''} expandable={false} onToggle={noop}
      keepContentWhenOpen
      collapsedContent={<span className={`${css.summary} ${failed || metadata === null ? css.error : ''}`}
        role={failed || metadata === null ? 'alert' : undefined}>{status}</span>}>
      {output !== '' && <pre className={css.output}>{output}</pre>}
    </DisclosureRow>
  </div>
}
