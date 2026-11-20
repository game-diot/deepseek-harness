// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SafeMarkdown } from '../src/client/Markdown.tsx'

afterEach(cleanup)

describe('A2UI Text markdown subset', () => {
  it('renders strong, emphasis, and code spans', () => {
    const { container } = render(
      <SafeMarkdown markdown={'**bold** and *em* and `code` and __strong__ and _em_'} />,
    )
    expect(container.querySelectorAll('strong')).toHaveLength(2)
    expect(container.querySelectorAll('em')).toHaveLength(2)
    expect(container.querySelector('code')?.textContent).toBe('code')
  })

  it('keeps HTML, links, and images as literal text', () => {
    const { container } = render(
      <SafeMarkdown markdown={'<img src=x onerror=alert(1)> [link](https://example.com) ![alt](x.png)'} />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(container.textContent).toContain('[link](https://example.com)')
  })

  it('keeps line breaks and empty input', () => {
    const { container } = render(<SafeMarkdown markdown={'first\nsecond'} />)
    expect(container.querySelectorAll('br')).toHaveLength(1)
    expect(container.textContent).toBe('firstsecond')

    const empty = render(<SafeMarkdown markdown={''} />)
    expect(empty.container.textContent).toBe('')
  })
})
