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
let processErrorValue: unknown = new Error('invalid messages')
type A2uiMessages = readonly Record<string, unknown>[]
const messagesSent: A2uiMessages[] = []

vi.mock('@a2ui/web_core/v1_0', () => ({
  STRICT_VALIDATION: { strict: true },
  MessageProcessor: class {
    constructor(_catalogs: unknown[], action: (payload?: unknown) => void, options?: unknown) {
      processors.push({ action }); processorOptions.push(options)
    }
    processMessages = (...args: unknown[]) => {
      messagesSent.push(args[0] as A2uiMessages)
      processMessages(...args)
      if (processError) throw processErrorValue
    }
    getSurfaces = () => surfaces
    dispose = dispose
  },
}))
vi.mock('../src/client/catalogs.ts', () => ({ catalogs: [], TASK_CATALOG_ID: 'https://dsh.dev/a2ui/catalogs/task/v1' }))
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
  actionSent: 'Sent:',
  incrementalUnavailable: 'This result only updates an existing Surface.',
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

  it('shows why the renderer rejected a payload', async () => {
    const { A2uiRenderer } = await import('../src/client/A2uiRenderer.tsx')
    processError = true
    const { container } = render(<A2uiRenderer metadata={metadata} copy={copy} />)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(copy.renderFailed)
    expect(container.querySelector('pre')?.textContent).toBe('invalid messages')
  })

  it('keeps a non-Error rejection and a long rejection readable', async () => {
    const { A2uiRenderer } = await import('../src/client/A2uiRenderer.tsx')
    processError = true
    processErrorValue = 'plain string failure'
    const plain = render(<A2uiRenderer metadata={metadata} copy={copy} />)
    expect(plain.container.querySelector('pre')?.textContent).toBe('plain string failure')
    plain.unmount()

    processErrorValue = 'x'.repeat(500)
    const long = render(<A2uiRenderer metadata={metadata} copy={copy} />)
    expect(long.container.querySelector('pre')?.textContent).toBe(`${'x'.repeat(400)}…`)
  })

  it('repairs a legacy variant inside both message kinds and leaves other messages alone', async () => {
    const { A2uiRenderer } = await import('../src/client/A2uiRenderer.tsx')
    surfaces = new Map()
    const mixed = {
      protocol: 'a2ui/v1' as const,
      messages: [
        { version: '1.0' as const, createSurface: { surfaceId: 's', components: [
          { id: 'pic', component: 'Image', url: 'https://example.com/a.png', variant: 'hero' },
        ] } },
        { version: '1.0' as const, updateComponents: { surfaceId: 's', components: [
          { id: 'pic', component: 'Image', url: 'https://example.com/b.png', variant: 'hero' },
        ] } },
        { version: '1.0' as const, deleteSurface: { surfaceId: 's' } },
      ],
    }
    const view = render(<A2uiRenderer metadata={mixed} copy={copy} />)
    expect(messagesSent.at(-1)).toMatchObject([
      { createSurface: { components: [{ variant: 'header' }] } },
      { updateComponents: { components: [{ variant: 'header' }] } },
      { deleteSurface: { surfaceId: 's' } },
    ])
    view.unmount()

    messagesSent.length = 0
    surfaces = new Map()
    const untouched = {
      protocol: 'a2ui/v1' as const,
      messages: [
        { version: '1.0' as const, createSurface: { surfaceId: 's', components: [
          { id: 'pic', component: 'Image', url: 'https://example.com/a.png', variant: 'avatar' },
        ] } },
        { version: '1.0' as const, deleteSurface: { surfaceId: 's' } },
      ],
    }
    render(<A2uiRenderer metadata={untouched} copy={copy} />)
    expect(messagesSent.at(-1)).toEqual(untouched.messages)
  })

  it('recovers a legacy Image variant the renderer rejects', async () => {
    const { A2uiRenderer } = await import('../src/client/A2uiRenderer.tsx')
    const legacy = {
      protocol: 'a2ui/v1' as const,
      messages: [{
        version: '1.0' as const,
        createSurface: {
          surfaceId: 'legacy-hero',
          components: [{ id: 'root', component: 'Image', url: 'https://example.com/x.png', variant: 'hero' }],
        },
      }],
    }
    const { container } = render(<A2uiRenderer metadata={legacy} copy={copy} />)
    // The SDK rejects `hero`, so a rendered surface proves the variant was recovered.
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('explains a result that only updates an existing Surface', async () => {
    const { A2uiRenderer } = await import('../src/client/A2uiRenderer.tsx')
    const incremental = {
      protocol: 'a2ui/v1' as const,
      messages: [{ version: '1.0' as const, updateComponents: { surfaceId: 'card', components: [] } }],
    }
    const view = render(<A2uiRenderer metadata={incremental} copy={copy} />)
    expect(view.getByRole('alert').textContent).toBe(copy.incrementalUnavailable)
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
    // The card confirms the action locally so the click has visible feedback.
    expect(view.getByRole('status').textContent).toBe(`${copy.actionSent}confirm`)
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
    expect(invalid.getByRole('alert').textContent).toContain(copy.renderFailed)
    invalid.unmount()

    processError = false
    surfaces = new Map()
    const empty = render(<A2uiRenderer metadata={metadata} copy={copy} />)
    expect(empty.getByRole('alert').textContent).toContain(copy.renderFailed)
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
