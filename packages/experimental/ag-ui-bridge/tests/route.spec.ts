import { EventEmitter } from 'node:events'
import { PassThrough, Readable } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import type { CreateAgentOptions } from '@deepseek-ai/dsh-agent'
import { WebServer, type WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { AgentRegistry, type AgentHandle } from '@deepseek-ai/dsh-agent'
import { describe, expect, it, vi } from 'vitest'
import { apply, type Config } from '../src/index.ts'

class ResponseFixture extends EventEmitter {
  status = 0
  headers: Record<string, string> = {}
  body = ''
  writableEnded = false
  writable = true
  writeHead(status: number, headers: Record<string, string> = {}) { this.status = status; this.headers = headers; return this }
  write(chunk: string) { this.body += chunk; return this.writable }
  end(chunk = '') { this.body += chunk; this.writableEnded = true; this.emit('finish'); return this }
}

function request(method: string, body = '') {
  const req = Readable.from(body === '' ? [] : [Buffer.from(body)])
  return Object.assign(req, { method, headers: { accept: 'text/event-stream' } })
}

const peer = (id = 'peer-1', principal: object = { kind: 'owner' as const }) => ({ id, principal })
const userMessage = (id = 'user-1', text = 'hello') => ({ id, role: 'user', content: text })
const input = (overrides: Record<string, unknown> = {}) => ({
  protocolVersion: '1.0', threadId: 'thread-1', runId: 'run-1',
  messages: [{ id: 'user-1', role: 'user', content: 'hello' }],
  tools: [], context: [], state: {}, forwardedProps: {}, ...overrides,
})

function setup(config: Partial<Config> = {}) {
  const ctx = new Context()
  const release = vi.fn()
  let route: WebRoute | undefined
  const routes: WebRoute[] = []
  const webServer = Object.assign(Object.create(WebServer.prototype), {
    register: vi.fn((value: WebRoute) => { route = value; routes.push(value); return release }),
  }) as WebServer
  const create = vi.fn<(options: CreateAgentOptions) => Promise<AgentHandle>>()
  const agents = Object.assign(Object.create(AgentRegistry.prototype), { create }) as AgentRegistry
  ctx.provide('webServer', webServer)
  ctx.provide('agents', agents)
  const fiber = ctx.plugin({ apply, inject: ['webServer', 'agents'] }, {
    provider: 'mock', model: 'mock', ...config,
  })
  return { ctx, create, fiber, release, routes, route: () => route }
}

function handle(ctx: Context, run: 'success' | 'error' | 'idle' | 'disposed' | 'pending' | 'tool' | 'aborted' | 'turn-error' | 'preclaim-error' | 'preclaim-disposed' | 'throw' | 'cancel-throw' = 'success') {
  let mode = run
  const session = {}
  const dispose = vi.fn(async () => {})
  const cancel = vi.fn(() => {
    if (run === 'cancel-throw') throw new Error('cancel persistence failed')
  })
  const whenIdle = vi.fn(async () => {})
  const agent = {
    session, cancel, whenIdle,
    followup: vi.fn((message: { id: string; content?: readonly { text?: string }[] }) => {
      if (mode === 'throw') throw new Error('internal followup detail')
      if (mode === 'pending' || mode === 'cancel-throw') return
      queueMicrotask(() => {
        const other = {}
        ctx.emit('agent/inbox/claimed', { agent: other, message } as never)
        ctx.emit('agent/assistant-stream', { agent: other, frame: { type: 'start' } } as never)
        ctx.emit('agent/error', { agent: other, error: new Error('other') } as never)
        ctx.emit('agent/status', { agent: other, status: 'idle' } as never)
        ctx.emit('agent/disposed', { agent: other } as never)
        ctx.emit('session/event', other as never, { type: 'turn/end' } as never)
        ctx.emit('session/event', session as never, { type: 'user/message' } as never)
        ctx.emit('agent/inbox/claimed', { agent, message: { id: 'other-message' } } as never)
        ctx.emit('agent/assistant-stream', { agent, frame: { type: 'start', attemptId: 'early', revision: 1, turn: 1, step: 1 } } as never)
        if (mode === 'preclaim-error') {
          ctx.emit('agent/error', { agent, error: new Error('preclaim') } as never)
          return
        }
        if (mode !== 'idle' && mode !== 'preclaim-disposed') ctx.emit('agent/inbox/claimed', { agent, message } as never)
        if (mode === 'error') ctx.emit('agent/error', { agent, error: new Error('failed') } as never)
        else if (mode === 'idle') ctx.emit('agent/status', { agent, status: 'idle' } as never)
        else if (mode === 'disposed' || mode === 'preclaim-disposed') ctx.emit('agent/disposed', { agent } as never)
        else {
          if (mode === 'tool') {
            ctx.emit('agent/assistant-stream', { agent, frame: { type: 'start', attemptId: 'attempt', revision: 1, turn: 1, step: 1 } } as never)
            ctx.emit('agent/assistant-stream', { agent, frame: { type: 'chunk', attemptId: 'attempt', revision: 1, index: 0, time: 1, chunk: { type: 'tool-call-delta', index: 0, id: 'call-1', name: 'lookup', argumentsDelta: '{}' } } } as never)
            ctx.emit('agent/assistant-stream', { agent, frame: { type: 'end', attemptId: 'attempt', revision: 1, index: 1, outcome: { kind: 'committed', eventType: 'assistant/message', seq: 1 } } } as never)
            ctx.emit('session/event', session as never, { type: 'tool/result', data: { message: { source: { callId: 'call-1' }, content: [{ type: 'text', text: 'found' }, { type: 'image', url: 'ignored' }] } } } as never)
          }
          const reason = mode === 'aborted' ? { kind: 'aborted' } : mode === 'turn-error'
            ? { kind: 'error', error: { message: 'turn failed' } } : { kind: 'completed' }
          ctx.emit('session/event', session as never, { type: 'turn/end', data: { reason } } as never)
        }
      })
    }),
  }
  return {
    value: { agent: agent as never, dispose }, agent, dispose, cancel, whenIdle, session,
    setRun: (next: typeof run): void => { mode = next },
  }
}

async function post(route: WebRoute | undefined, value: object, response = new ResponseFixture(), identity = peer()) {
  await route?.handler(request('POST', JSON.stringify(value)) as never, response as never, identity as never)
  return response
}

describe('AG-UI bridge route', () => {
  it('registers the authenticated route and rejects transport and strict-input violations', async () => {
    const fixture = setup()
    await fixture.fiber.await()
    const route = fixture.route()
    expect(route).toMatchObject({ kind: 'exact', path: '/ag-ui/run', auth: 'required' })

    const unauthenticated = new ResponseFixture()
    await route?.handler(request('POST', JSON.stringify(input())) as never, unauthenticated as never)
    expect(unauthenticated.status).toBe(401)

    const method = new ResponseFixture()
    await route?.handler(request('GET') as never, method as never, peer() as never)
    expect(method.status).toBe(405)

    const encoded = request('POST', JSON.stringify(input()))
    encoded.setEncoding('utf8')
    const encodedResponse = new ResponseFixture()
    const encodedHandle = handle(fixture.ctx)
    fixture.create.mockResolvedValueOnce(encodedHandle.value)
    await route?.handler(encoded as never, encodedResponse as never, peer() as never)
    expect(encodedResponse.status).toBe(200)

    expect((await post(route, {})).status).toBe(400)
    expect((await post(route, input({ unknown: true }))).status).toBe(400)
    expect((await post(route, input({ protocolVersion: '9.9' }))).status).toBe(400)
    expect((await post(route, input({ tools: [{}] }))).status).toBe(400)
    expect((await post(route, input({ messages: [] }))).status).toBe(400)
    expect((await post(route, input({ messages: [{ id: 'u', role: 'assistant', content: 'x' }] }))).status).toBe(400)
    expect((await post(route, input({ messages: [{ id: 'u', role: 'user', content: '  ' }] }))).status).toBe(400)
    expect((await post(route, input({ messages: [{ id: 'u', role: 'user', content: 1 }] }))).status).toBe(400)
    expect((await post(route, input({ messages: [{ id: 'u', role: 'user', content: null }] }))).status).toBe(400)
    expect((await post(route, input({ messages: [{ id: 'u', role: 'user', content: [] }] }))).status).toBe(400)
    expect((await post(route, input({ messages: [{ id: 'u', role: 'user', content: [{ type: 'image', url: 'x' }] }] }))).status).toBe(400)
    expect((await post(route, input({ messages: [{ id: 'u', role: 'user', content: [{ type: 'text', text: 'hi', unknown: true }] }] }))).status).toBe(400)
    expect((await post(route, input({ messages: [{ id: 'u', role: 'user', content: 'x', unknown: true }] }))).status).toBe(400)

    const oversizedFixture = setup({ maxBodyBytes: 1 })
    await oversizedFixture.fiber.await()
    expect((await post(oversizedFixture.route(), input())).status).toBe(400)
    await oversizedFixture.fiber.dispose()

    await fixture.fiber.dispose()
    expect(fixture.release).toHaveBeenCalledOnce()
  })

  it('streams success, persists attribution, reuses one Peer Thread, and disposes it on unload', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    const created = handle(fixture.ctx)
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()

    const first = await post(fixture.route(), input())
    const second = await post(fixture.route(), input({
      runId: 'run-2',
      messages: [userMessage(), { id: 'u2', role: 'user', content: [{ type: 'text', text: 'again' }] }],
    }))
    expect(first.status).toBe(200)
    expect(first.headers['content-type']).toBe('text/event-stream')
    expect(first.body).toContain('RUN_STARTED')
    expect(first.body).toContain('RUN_FINISHED')
    expect(second.status).toBe(200)
    second.emit('close')
    expect(created.cancel).not.toHaveBeenCalled()
    expect(fixture.create).toHaveBeenCalledOnce()
    expect(created.agent.followup).toHaveBeenCalledTimes(2)
    const submitted = created.agent.followup.mock.calls[0]?.[0]
    expect(submitted?.content?.[0]?.text).toContain('"principal":{"kind":"owner"}')

    await fixture.fiber.dispose()
    expect(created.dispose).toHaveBeenCalledOnce()
  })

  it('reuses equal Thread ids across one Principal and enforces the Principal Thread cap', async () => {
    const fixture = setup({ maxBodyBytes: 10_000, maxThreads: 2 })
    const first = handle(fixture.ctx)
    const second = handle(fixture.ctx)
    fixture.create.mockResolvedValueOnce(first.value).mockResolvedValueOnce(second.value)
    await fixture.fiber.await()

    expect((await post(fixture.route(), input(), new ResponseFixture(), peer('a'))).status).toBe(200)
    expect((await post(fixture.route(), input({
      runId: 'run-2', messages: [userMessage(), userMessage('user-2', 'again')],
    }), new ResponseFixture(), peer('b'))).status).toBe(200)
    expect((await post(fixture.route(), input({ threadId: 'second' }), new ResponseFixture(), peer('a'))).status).toBe(200)
    expect((await post(fixture.route(), input({ threadId: 'overflow' }), new ResponseFixture(), peer('a'))).status).toBe(429)
    expect(fixture.create).toHaveBeenCalledTimes(2)
    await fixture.fiber.dispose()
  })

  it('canonicalizes merge-extensible Principal objects across key order and nested arrays', async () => {
    const fixture = setup({ maxBodyBytes: 10_000, maxThreads: 1 })
    const created = handle(fixture.ctx)
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    const first = peer('connection-a', { kind: 'test', z: [2, 1], a: 'same' })
    const reconnected = peer('connection-b', { a: 'same', z: [2, 1], kind: 'test' })
    expect((await post(fixture.route(), input(), new ResponseFixture(), first)).status).toBe(200)
    expect((await post(fixture.route(), input({
      runId: 'reconnected', messages: [userMessage(), userMessage('user-2', 'again')],
    }), new ResponseFixture(), reconnected)).status).toBe(200)
    expect(fixture.create).toHaveBeenCalledOnce()
    await fixture.fiber.dispose()
  })

  it('rejects replayed history on an unknown Thread and by another Principal', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    const created = handle(fixture.ctx)
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()

    const replayed = [userMessage(), userMessage('user-2', 'again')]
    const first = await post(fixture.route(), input({ messages: replayed }))
    expect(first.status).toBe(400)
    expect(first.body).toContain('DSH_AG_UI_HISTORY_UNREPLAYABLE')

    expect((await post(fixture.route(), input())).status).toBe(200)
    const other = await post(
      fixture.route(), input({ messages: replayed }), new ResponseFixture(), peer('other', { kind: 'test' }),
    )
    expect(other.status).toBe(400)
    expect(other.body).toContain('DSH_AG_UI_HISTORY_UNREPLAYABLE')
    await fixture.fiber.dispose()
  })

  it('rejects replayed history that diverges from the recorded Thread', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    const created = handle(fixture.ctx)
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    expect((await post(fixture.route(), input())).status).toBe(200)

    const tampered = await post(fixture.route(), input({
      runId: 'run-2', messages: [userMessage('user-1', 'changed'), userMessage('user-2', 'again')],
    }))
    expect(tampered.status).toBe(409)
    expect(tampered.body).toContain('DSH_AG_UI_HISTORY_DIVERGED')

    const missing = await post(fixture.route(), input({
      runId: 'run-3', messages: [userMessage('user-1', 'different')],
    }))
    expect(missing.status).toBe(409)
    expect(missing.body).toContain('DSH_AG_UI_HISTORY_DIVERGED')
    await fixture.fiber.dispose()
  })

  it('rejects replayed history above the configured byte limit', async () => {
    const fixture = setup({ maxBodyBytes: 10_000, maxHistoryBytes: 32 })
    await fixture.fiber.await()
    const oversized = await post(fixture.route(), input({
      messages: [userMessage('user-1', 'x'.repeat(64)), userMessage('user-2', 'again')],
    }))
    expect(oversized.status).toBe(413)
    expect(oversized.body).toContain('DSH_AG_UI_HISTORY_TOO_LARGE')
    await fixture.fiber.dispose()
  })

  it('submits only the new user message when the replayed prefix matches', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    const created = handle(fixture.ctx)
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    expect((await post(fixture.route(), input())).status).toBe(200)
    const second = await post(fixture.route(), input({
      runId: 'run-2', messages: [userMessage(), userMessage('user-2', 'follow up')],
    }))
    expect(second.status).toBe(200)
    const submitted = created.agent.followup.mock.calls[1]?.[0]
    expect(submitted?.content?.[0]?.text).toContain('follow up')
    expect(submitted?.content?.[0]?.text).not.toContain('hello')
    expect(submitted?.content?.[0]?.text).toContain('"runId":"run-2"')
    await fixture.fiber.dispose()
  })

  it('rejects a current message that carries Tool fields', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    await fixture.fiber.await()
    const withCalls = await post(fixture.route(), input({
      messages: [{
        id: 'user-1', role: 'user', content: 'hi',
        toolCalls: [{ id: 'c', type: 'function', function: { name: 'n', arguments: '{}' } }],
      }],
    }))
    expect(withCalls.status).toBe(400)
    expect(withCalls.body).toContain('DSH_AG_UI_INVALID_REQUEST')

    const withId = await post(fixture.route(), input({
      messages: [{ id: 'user-1', role: 'user', content: 'hi', toolCallId: 'c' }],
    }))
    expect(withId.status).toBe(400)
    await fixture.fiber.dispose()
  })

  it('tolerates retrying the user message of a Run that published no message', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    const created = handle(fixture.ctx, 'error')
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    expect((await post(fixture.route(), input())).status).toBe(200)
    const retry = await post(fixture.route(), input({ runId: 'retry' }))
    expect(retry.status).toBe(200)
    expect(created.agent.followup).toHaveBeenCalledTimes(2)
    await fixture.fiber.dispose()
  })

  it('marks a Thread unusable after an interrupted stream', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    const created = handle(fixture.ctx, 'pending')
    created.dispose.mockRejectedValueOnce(new Error('dispose failed'))
    const fresh = handle(fixture.ctx)
    fixture.create.mockResolvedValueOnce(created.value).mockResolvedValueOnce(fresh.value)
    await fixture.fiber.await()
    const response = new ResponseFixture()
    response.writable = false
    const run = post(fixture.route(), input(), response)
    await vi.waitFor(() => { expect(created.agent.followup).toHaveBeenCalledOnce() })
    fixture.ctx.emit('agent/inbox/claimed', {
      agent: created.agent, message: created.agent.followup.mock.calls[0]?.[0],
    } as never)
    await run
    const after = await post(fixture.route(), input({ runId: 'after-abort' }))
    expect(after.status).toBe(409)
    expect(after.body).toContain('DSH_AG_UI_HISTORY_UNUSABLE')
    expect(created.dispose).toHaveBeenCalledOnce()
    expect((await post(fixture.route(), input({ threadId: 'fresh', runId: 'fresh-run' }))).status).toBe(200)
    await fixture.fiber.dispose()
  })

  it('does not mutate a live Run when a concurrent retry is rejected', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    const created = handle(fixture.ctx, 'pending')
    const second = handle(fixture.ctx)
    fixture.create.mockResolvedValueOnce(created.value).mockResolvedValueOnce(second.value)
    await fixture.fiber.await()
    const response = new ResponseFixture()
    const run = post(fixture.route(), input(), response)
    await vi.waitFor(() => { expect(created.agent.followup).toHaveBeenCalledOnce() })

    const concurrent = await post(fixture.route(), input({ runId: 'concurrent' }))
    expect(concurrent.status).toBe(409)

    fixture.ctx.emit('agent/inbox/claimed', {
      agent: created.agent, message: created.agent.followup.mock.calls[0]?.[0],
    } as never)
    fixture.ctx.emit('agent/assistant-stream', {
      agent: created.agent,
      frame: { type: 'start', attemptId: 'attempt-1', revision: 1, turn: 1, step: 1 },
    } as never)
    fixture.ctx.emit('agent/assistant-stream', {
      agent: created.agent,
      frame: {
        type: 'chunk', attemptId: 'attempt-1', revision: 1, index: 0, time: 1,
        chunk: { type: 'text-delta', index: 0, text: 'first' },
      },
    } as never)
    fixture.ctx.emit('session/event', created.session as never, {
      type: 'turn/end', data: { reason: { kind: 'completed' } },
    } as never)
    await run

    created.setRun('success')
    const replay = await post(fixture.route(), input({
      runId: 'replay',
      messages: [
        userMessage(),
        { id: 'attempt-1', role: 'assistant', content: 'first' },
        userMessage('user-2', 'next'),
      ],
    }))
    expect(replay.status).toBe(200)
    await fixture.fiber.dispose()
  })

  it('marks a Thread unusable when the client drops after a published event', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    const created = handle(fixture.ctx, 'pending')
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    const response = new ResponseFixture()
    const run = post(fixture.route(), input(), response)
    await vi.waitFor(() => { expect(created.agent.followup).toHaveBeenCalledOnce() })
    fixture.ctx.emit('agent/inbox/claimed', {
      agent: created.agent, message: created.agent.followup.mock.calls[0]?.[0],
    } as never)
    await vi.waitFor(() => { expect(response.body).toContain('RUN_STARTED') })
    response.emit('close')
    await run
    expect(created.whenIdle).toHaveBeenCalledOnce()
    const after = await post(fixture.route(), input({ runId: 'after-drop' }))
    expect(after.status).toBe(409)
    expect(after.body).toContain('DSH_AG_UI_HISTORY_UNUSABLE')
    await fixture.fiber.dispose()
  })

  it('records the configured project directory on the Sessions it creates', async () => {
    const fixture = setup({ maxBodyBytes: 10_000, sessionCwd: '/tmp/bridge-workspace' })
    fixture.create.mockResolvedValue(handle(fixture.ctx, 'success').value)
    await fixture.fiber.await()
    await post(fixture.route(), input())
    expect(fixture.create).toHaveBeenCalledOnce()
    expect(fixture.create.mock.calls[0]?.[0]).toMatchObject({ meta: { cwd: '/tmp/bridge-workspace' } })
    await fixture.fiber.dispose()
  })

  it('falls back to the host process directory when no project directory is configured', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    fixture.create.mockResolvedValue(handle(fixture.ctx, 'success').value)
    await fixture.fiber.await()
    await post(fixture.route(), input())
    expect(typeof fixture.create.mock.calls[0]?.[0].meta?.cwd).toBe('string')
    await fixture.fiber.dispose()
  })

  it('reserves capacity during creation and rejects a concurrent Run on the same Thread', async () => {
    const fixture = setup({ maxBodyBytes: 10_000, maxThreads: 1 })
    let resolveCreate!: (value: AgentHandle) => void
    fixture.create.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve }))
    await fixture.fiber.await()

    const firstResponse = new ResponseFixture()
    const firstRun = post(fixture.route(), input(), firstResponse)
    await vi.waitFor(() => { expect(fixture.create).toHaveBeenCalledOnce() })
    expect(await post(fixture.route(), input({ runId: 'same' }))).toMatchObject({ status: 409 })
    expect(await post(fixture.route(), input({ threadId: 'other' }))).toMatchObject({ status: 429 })
    resolveCreate(handle(fixture.ctx).value)
    await firstRun
    await fixture.fiber.dispose()
  })

  it('disposes an Agent created after disconnect without submitting work', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    let resolveCreate!: (value: AgentHandle) => void
    fixture.create.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve }))
    await fixture.fiber.await()
    const response = new ResponseFixture()
    const run = post(fixture.route(), input(), response)
    await vi.waitFor(() => { expect(fixture.create).toHaveBeenCalledOnce() })
    response.emit('close')
    response.emit('close')
    const created = handle(fixture.ctx)
    resolveCreate(created.value)
    await run
    expect(created.dispose).toHaveBeenCalledOnce()
    expect(created.agent.followup).not.toHaveBeenCalled()
    await fixture.fiber.dispose()
  })

  it('does not write a creation failure after the client disconnects', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    let rejectCreate!: (reason: unknown) => void
    fixture.create.mockImplementation(() => new Promise((_resolve, reject) => { rejectCreate = reject }))
    await fixture.fiber.await()
    const response = new ResponseFixture()
    const run = post(fixture.route(), input(), response)
    await vi.waitFor(() => { expect(fixture.create).toHaveBeenCalledOnce() })
    response.emit('close')
    rejectCreate(new Error('late failure'))
    await run
    expect(response.status).toBe(0)
    await fixture.fiber.dispose()
  })

  it('waits for an in-flight creation during unload and disposes the late Agent', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    let resolveCreate!: (value: AgentHandle) => void
    fixture.create.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve }))
    await fixture.fiber.await()
    const response = new ResponseFixture()
    const run = post(fixture.route(), input(), response)
    await vi.waitFor(() => { expect(fixture.create).toHaveBeenCalledOnce() })
    const disposal = fixture.fiber.dispose()
    const late = handle(fixture.ctx)
    resolveCreate(late.value)
    await Promise.all([run, disposal])
    expect(late.dispose).toHaveBeenCalledOnce()
    expect(late.agent.followup).not.toHaveBeenCalled()
    expect((await post(fixture.route(), input({ runId: 'after-close' }))).status).toBe(503)
  })

  it('aborts and awaits a Handler still reading its request body during unload', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    await fixture.fiber.await()
    const req = Object.assign(new PassThrough(), { method: 'POST', headers: { accept: 'text/event-stream' } })
    const response = new ResponseFixture()
    const run = fixture.route()?.handler(req as never, response as never, peer() as never)
    req.write('{')
    await Promise.resolve()
    await fixture.fiber.dispose()
    await run
    expect(response.status).toBe(0)
    expect(fixture.create).not.toHaveBeenCalled()
  })

  it('continues unload when Agent cancellation throws', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    const created = handle(fixture.ctx, 'cancel-throw')
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    const run = post(fixture.route(), input())
    await vi.waitFor(() => { expect(created.agent.followup).toHaveBeenCalledOnce() })
    await Promise.all([run, fixture.fiber.dispose()])
    expect(created.cancel).toHaveBeenCalledOnce()
    expect(created.dispose).toHaveBeenCalledOnce()
  })

  it('contains cancellation failure from the response close listener', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    const created = handle(fixture.ctx, 'cancel-throw')
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    const response = new ResponseFixture()
    const run = post(fixture.route(), input(), response)
    await vi.waitFor(() => { expect(created.agent.followup).toHaveBeenCalledOnce() })
    expect(() => { response.emit('close') }).not.toThrow()
    await run
    expect(created.cancel).toHaveBeenCalledOnce()
    expect(created.whenIdle).toHaveBeenCalledOnce()
    await fixture.fiber.dispose()
  })

  it('cancels on disconnect or backpressure and waits for Agent quiescence', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    const created = handle(fixture.ctx, 'pending')
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    const response = new ResponseFixture()
    response.writable = false
    const run = post(fixture.route(), input(), response)
    await vi.waitFor(() => { expect(created.agent.followup).toHaveBeenCalledOnce() })
    fixture.ctx.emit('agent/inbox/claimed', { agent: created.agent, message: created.agent.followup.mock.calls[0]?.[0] } as never)
    fixture.ctx.emit('agent/assistant-stream', { agent: created.agent, frame: { type: 'chunk', attemptId: 'late', revision: 1, index: 0, time: 1, chunk: { type: 'text-delta', index: 0, text: 'late' } } } as never)
    await run
    expect(created.cancel).toHaveBeenCalledWith({ kind: 'user' })
    expect(created.whenIdle).toHaveBeenCalledOnce()
    await fixture.fiber.dispose()
  })

  it.each(['error', 'idle', 'disposed', 'preclaim-error', 'preclaim-disposed'] as const)('settles the %s Agent path', async (outcome) => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    const created = handle(fixture.ctx, outcome)
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    const response = await post(fixture.route(), input())
    expect(response.status).toBe(200)
    expect(response.body).toContain('RUN_STARTED')
    expect(response.body).toContain('RUN_ERROR')
    await fixture.fiber.dispose()
  })

  it.each(['tool', 'aborted', 'turn-error'] as const)('maps the %s terminal path', async (outcome) => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    const created = handle(fixture.ctx, outcome)
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    const response = await post(fixture.route(), input())
    expect(response.status).toBe(200)
    if (outcome === 'tool') expect(response.body).toContain('TOOL_CALL_RESULT')
    if (outcome === 'turn-error') expect(response.body).toContain('RUN_ERROR')
    if (outcome === 'aborted') expect(response.body).toContain('cancelled')
    await fixture.fiber.dispose()
  })

  it('maps a synchronous followup failure to a redacted terminal Run error', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    const created = handle(fixture.ctx, 'throw')
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    const response = await post(fixture.route(), input())
    expect(response.body).toContain('RUN_STARTED')
    expect(response.body).toContain('RUN_ERROR')
    expect(response.body).not.toContain('internal followup detail')
    await fixture.fiber.dispose()
  })

  it('publishes canonical A2UI messages as a CUSTOM event', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    const created = handle(fixture.ctx, 'pending')
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    const run = post(fixture.route(), input())
    await vi.waitFor(() => { expect(created.agent.followup).toHaveBeenCalledOnce() })
    fixture.ctx.emit('agent/inbox/claimed', {
      agent: created.agent, message: created.agent.followup.mock.calls[0]?.[0],
    } as never)
    fixture.ctx.emit('session/event', created.session as never, {
      type: 'tool/result',
      data: {
        message: { source: { callId: 'call-a2ui' }, content: [{ type: 'text', text: 'accepted' }] },
        meta: { protocol: 'a2ui/v1', messages: [{ createSurface: { surfaceId: 's1', components: [] } }] },
      },
    } as never)
    fixture.ctx.emit('session/event', created.session as never, {
      type: 'turn/end', data: { reason: { kind: 'completed' } },
    } as never)
    const response = await run
    expect(response.body).toContain('CUSTOM')
    expect(response.body).toContain('"name":"a2ui"')
    expect(response.body).toContain('createSurface')
    await fixture.fiber.dispose()
  })

  it('carries the A2UI payload on the state channel as well as the custom event', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    const created = handle(fixture.ctx, 'pending')
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    const run = post(fixture.route(), input())
    await vi.waitFor(() => { expect(created.agent.followup).toHaveBeenCalledOnce() })
    fixture.ctx.emit('agent/inbox/claimed', {
      agent: created.agent, message: created.agent.followup.mock.calls[0]?.[0],
    } as never)
    fixture.ctx.emit('session/event', created.session as never, {
      type: 'tool/result',
      data: {
        message: { source: { callId: 'call-a2ui' }, content: [{ type: 'text', text: 'accepted' }] },
        meta: { protocol: 'a2ui/v1', messages: [{ version: '1.0', createSurface: { surfaceId: 's1' } }] },
      },
    } as never)
    fixture.ctx.emit('session/event', created.session as never, {
      type: 'turn/end', data: { reason: { kind: 'completed' } },
    } as never)
    const response = await run
    expect(response.body).toContain('STATE_SNAPSHOT')
    expect(response.body).toContain('"a2ui"')
    expect(response.body).toContain('CUSTOM')
    await fixture.fiber.dispose()
  })

  it('omits the custom event when the deployment disables it', async () => {
    const fixture = setup({ maxBodyBytes: 10_000, emitCustomEvent: false })
    const created = handle(fixture.ctx, 'pending')
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    const run = post(fixture.route(), input())
    await vi.waitFor(() => { expect(created.agent.followup).toHaveBeenCalledOnce() })
    fixture.ctx.emit('agent/inbox/claimed', {
      agent: created.agent, message: created.agent.followup.mock.calls[0]?.[0],
    } as never)
    fixture.ctx.emit('session/event', created.session as never, {
      type: 'tool/result',
      data: {
        message: { source: { callId: 'call-a2ui' }, content: [{ type: 'text', text: 'accepted' }] },
        meta: { protocol: 'a2ui/v1', messages: [{ version: '1.0', createSurface: { surfaceId: 's1' } }] },
      },
    } as never)
    fixture.ctx.emit('session/event', created.session as never, {
      type: 'turn/end', data: { reason: { kind: 'completed' } },
    } as never)
    const response = await run
    expect(response.body).toContain('STATE_SNAPSHOT')
    expect(response.body).not.toContain('"name":"a2ui"')
    await fixture.fiber.dispose()
  })

  it('forwards approval names and honours a disabled state channel', async () => {
    const fixture = setup({ maxBodyBytes: 10_000, emitStateSnapshot: false })
    const created = handle(fixture.ctx, 'pending')
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    const run = post(fixture.route(), input())
    await vi.waitFor(() => { expect(created.agent.followup).toHaveBeenCalledOnce() })
    fixture.ctx.emit('agent/inbox/claimed', {
      agent: created.agent, message: created.agent.followup.mock.calls[0]?.[0],
    } as never)
    fixture.ctx.emit('session/event', created.session as never, {
      type: 'tool/result',
      data: {
        message: { source: { callId: 'call-a2ui' }, content: [{ type: 'text', text: 'accepted' }] },
        meta: {
          protocol: 'a2ui/v1',
          messages: [{ version: '1.0', createSurface: { surfaceId: 's1' } }],
          approval: ['submitForm'],
        },
      },
    } as never)
    fixture.ctx.emit('session/event', created.session as never, {
      type: 'turn/end', data: { reason: { kind: 'completed' } },
    } as never)
    const response = await run
    expect(response.body).not.toContain('STATE_SNAPSHOT')
    expect(response.body).toContain('CUSTOM')
    expect(response.body).toContain('submitForm')
    await fixture.fiber.dispose()
  })

  it('pauses the run on an approval and continues it from a resume', async () => {
    const fixture = setup({ maxBodyBytes: 10_000, interruptOnApproval: true })
    const created = handle(fixture.ctx, 'pending')
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    const run = post(fixture.route(), input())
    await vi.waitFor(() => { expect(created.agent.followup).toHaveBeenCalledOnce() })
    fixture.ctx.emit('agent/inbox/claimed', {
      agent: created.agent, message: created.agent.followup.mock.calls[0]?.[0],
    } as never)

    const approval = (fixture.ctx as unknown as {
      waterfall(name: string, payload: unknown, next: () => Promise<string>): Promise<string>
    }).waterfall('approval/request', {
      agent: created.agent, toolName: 'write_file', callId: 'call-1', reason: 'needs permission',
    }, () => Promise.resolve('unavailable'))

    const paused = await run
    expect(paused.body).toContain('"type":"interrupt"')
    expect(paused.body).toContain('needs permission')
    expect(paused.body).toContain('write_file')

    const interruptId = /"interrupts":\[\{"id":"([^"]+)"/.exec(paused.body)?.[1]
    expect(interruptId).toBeDefined()

    const invalidAnswer = await post(fixture.route(), {
      ...input(),
      runId: 'run-bad',
      resume: [{ interruptId: interruptId as string, status: 'resolved', payload: { outcome: 'maybe' } }],
    })
    expect(invalidAnswer.status).toBe(400)
    expect(invalidAnswer.body).toContain('DSH_AG_UI_INVALID_REQUEST')

    const resumed = post(fixture.route(), {
      ...input(),
      runId: 'run-2',
      resume: [{
        interruptId: interruptId as string,
        status: 'resolved',
        payload: { outcome: 'allowed-once' },
      }],
    })
    await new Promise(resolve => setTimeout(resolve, 100))
    await expect(approval).resolves.toBe('allowed-once')
    fixture.ctx.emit('session/event', created.session as never, {
      type: 'turn/end', data: { reason: { kind: 'completed' } },
    } as never)
    const finished = await resumed
    expect(finished.body).toContain('RUN_STARTED')
    expect(finished.body).toContain('RUN_FINISHED')
    await fixture.fiber.dispose()
  })

  it('rejects a normal run and an unknown resume while an interrupt is pending', async () => {
    const fixture = setup({ maxBodyBytes: 10_000, interruptOnApproval: true })
    const created = handle(fixture.ctx, 'pending')
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    const run = post(fixture.route(), input())
    await vi.waitFor(() => { expect(created.agent.followup).toHaveBeenCalledOnce() })
    fixture.ctx.emit('agent/inbox/claimed', {
      agent: created.agent, message: created.agent.followup.mock.calls[0]?.[0],
    } as never)
    const approval = (fixture.ctx as unknown as {
      waterfall(name: string, payload: unknown, next: () => Promise<string>): Promise<string>
    }).waterfall('approval/request', {
      agent: created.agent, toolName: 'write_file',
    }, () => Promise.resolve('unavailable'))
    await run

    const blocked = await post(fixture.route(), { ...input(), runId: 'run-2' })
    expect(blocked.status).toBe(409)
    expect(blocked.body).toContain('DSH_AG_UI_INTERRUPT_PENDING')

    const unknown = await post(fixture.route(), {
      ...input(),
      runId: 'run-3',
      resume: [{ interruptId: 'not-a-real-id', status: 'resolved', payload: { outcome: 'rejected' } }],
    })
    expect(unknown.status).toBe(400)
    expect(unknown.body).toContain('DSH_AG_UI_UNKNOWN_INTERRUPT')

    // Leave no pending approval behind for teardown.
    const expired = await Promise.race([approval, new Promise(resolve => setTimeout(() => { resolve('pending') }, 50))])
    expect(expired).toBe('pending')
    await fixture.fiber.dispose()
  })

  it('cancels a pending interrupt after its timeout and retires the thread', async () => {
    const fixture = setup({ maxBodyBytes: 10_000, interruptOnApproval: true, interruptTimeoutMs: 1000 })
    const created = handle(fixture.ctx, 'pending')
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    const run = post(fixture.route(), input())
    await vi.waitFor(() => { expect(created.agent.followup).toHaveBeenCalledOnce() })
    fixture.ctx.emit('agent/inbox/claimed', {
      agent: created.agent, message: created.agent.followup.mock.calls[0]?.[0],
    } as never)
    const approval = (fixture.ctx as unknown as {
      waterfall(name: string, payload: unknown, next: () => Promise<string>): Promise<string>
    }).waterfall('approval/request', { agent: created.agent, toolName: 'write_file' }, () => Promise.resolve('unavailable'))
    await run
    await expect(approval).resolves.toBe('cancelled')

    const after = await post(fixture.route(), { ...input(), runId: 'run-2' })
    expect(after.status).toBe(409)
    expect(after.body).toContain('DSH_AG_UI_HISTORY_UNUSABLE')
    await fixture.fiber.dispose()
  }, 10_000)

  it('ignores approvals that belong to an Agent this bridge does not own', async () => {
    const fixture = setup({ maxBodyBytes: 10_000, interruptOnApproval: true })
    await fixture.fiber.await()
    const outsider = handle(fixture.ctx, 'pending')
    const outcome = await (fixture.ctx as unknown as {
      waterfall(name: string, payload: unknown, next: () => Promise<string>): Promise<string>
    }).waterfall('approval/request', {
      agent: outsider.agent, toolName: 'write_file',
    }, () => Promise.resolve('unavailable'))
    expect(outcome).toBe('unavailable')
    await fixture.fiber.dispose()
  })

  it('skips the a2ui custom event when the tool result metadata is malformed', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    const created = handle(fixture.ctx, 'pending')
    fixture.create.mockResolvedValue(created.value)
    await fixture.fiber.await()
    const run = post(fixture.route(), input())
    await vi.waitFor(() => { expect(created.agent.followup).toHaveBeenCalledOnce() })
    fixture.ctx.emit('agent/inbox/claimed', {
      agent: created.agent, message: created.agent.followup.mock.calls[0]?.[0],
    } as never)
    fixture.ctx.emit('session/event', created.session as never, {
      type: 'tool/result',
      data: {
        message: { source: { callId: 'call-a2ui' }, content: [{ type: 'text', text: 'accepted' }] },
        meta: { protocol: 'a2ui/v1', messages: 'not-an-array' },
      },
    } as never)
    fixture.ctx.emit('session/event', created.session as never, {
      type: 'turn/end', data: { reason: { kind: 'completed' } },
    } as never)
    const response = await run
    expect(response.body).not.toContain('"name":"a2ui"')
    await fixture.fiber.dispose()
  })

  it('serves the standalone example page and its bundle only when enabled', async () => {
    const disabled = setup()
    await disabled.fiber.await()
    expect(disabled.routes.some(route => route.path === '/ag-ui/run/example')).toBe(false)
    await disabled.fiber.dispose()

    const enabled = setup({ example: true })
    await enabled.fiber.await()
    const page = enabled.routes.find(route => route.path === '/ag-ui/run/example')
    const bundle = enabled.routes.find(route => route.path === '/ag-ui/run/example/client.js')
    expect(page).toMatchObject({ kind: 'exact', auth: 'required' })

    const html = new ResponseFixture()
    await page?.handler(request('GET') as never, html as never, peer() as never)
    expect(html.status).toBe(200)
    expect(html.headers['content-type']).toContain('text/html')
    expect(html.body).toContain('client.js')

    const htmlRejected = new ResponseFixture()
    await page?.handler(request('POST') as never, htmlRejected as never, peer() as never)
    expect(htmlRejected.status).toBe(405)

    const script = new ResponseFixture()
    await bundle?.handler(request('GET') as never, script as never, peer() as never)
    // The bundle is built by `build:example`; without it the route reports a stable code.
    expect([200, 404]).toContain(script.status)
    if (script.status === 200) expect(script.headers['content-type']).toContain('javascript')
    else expect(script.body).toContain('DSH_AG_UI_EXAMPLE_UNAVAILABLE')

    const scriptRejected = new ResponseFixture()
    await bundle?.handler(request('POST') as never, scriptRejected as never, peer() as never)
    expect(scriptRejected.status).toBe(405)
    await enabled.fiber.dispose()
  })

  it('serves the demo page only when enabled', async () => {
    const disabled = setup()
    await disabled.fiber.await()
    expect(disabled.routes.some(route => route.path === '/ag-ui/run/demo')).toBe(false)
    await disabled.fiber.dispose()

    const enabled = setup({ demo: true })
    await enabled.fiber.await()
    const demo = enabled.routes.find(route => route.path === '/ag-ui/run/demo')
    expect(demo).toMatchObject({ kind: 'exact', auth: 'required' })
    const page = new ResponseFixture()
    await demo?.handler(request('GET') as never, page as never, peer() as never)
    expect(page.status).toBe(200)
    expect(page.headers['content-type']).toContain('text/html')
    expect(page.body).toContain('/ag-ui/run')

    const rejected = new ResponseFixture()
    await demo?.handler(request('POST') as never, rejected as never, peer() as never)
    expect(rejected.status).toBe(405)
    await enabled.fiber.dispose()
  })

  it('returns a creation failure and clears the reservation for retry', async () => {
    const fixture = setup({ maxBodyBytes: 10_000, maxThreads: 1 })
    const created = handle(fixture.ctx)
    fixture.create.mockRejectedValueOnce(new Error('create failed')).mockResolvedValueOnce(created.value)
    await fixture.fiber.await()
    expect((await post(fixture.route(), input())).status).toBe(500)
    expect((await post(fixture.route(), input({ runId: 'retry' }))).status).toBe(200)
    await fixture.fiber.dispose()
  })

  it('redacts a non-Error creation failure from the remote response', async () => {
    const fixture = setup({ maxBodyBytes: 10_000 })
    fixture.create.mockRejectedValue('plain failure')
    await fixture.fiber.await()
    const response = await post(fixture.route(), input())
    expect(response.body).toContain('DSH_AG_UI_THREAD_UNAVAILABLE')
    expect(response.body).not.toContain('plain failure')
    await fixture.fiber.dispose()
  })
})
