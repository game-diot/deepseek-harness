import { describe, expect, it, vi } from 'vitest'
import { submitA2uiAction } from '../src/client/A2uiTurnTail.tsx'

const action = {
  name: 'confirm', surfaceId: 'card', sourceComponentId: 'button',
  timestamp: '2026-11-19T00:00:00Z', context: {},
}

describe('A2UI Turn-tail action submission', () => {
  it('submits admitted actions through the native input', () => {
    const inputActions = { submitText: vi.fn(() => true) }
    expect(submitA2uiAction(action, inputActions)).toBe(true)
    expect(inputActions.submitText).toHaveBeenCalledWith(expect.stringContaining('"name":"confirm"'))
  })

  it('does not replace a busy draft or submit invalid action data', () => {
    const inputActions = { submitText: vi.fn(() => false) }
    expect(submitA2uiAction(action, inputActions)).toBe(false)
    expect(submitA2uiAction({ ...action, name: '' }, inputActions)).toBe(false)
    expect(inputActions.submitText).toHaveBeenCalledOnce()
    expect(submitA2uiAction(action, {})).toBe(false)
  })
})
