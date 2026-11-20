/** Inline Markdown subset for the Basic Catalog `Text` component. */

import { Fragment, type ReactNode } from 'react'
import type { MarkdownComponentProps } from '@a2ui/react'

/** Emphasis, strong, and code spans; raw HTML stays literal text. */
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/g

function inline(line: string, keyPrefix: string): ReactNode[] {
  return line.split(INLINE).map((part, index) => {
    const key = `${keyPrefix}-${String(index)}`
    if (part.length > 4 && ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__')))) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      return <code key={key}>{part.slice(1, -1)}</code>
    }
    if (part.length > 2 && ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_')))) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    return part
  })
}

/**
 * Render one Basic Catalog `Text` payload with the inline subset this catalog admits.
 * @param props - the Markdown payload the catalog passes to a Text renderer.
 * @returns React nodes; HTML, images, and links stay literal text.
 */
export function SafeMarkdown({ markdown }: MarkdownComponentProps) {
  const lines = markdown.split('\n')
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 && <br />}
          {inline(line, String(index))}
        </Fragment>
      ))}
    </>
  )
}
