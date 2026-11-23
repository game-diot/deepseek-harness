// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { A2uiClientEnvelope } from '../src/client/metadata.ts'

const dispose = vi.fn()
const processMessages = vi.fn()
const injectStyles = vi.fn()
const removeStyles = vi.fn()
const processors: { action: (payload?: unknown) => void }[] = []
const processorOptions: unknown[] = []
let surfaces = new Map<string, { id: string } | undefined>([['card', { id: 'card' }]])
let processError = false

vi.mock('@a2ui/web_core/v1_0', () => ({
  STRICT_VALIDATION: { strict: true },
  MessageProcessor: class {
    constructor(_catalogs: unknown[], action: (payload?: unknown) => void, options?: unknown) {
      processors.push({ action }); processorOptions.push(options)
    }
    processMessages = (...args: unknown[]) => {
      processMessages(...args)
      if (processError) throw new Error('invalid messages')
    }
    getSurfaces = () => surfaces
    dispose = dispose
  },
}))
vi.mock('@a2ui/web_core/catalogs/basic/v1', () => ({ basicCatalog: {}, injectBasicCatalogStyles: vi.fn() }))
vi.mock('@a2ui/react', () => ({
  A2uiSurface: ({ surface }: { surface: { id: string } }) => <button onClick={() => processors.at(-1)?.action({
    name: 'confirm', surfaceId: 'card', sourceComponentId: 'button', timestamp: '2026-11-19T00:00:00Z',
    context: {}, userMessage: 'Confirm the task',
  })}>{surface.id}</button>,
  MarkdownComponentContext: { Provider: ({ children }: { children?: ReactNode }) => <>{children}</> },
}))
vi.mock('@a2ui/react/styles', () => ({ injectStyles, removeStyles }))

const metadata: A2uiClientEnvelope = {
  protocol: 'a2ui/v1',
  messages: [{ version: '1.0', createSurface: { surfaceId: 'card' } }],
}

const copy = {
  renderFailed: 'This A2UI result cannot be rendered.',
  actionUnavailable: 'This action is not connected to the Agent yet.',
  confirmRequired: 'This action needs your confirmation.',
  confirm: 'Confirm',
  cancel: 'Cancel',
}

afterEach(() => {
  cleanup()
  dispose.mockClear()
  processMessages.mockClear()
  injectStyles.mockClear()
  removeStyles.mockClear()
  processors.length = 0
  processorOptions.length = 0
  surfaces = new Map([['card', { id: 'card' }]])
  processError = false
})

describe('A2UI lazy renderer', () => {
  it('processes persisted messages and renders every resulting Surface', async () => {
    const { A2uiRenderer } = await import('../src/client/A2uiRenderer.tsx')
    const view = render(<A2uiRenderer metadata={metadata} copy={copy} />)

    expect(processMessages).toHaveBeenCalledWith(metadata.messages)
    expect(processorOptions[0]).toEqual({ validationConfig: { strict: true } })
    expect(view.getByRole('button', { name: 'card' })).toBeTruthy()
  })

  it('keeps actions local and disposes its own processor', async () => {
    const { A2uiRenderer } = await import('../src/client/A2uiRenderer.tsx')
    const view = render(<A2uiRenderer metadata={metadata} copy={copy} />)

    fireEvent.click(view.getByRole('button', { name: 'card' }))
    expect(view.getByRole('status').textContent).toContain(copy.actionUnavailable)

    view.unmount()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('confirms a gated action before forwarding it', async () => {
    const onAction = vi.fn(() => true)
    const { A2uiRenderer } = await import('../src/client/A2uiRenderer.tsx')
    const gated = { ...metadata, approval: ['confirm'] }
    const view = render(<A2uiRenderer metadata={gated} copy={copy} onAction={onAction} />)

    fireEvent.click(view.getByRole('button', { name: 'card' }))
    expect(onAction).not.toHaveBeenCalled()
    expect(view.getByText(copy.confirmRequired)).toBeTruthy()

    fireEvent.click(view.getByRole('button', { name: copy.cancel }))
    expect(onAction).not.toHaveBeenCalled()
    expect(view.queryByText(copy.confirmRequired)).toBeNull()

    fireEvent.click(view.getByRole('button', { name: 'card' }))
    fireEvent.click(view.getByRole('button', { name: copy.confirm }))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ userMessage: 'Confirm the task' }))
  })

  it('forwards a standard action to an admitted Turn-tail handler', async () => {
    const onAction = vi.fn(() => true)
    const { A2uiRenderer } = await import('../src/client/A2uiRenderer.tsx')
    const view = render(<A2uiRenderer metadata={metadata} copy={copy} onAction={onAction} />)

    fireEvent.click(view.getByRole('button', { name: 'card' }))

    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ userMessage: 'Confirm the task' }))
    expect(view.queryByRole('status')).toBeNull()
  })

  it('creates an isolated processor for every mounted card', async () => {
    const { A2uiRenderer } = await import('../src/client/A2uiRenderer.tsx')
    const first = render(<A2uiRenderer metadata={metadata} copy={copy} />)
    const second = render(<A2uiRenderer metadata={metadata} copy={copy} />)

    expect(processors).toHaveLength(2)
    expect(injectStyles).toHaveBeenCalledOnce()
    first.unmount()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(removeStyles).not.toHaveBeenCalled()
    second.unmount()
    expect(dispose).toHaveBeenCalledTimes(2)
    expect(removeStyles).toHaveBeenCalledOnce()
  })

  it('shows a visible failure for invalid messages or no resulting Surface', async () => {
    const { A2uiRenderer } = await import('../src/client/A2uiRenderer.tsx')
    processError = true
    const invalid = render(<A2uiRenderer metadata={metadata} copy={copy} />)
    expect(invalid.getByRole('alert').textContent).toBe(copy.renderFailed)
    invalid.unmount()

    processError = false
    surfaces = new Map()
    const empty = render(<A2uiRenderer metadata={metadata} copy={copy} />)
    expect(empty.getByRole('alert').textContent).toBe(copy.renderFailed)
  })

  it('ignores an undefined Surface while rendering valid siblings', async () => {
    surfaces = new Map([['missing', undefined], ['card', { id: 'card' }]])
    const { A2uiRenderer } = await import('../src/client/A2uiRenderer.tsx')
    const view = render(<A2uiRenderer metadata={metadata} copy={copy} />)
    expect(view.getByRole('button', { name: 'card' })).toBeTruthy()
  })

  it('pairs every committed processor under React Strict Mode', async () => {
    const { A2uiRenderer } = await import('../src/client/A2uiRenderer.tsx')
    const view = render(<StrictMode><A2uiRenderer metadata={metadata} copy={copy} /></StrictMode>)
    expect(processors).toHaveLength(2)
    expect(dispose).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(dispose).toHaveBeenCalledTimes(2)
    expect(removeStyles).toHaveBeenCalledOnce()
  })
})
