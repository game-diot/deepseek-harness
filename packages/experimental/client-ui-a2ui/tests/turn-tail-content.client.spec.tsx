// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { A2uiClientEnvelope } from '../src/client/metadata.ts'
import { en } from '../src/client/locales.ts'

vi.mock('../src/client/A2uiRenderer.tsx', () => ({
  A2uiRenderer: ({ metadata, onAction }: {
    metadata: A2uiClientEnvelope
    onAction: (action: { name: string; surfaceId: string; sourceComponentId: string; timestamp: string; context: object }) => boolean
  }) => <button onClick={() => onAction({
    name: 'confirm', surfaceId: 'card', sourceComponentId: 'button', timestamp: '2026-11-19T00:00:00Z', context: {},
  })}>{metadata.messages[0]?.version}</button>,
}))

const envelope: A2uiClientEnvelope = {
  protocol: 'a2ui/v1', messages: [{ version: '1.0', createSurface: { surfaceId: 'card' } }],
}
const t = makeTranslate(en)

afterEach(cleanup)

describe('A2UI Turn-tail content', () => {
  it('renders every projected envelope and submits admitted actions', async () => {
    const inputActions = { submitText: vi.fn(() => true) }
    const { A2uiTurnTailContent } = await import('../src/client/A2uiTurnTail.tsx')
    const view = render(<A2uiTurnTailContent data={{ envelopes: [envelope, envelope] }} inputActions={inputActions} t={t} />)

    expect(await view.findAllByRole('button', { name: '1.0' })).toHaveLength(2)
    fireEvent.click(view.getAllByRole('button')[0]!)
    expect(inputActions.submitText).toHaveBeenCalledOnce()
  })

  it('renders an empty projection and delegates rejection to the atomic input action', async () => {
    const inputActions = { submitText: vi.fn(() => false) }
    const { A2uiTurnTailContent } = await import('../src/client/A2uiTurnTail.tsx')
    const empty = render(<A2uiTurnTailContent data={{ envelopes: [] }} inputActions={inputActions} t={t} />)
    expect(empty.container.querySelector('[data-a2ui-turn-tail]')).toBeTruthy()
    empty.unmount()

    const busy = render(<A2uiTurnTailContent data={{ envelopes: [envelope] }} inputActions={inputActions} t={t} />)
    fireEvent.click(await busy.findByRole('button'))
    expect(inputActions.submitText).toHaveBeenCalledOnce()
  })

  it('adapts Turn data into content or no contribution', async () => {
    const inputActions = { submitText: vi.fn(() => true) }
    const { A2uiTurnTail } = await import('../src/client/A2uiTurnTail.tsx')
    const absent = render(<A2uiTurnTail turn={{ data: { get: () => undefined } }} inputActions={inputActions} t={t} />)
    expect(absent.container.textContent).toBe('')
    absent.unmount()

    const present = render(<A2uiTurnTail
      turn={{ data: { get: () => ({ envelopes: [envelope] }) } }} inputActions={inputActions} t={t}
    />)
    fireEvent.click(await present.findByRole('button'))
    expect(inputActions.submitText).toHaveBeenCalledOnce()
  })
})
