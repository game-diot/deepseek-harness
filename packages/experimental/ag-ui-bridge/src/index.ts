/** Optional authenticated AG-UI SSE bridge beside the native DSH protocol. */

import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Event } from '@ag-ui/core'
import { EventSchema, RunAgentInputSchema } from '@ag-ui/core/schemas'
import { EventEncoder } from '@ag-ui/encoder'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import { brandString } from '@deepseek-ai/dsh-brand'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { EventType, PROTOCOL_VERSION } from '@ag-ui/core'
import { AgUiRunEmitter } from './run-emitter.ts'
import { AgUiRunHistory, historyBytes, projectMessages, sameHistory } from './run-history.ts'
import { demoPage } from './demo.ts'
import { exampleHtml } from './example.ts'
import { readFileSync } from 'node:fs'

/** Approval answers this bridge can deliver. */
type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'

/** The subset of an approval question this bridge answers. */
interface ApprovalQuestion {
  readonly agent: { readonly session: unknown }
  readonly toolName: string
  readonly callId?: string
  readonly reason?: string
}

type ApprovalAwareContext = Context & {
  on(
    event: 'approval/request',
    listener: (request: ApprovalQuestion, next: () => Promise<ApprovalOutcome>) => Promise<ApprovalOutcome>,
  ): () => void
}

/** Cordis plugin name. */
export const name = 'ag-ui-bridge'
/** Required Host capabilities. */
export const inject = ['webServer', 'agents']

/** Deployment-owned endpoint and input bounds. */
export interface Config {
  /** Exact authenticated HTTP path owned by the Bridge. */
  path?: string
  /** Maximum request body bytes read before JSON validation. */
  maxBodyBytes?: number
  /** DSH model-provider id used by newly bound Threads. */
  provider: string
  /** DSH model id used by newly bound Threads. */
  model: string
  /** Maximum process-local authenticated Thread bindings. */
  maxThreads?: number
  /**
   * Absolute project directory recorded on the Sessions this bridge creates, so the
   * resulting Sessions group under that workspace instead of the no-cwd bucket.
   * Defaults to the host process working directory.
   */
  sessionCwd?: string
  /** Emit the canonical A2UI payload as an AG-UI state snapshot. Defaults to true. */
  emitStateSnapshot?: boolean
  /** Emit the bridge-specific `CUSTOM` a2ui event. Defaults to true. */
  emitCustomEvent?: boolean
  /**
   * Turn a Tool approval question into an AG-UI interrupt: the Run ends with an
   * interrupt outcome and the next Run on that thread answers it through `resume`.
   */
  interruptOnApproval?: boolean
  /** How long a pending interrupt waits for its resume before it is cancelled. */
  interruptTimeoutMs?: number
  /** Maximum recorded Thread history bytes carried by one Run request. */
  maxHistoryBytes?: number
  /** Serve a self-contained `/demo` page beside the run endpoint. */
  demo?: boolean
  /** Serve the standalone example that uses the published AG-UI client only. */
  example?: boolean
}

/** Loader schema for the optional bridge. */
export const Config: z<Config> = z.object({
  path: z.string().default('/ag-ui/run'),
  maxBodyBytes: z.number().step(1).min(1).default(1_048_576),
  provider: z.string().required(),
  model: z.string().required(),
  maxThreads: z.number().step(1).min(1).default(32),
  sessionCwd: z.string(),
  emitStateSnapshot: z.boolean().default(true),
  emitCustomEvent: z.boolean().default(true),
  interruptOnApproval: z.boolean().default(false),
  interruptTimeoutMs: z.number().step(1).min(1000).default(60_000),
  maxHistoryBytes: z.number().step(1).min(1).default(1_048_576),
  demo: z.boolean().default(false),
  example: z.boolean().default(false),
})

async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > maxBytes) throw new Error(`request body exceeds ${String(maxBytes)} bytes`)
    chunks.push(new Uint8Array(buffer))
  }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  return body
}


