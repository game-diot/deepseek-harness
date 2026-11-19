// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SessionInputShell } from '../src/client/input/facade.ts'

function shell() {
  const defaultSink = vi.fn(() => Promise.resolve({ kind: 'success' as const }))
  const input = new SessionInputShell({
    actx: new Context(), defaultSink,
    commandAttachments: { serialize: async () => [], release: () => {}, unsupportedNotice: () => '' },
  })
  return { input, defaultSink }
}

describe('atomic text submission', () => {
  it('sets and submits one nonblank text only from an idle empty input', () => {
    const { input } = shell()
    expect(input.actions.submitText?.('hello')).toBe(true)
    expect(input.actions.submitText?.('again')).toBe(false)
  })

  it('does not replace an existing draft or admit blank text', () => {
    const { input } = shell()
    input.actions.setDraft('mine')
    expect(input.actions.submitText?.('action')).toBe(false)
    expect(input.state.getSnapshot().draft).toBe('mine')

    input.actions.setDraft('')
    expect(input.actions.submitText?.('   ')).toBe(false)
  })
})
