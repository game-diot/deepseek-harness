// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { PartialArguments } from '@deepseek-ai/dsh-util-values'
import { A2uiToolRow } from '../src/client/A2uiToolRow.tsx'
import { en } from '../src/client/locales.ts'

const english: Readonly<Record<string, string>> = en
const t: TranslateNS<'a2ui.client'> = key => english[key] ?? key

function result(meta: unknown, content = 'Accepted one A2UI message for a compatible renderer.'): ToolResultNode {
  return {
    kind: 'tool-result', seq: 2, time: 2_000, callId: 'a2ui-call', name: 'a2ui_render',
    args: PartialArguments.EMPTY,
    call: { name: 'a2ui_render', argsRaw: '{"messages":[]}' }, callTime: 1_000,
    content: [{ type: 'text', text: content }], isError: false, meta, subCalls: [],
  }
}

const valid = {
  protocol: 'a2ui/v1',
  messages: [{
    version: '1.0',
    createSurface: {
      surfaceId: 'card',
      catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
      components: [{ id: 'root', component: 'Text', text: 'Hello' }],
    },
  }],
}

afterEach(cleanup)

describe('A2UI Tool row B1 fallback', () => {
  it('shows an explicit waiting state for admitted metadata', () => {
    const view = render(<A2uiToolRow phase="result" block={result(valid)} t={t} />)

    expect(view.getByText('A2UI interface')).toBeTruthy()
    expect(view.getByText('Interface data is ready.')).toBeTruthy()
    expect(view.queryByText('Loading A2UI interface…')).toBeNull()
    expect(view.queryByRole('alert')).toBeNull()
  })

  it('keeps the raw result visible when metadata is malformed', () => {
    const view = render(<A2uiToolRow phase="result" block={result({ protocol: 'a2ui/v0' }, 'raw result')} t={t} />)

    expect(view.getByRole('alert').textContent).toContain('This A2UI result cannot be rendered.')
    expect(view.getByText('raw result')).toBeTruthy()
  })

  it('keeps a failed tool result visible', () => {
    const block = result(undefined, 'invalid arguments')
    block.isError = true
    block.error = { name: 'ToolArgsError', code: 'INVALID_ARGS' }
    const view = render(<A2uiToolRow phase="result" block={block} t={t} />)

    expect(view.getByRole('alert').textContent).toContain('The A2UI request failed.')
    expect(view.getByText('invalid arguments')).toBeTruthy()
  })

  it('shows preparation without interpreting metadata', () => {
    const view = render(<A2uiToolRow phase="preparing" block={{
      phase: 'preparing', callId: 'a2ui-call', name: 'a2ui_render', args: PartialArguments.EMPTY,
      turn: 1, step: 1, time: 1_000, subCalls: [],
    }} t={t} />)

    expect(view.container.textContent).toContain('Preparing A2UI interface data…')
  })

  it('shows a dispatched call as running', () => {
    const view = render(<A2uiToolRow phase="start" block={{
      phase: 'start', callId: 'a2ui-call', name: 'a2ui_render', args: PartialArguments.EMPTY,
      argsRaw: '{"messages":[]}', turn: 1, step: 1, time: 1_000, subCalls: [],
    }} t={t} />)

    expect(view.container.textContent).toContain('Validating A2UI interface data…')
  })

  it('keeps an invalid empty result visible without opening a body', () => {
    const view = render(<A2uiToolRow phase="result" block={result(undefined, '')} t={t} />)

    expect(view.getByRole('alert').textContent).toContain('This A2UI result cannot be rendered.')
    expect(view.container.querySelector('pre')).toBeNull()
  })

  it('ignores non-text result blocks in the raw fallback body', () => {
    const block = result(undefined, 'visible text')
    block.content = [...block.content, { type: 'future-block', value: 'hidden' } as never]
    const view = render(<A2uiToolRow phase="result" block={block} t={t} />)

    expect(view.getByText('visible text')).toBeTruthy()
    expect(view.queryByText('hidden')).toBeNull()
  })
})