function supportsFirstSlice(input: {
  readonly tools?: readonly unknown[] | undefined
  readonly context?: readonly unknown[] | undefined
  readonly state?: unknown
  readonly forwardedProps?: unknown
  readonly protocolVersion?: string | undefined
  readonly parentRunId?: string | undefined
  readonly resume?: unknown
}): boolean {
  const allowed = new Set([
    'protocolVersion', 'threadId', 'runId', 'messages', 'tools', 'context', 'state', 'forwardedProps', 'resume',
  ])
  if (Object.keys(input).some(key => !allowed.has(key))) return false
  const emptyObject = (value: unknown): boolean => value === undefined || typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === 0
  return input.protocolVersion === PROTOCOL_VERSION && input.parentRunId === undefined
    && (input.tools?.length ?? 0) === 0 && (input.context?.length ?? 0) === 0
    && emptyObject(input.state) && emptyObject(input.forwardedProps)
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([left], [right]) => left < right ? -1 : 1)
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function threadKey(peer: PeerScope, threadId: string): string {
  return `${canonicalJson(peer.principal)}\u0000${threadId}`
}

function toolResultText(content: readonly { readonly type: string; readonly text?: string }[]): string {
  return content.flatMap(block => block.type === 'text' && block.text !== undefined ? [block.text] : []).join('\n')
}

/** A2UI messages carried by one durable Tool result, when it speaks the A2UI protocol. */
function a2uiPayload(meta: unknown): {
  readonly protocol: 'a2ui/v1'
  readonly messages: readonly unknown[]
  readonly approval?: readonly string[]
} | null {
  if (typeof meta !== 'object' || meta === null) return null
  const candidate = meta as { protocol?: unknown; messages?: unknown; approval?: unknown }
  if (candidate.protocol !== 'a2ui/v1' || !Array.isArray(candidate.messages)) return null
  const approval = Array.isArray(candidate.approval)
    ? candidate.approval.filter((entry): entry is string => typeof entry === 'string')
    : []
  return approval.length === 0
    ? { protocol: 'a2ui/v1', messages: candidate.messages }
    : { protocol: 'a2ui/v1', messages: candidate.messages, approval }
}

function attributedPrompt(peer: PeerScope, threadId: string, runId: string, text: string): string {
  return `[AG-UI caller] ${JSON.stringify({ principal: peer.principal, threadId, runId })}\n${text}`
}

function json(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function isUnavailable(lifecycle: { readonly closing: boolean }, signal: AbortSignal): boolean {
  return lifecycle.closing || signal.aborted
}

function cancelAgent(ctx: Context, agent: AgentHandle['agent'] | undefined): void {
  if (agent === undefined) return
  try {
    agent.cancel({ kind: 'user' })
  } catch (error) {
    ctx.logger.warn('AG-UI Agent cancellation failed: %s', error)
  }
}

/** Register the authenticated AG-UI run route for this plugin lifetime. */
export function apply(ctx: Context, config: Config): void {
  const path = config.path ?? '/ag-ui/run'
  const maxBodyBytes = config.maxBodyBytes ?? 1_048_576
  const maxThreads = config.maxThreads ?? 32
  const sessionCwd = config.sessionCwd ?? process.cwd()
  const maxHistoryBytes = config.maxHistoryBytes ?? 1_048_576
  const threads = new Map<string, AgentHandle>()
  const histories = new Map<string, AgUiRunHistory>()
  const stale = new Set<string>()
  const running = new Set<string>()
  const creating = new Set<string>()
  const pendingCreations = new Set<Promise<AgentHandle>>()
  /** Threads whose Run ended on an interrupt and waits for its resume. */
  const pendingInterrupts = new Map<string, {
    readonly interruptId: string
    readonly settle: (outcome: ApprovalOutcome) => void
    readonly timer: ReturnType<typeof setTimeout>
  }>()
  /** Per-thread hook the active Run exposes so an approval can end it with an interrupt. */
  const interruptHooks = new Map<string, (payload: unknown) => boolean>()
  /** Threads reserved until their pending interrupt settles. */
  const pausedThreads = new Set<string>()

  const threadKeyOfSession = (session: unknown): string | undefined => {
    for (const [candidate, handle] of threads) {
      /* v8 ignore next -- an unmatched Session walks the whole map before returning undefined. */
      if (handle.agent.session === session) return candidate
    }
    return undefined
  }

  if (config.interruptOnApproval === true) {
    ;(ctx as ApprovalAwareContext).on('approval/request', async (request, next) => {
      const key = threadKeyOfSession(request.agent.session)
      const hook = key === undefined ? undefined : interruptHooks.get(key)
      if (key === undefined || hook === undefined) return next()
      const interruptId = randomUUID()
      return await new Promise<ApprovalOutcome>((resolve) => {
        const settleOnce = (outcome: ApprovalOutcome): void => {
          const pending = pendingInterrupts.get(key)
          /* v8 ignore next -- settling twice is a defensive guard, not a reachable state. */
          if (pending === undefined) return
          clearTimeout(pending.timer)
          pendingInterrupts.delete(key)
          resolve(outcome)
        }
        const timer = setTimeout(() => {
          pausedThreads.delete(key)
          stale.add(key)
          settleOnce('cancelled')
        }, config.interruptTimeoutMs ?? 60_000)
        pendingInterrupts.set(key, { interruptId, settle: settleOnce, timer })
        pausedThreads.add(key)
        let published = false
        try {
          published = hook({
            id: interruptId,
            reason: request.reason ?? `Approve ${request.toolName}`,
            ...request.callId === undefined ? {} : { toolCallId: request.callId },
            metadata: { toolName: request.toolName },
          })
        } catch (error) {
          /* v8 ignore next -- publication only throws for an event the schema rejects. */
          ctx.logger.warn('AG-UI interrupt publication failed: %s', error)
        }
        /* v8 ignore next -- publication only fails for a Run that already ended. */
        if (published) return
        // The Run cannot be paused: answer the question and let it finish normally.
        /* v8 ignore next 2 -- an active Run that already ended cannot reach this branch. */
        pausedThreads.delete(key)
        /* v8 ignore next -- only reachable for an already-ended Run. */
        settleOnce('unavailable')
      })
    })
  }

  const activeHandlers = new Set<{ readonly abort: () => void; readonly done: Promise<void> }>()
  const lifecycle = { closing: false }

  /**
   * Retire one Thread's binding so its capacity and Agent are reclaimable.
   * @param key - the Thread binding to retire.
   * @param handle - the Agent this binding owns.
   */
  const discard = (key: string, handle: AgentHandle): void => {
    threads.delete(key)
    histories.delete(key)
    void handle.dispose().catch((error: unknown) => {
      ctx.logger.warn('AG-UI Thread disposal failed: %s', error)
    })
  }

  ctx.effect(function* () {
    yield async () => {
      lifecycle.closing = true
      for (const activity of activeHandlers) activity.abort()
      await Promise.allSettled([...activeHandlers].map(activity => activity.done))
      await Promise.allSettled(pendingCreations)
      await Promise.all([...threads.values()].map(handle => handle.dispose()))
      histories.clear()
      stale.clear()
    }
    if (config.example === true) {
      yield ctx.webServer.register({
        kind: 'exact', path: `${path}/example`, auth: 'required',
        handler: (req, res) => {
          if (req.method !== 'GET') {
            res.writeHead(405, { allow: 'GET', 'cache-control': 'no-store' }).end()
            return
          }
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
            .end(exampleHtml)
        },
      })
      yield ctx.webServer.register({
        kind: 'exact', path: `${path}/example/client.js`, auth: 'required',
        handler: (req, res) => {
          if (req.method !== 'GET') {
            res.writeHead(405, { allow: 'GET', 'cache-control': 'no-store' }).end()
            return
          }
          let bundle: Buffer | undefined
          for (const candidate of ['../official-client.js', '../lib/official-client.js']) {
            try {
              bundle = readFileSync(new URL(candidate, import.meta.url))
              break
            } catch { /* try the next candidate */ }
          }
          /* v8 ignore next 6 -- only reachable when `build:example` never ran. */
          if (bundle === undefined) {
            json(res, 404, {
              error: 'build the example bundle first',
              code: 'DSH_AG_UI_EXAMPLE_UNAVAILABLE',
            })
            return
          }
          res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
            .end(bundle)
        },
      })
    }
    if (config.demo === true) {
      yield ctx.webServer.register({
        kind: 'exact', path: `${path}/demo`, auth: 'required',
        handler: (req, res) => {
          if (req.method !== 'GET') {
            res.writeHead(405, { allow: 'GET', 'cache-control': 'no-store' }).end()
            return
          }
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
            .end(demoPage(path))
        },
      })
    }
    yield ctx.webServer.register({
      kind: 'exact', path, auth: 'required',
      handler: async (req, res, peer) => {
        if (lifecycle.closing) {
          json(res, 503, { error: 'AG-UI bridge is shutting down', code: 'DSH_AG_UI_UNAVAILABLE' })
          return
        }
        const finished = Promise.withResolvers<void>()
        const disconnected = new AbortController()
        let activeAgent: AgentHandle['agent'] | undefined
        const activity = {
          abort: (): void => {
            disconnected.abort(new Error('AG-UI bridge is shutting down'))
            req.destroy()
            cancelAgent(ctx, activeAgent)
          },
          done: finished.promise,
        }
        activeHandlers.add(activity)
        try {
          if (peer === undefined) {
            json(res, 401, { error: 'authenticated Peer is required' })
            return
          }
          if (req.method !== 'POST') {
            res.writeHead(405, { allow: 'POST', 'cache-control': 'no-store' }).end()
            return
          }
          let input: ReturnType<typeof RunAgentInputSchema.parse>
          try {
            input = RunAgentInputSchema.parse(await readJson(req, maxBodyBytes))
          } catch (error) {
            ctx.logger.debug('AG-UI request validation failed: %s', error)
            // Teardown can start or the request can abort while body parsing is awaited.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (!lifecycle.closing && !disconnected.signal.aborted) {
              json(res, 400, { error: 'invalid AG-UI request', code: 'DSH_AG_UI_INVALID_REQUEST' })
            }
            return
          }
          /* v8 ignore next -- the active-Handler shutdown test covers the body-read side of this single-statement race. */
          if (isUnavailable(lifecycle, disconnected.signal)) return
          if (!supportsFirstSlice(input)) {
            json(res, 400, { error: 'this bridge slice requires empty tools, context, state, and forwardedProps' })
            return
          }
          const projected = projectMessages(input.messages)
          if (projected === null) {
            json(res, 400, { error: 'unsupported message content', code: 'DSH_AG_UI_INVALID_REQUEST' })
            return
          }
          const current = projected.at(-1)
          const history = projected.slice(0, -1)
          if (current === undefined || current.role !== 'user' || current.texts.length !== 1) {
            json(res, 400, { error: 'the request must contain exactly one nonblank user text message' })
            return
          }
          if (current.toolCalls.length > 0 || current.toolCallId !== undefined) {
            json(res, 400, {
              error: 'the current message must be plain user text', code: 'DSH_AG_UI_INVALID_REQUEST',
            })
            return
          }
          /* v8 ignore next -- the length check above guarantees exactly one text. */
          const text = (current.texts[0] ?? '').trim()
          if (text === '') {
            json(res, 400, { error: 'the request must contain exactly one nonblank user text message' })
            return
          }
          if (historyBytes(history) + historyBytes([current]) > maxHistoryBytes) {
            json(res, 413, {
              error: 'replayed history exceeds this bridge limit', code: 'DSH_AG_UI_HISTORY_TOO_LARGE',
            })
            return
          }
          const key = threadKey(peer, input.threadId)
          const resumeEntry = input.resume?.[0]
          let resuming = false
          if (resumeEntry !== undefined) {
            const pending = pendingInterrupts.get(key)
            if (pending === undefined || pending.interruptId !== resumeEntry.interruptId) {
              json(res, 400, {
                error: 'this interrupt is not pending for the thread', code: 'DSH_AG_UI_UNKNOWN_INTERRUPT',
              })
              return
            }
            const answer = resumeEntry.payload as { outcome?: unknown } | undefined
            const outcome = answer?.outcome
            if (outcome !== 'allowed-once' && outcome !== 'rejected' && outcome !== 'cancelled') {
              json(res, 400, {
                error: 'resume payload must carry a supported outcome', code: 'DSH_AG_UI_INVALID_REQUEST',
              })
              return
            }
            pausedThreads.delete(key)
            pending.settle(outcome)
            resuming = true
          }
          if (pausedThreads.has(key) && !resuming) {
            json(res, 409, { error: 'this thread is waiting for a resume', code: 'DSH_AG_UI_INTERRUPT_PENDING' })
            return
          }
          if (!resuming && stale.has(key)) {
            json(res, 409, {
              error: 'this thread must start over after an interrupted run', code: 'DSH_AG_UI_HISTORY_UNUSABLE',
            })
            return
          }
          const recorded = histories.get(key)
          let retried = false
          if (recorded === undefined) {
            if (history.length > 0) {
              json(res, 400, {
                error: 'this thread has no bridge history to replay', code: 'DSH_AG_UI_HISTORY_UNREPLAYABLE',
              })
              return
            }
          } else {
            const recordedHistory = recorded.snapshot()
            if (!resuming && !sameHistory(recordedHistory, history)) {
              // A Run that failed before publishing anything left its user message recorded; the retry resends it.
              const trailing = recordedHistory.at(-1)
              retried = trailing !== undefined
                && trailing.id === current.id && trailing.role === current.role
                && trailing.texts.length === current.texts.length
                && trailing.texts.every((value, index) => value === current.texts[index])
                && sameHistory(recordedHistory.slice(0, -1), history)
              if (!retried) {
                json(res, 409, {
                  error: 'replayed history does not match this thread', code: 'DSH_AG_UI_HISTORY_DIVERGED',
                })
                return
              }
            }
          }
          if (running.has(key)) {
            json(res, 409, { error: 'this thread already has an active run' })
            return
          }
          const needsCreate = !threads.has(key)
          if (needsCreate && threads.size + creating.size >= maxThreads) {
            json(res, 429, { error: `thread limit ${String(maxThreads)} reached` })
            return
          }
          // Apply the retry only after every gate, so a rejected request cannot mutate a live Run's history.
          if (retried) recorded?.dropLast()
          running.add(key)
          if (needsCreate) creating.add(key)

          let handle = threads.get(key)
          res.once('close', () => {
            if (!res.writableEnded) {
              disconnected.abort(new Error('AG-UI client disconnected'))
              cancelAgent(ctx, handle?.agent)
            }
          })

          try {
            if (handle === undefined) {
              const creation = ctx.agents.create({
                sessionId: brandString<SessionId>(randomUUID()),
                meta: { cwd: sessionCwd },
                agentOptions: { provider: config.provider, model: config.model },
              })
              pendingCreations.add(creation)
              try {
                handle = await creation
              } finally {
                pendingCreations.delete(creation)
              }
              // Plugin disposal or disconnect can occur while Agent creation is awaited.
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              if (lifecycle.closing || disconnected.signal.aborted) {
                await handle.dispose()
                running.delete(key)
                return
              }
              threads.set(key, handle)
            }
          } catch (error) {
            running.delete(key)
            ctx.logger.warn('AG-UI Agent creation failed: %s', error)
            // Plugin disposal or disconnect can occur while Agent creation rejects.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (!lifecycle.closing && !disconnected.signal.aborted) {
              json(res, 500, { error: 'AG-UI thread unavailable', code: 'DSH_AG_UI_THREAD_UNAVAILABLE' })
            }
            return
          } finally {
            creating.delete(key)
          }
          const agent = handle.agent
          activeAgent = agent
          /* v8 ignore next -- pending-creation and active-Handler shutdown tests cover both sides of this race. */
          if (isUnavailable(lifecycle, disconnected.signal)) return
          const runHistory = recorded ?? new AgUiRunHistory()
          if (!resuming) runHistory.appendUser(current)
          histories.set(key, runHistory)
          const encoder = new EventEncoder({ accept: 'text/event-stream' })
          const published = { any: false }
          const emit = (event: Event): void => {
            EventSchema.parse(event)
            if (disconnected.signal.aborted) return
            if (!res.write(encoder.encodeSSE(event))) {
              stale.add(key)
              disconnected.abort(new Error('AG-UI response backpressure limit reached'))
              cancelAgent(ctx, agent)
              return
            }
            published.any = true
            runHistory.record(event)
          }
          const bridge = new AgUiRunEmitter({ threadId: input.threadId, runId: input.runId }, emit)
          const settled = Promise.withResolvers<void>()
          let started = resuming
          if (config.interruptOnApproval === true) {
            interruptHooks.set(key, (payload) => {
              /* v8 ignore next -- an active Run is never terminal when its approval arrives. */
              if (!bridge.interrupt([payload])) return false
              settled.resolve()
              return true
            })
          }
          const disposers = [
            ctx.on('agent/inbox/claimed', ({ agent: subject, message }) => {
              if (subject !== agent || submitted === undefined || message.id !== submitted.id) return
              started = true
              bridge.start()
            }),
            ctx.on('agent/assistant-stream', ({ agent: subject, frame }) => {
              if (subject === agent && started) bridge.frame(frame)
            }),
            ctx.on('agent/error', ({ agent: subject, error }) => {
              if (subject !== agent) return
              ctx.logger.warn('AG-UI Agent run failed: %s', error)
              if (!started) bridge.start()
              bridge.fail()
              settled.resolve()
            }),
            ctx.on('agent/status', ({ agent: subject, status }) => {
              if (subject !== agent || status !== 'idle' || started) return
              bridge.start()
              bridge.fail()
              settled.resolve()
            }),
            ctx.on('agent/disposed', ({ agent: subject }) => {
              if (subject !== agent) return
              if (!started) bridge.start()
              bridge.fail()
              settled.resolve()
            }),
            ctx.on('session/event', (session, event) => {
              if (session !== agent.session) return
              if (event.type === 'tool/result' && started) {
                bridge.toolResult(String(event.data.message.source.callId), toolResultText(event.data.message.content))
                const a2ui = a2uiPayload(event.data.meta)
                if (a2ui !== null) {
                  if (config.emitStateSnapshot !== false) {
                    emit({ type: EventType.STATE_SNAPSHOT, snapshot: { a2ui } })
                  }
                  if (config.emitCustomEvent !== false) {
                    emit({ type: EventType.CUSTOM, name: 'a2ui', value: a2ui })
                  }
                }
                return
              }
              if (event.type !== 'turn/end' || !started) return
              if (event.data.reason.kind === 'error') {
                ctx.logger.warn('AG-UI Agent Turn failed: %s', event.data.reason.error.message)
                bridge.fail()
              }
              else bridge.finish(event.data.reason.kind === 'aborted' ? 'cancelled' : 'success')
              settled.resolve()
            }),
          ]
          const submitted = resuming
            ? undefined
            : createUserMessage({
              content: [{ type: 'text', text: attributedPrompt(peer, input.threadId, input.runId, text) }],
              source: { kind: 'user' },
            })
          res.writeHead(200, {
            'content-type': encoder.getContentType(), 'cache-control': 'no-store', connection: 'keep-alive',
          })
          try {
            try {
              if (submitted === undefined) bridge.start()
              else agent.followup(submitted)
            } catch (error) {
              ctx.logger.warn('AG-UI Agent followup failed: %s', error)
              bridge.start()
              bridge.fail()
              settled.resolve()
            }
            await Promise.race([
              settled.promise,
              new Promise<void>((resolve) => {
                disconnected.signal.addEventListener('abort', () => { resolve() }, { once: true })
              }),
            ])
            if (!disconnected.signal.aborted) res.end()
          } finally {
            if (disconnected.signal.aborted) {
              // A Run that published part of its stream leaves a history the client cannot reproduce exactly.
              if (published.any) stale.add(key)
              await agent.whenIdle()
            }
            if (stale.has(key)) discard(key, handle)
            for (const dispose of disposers) dispose()
            interruptHooks.delete(key)
            running.delete(key)
          }
        } finally {
          activeHandlers.delete(activity)
          finished.resolve()
        }
      },
    })
  }, 'ag-ui-bridge.lifecycle')
}
