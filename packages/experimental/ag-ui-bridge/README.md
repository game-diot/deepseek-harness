---
description: "Experimental authenticated AG-UI SSE endpoint that translates DSH Agent runs into AG-UI 1.0 events beside the native protocol."
kind: "package-reference"
---

# @deepseek-ai/dsh-ag-ui-bridge

English | [中文](README.zh.md)

## Summary

This experimental Host plugin exposes an authenticated AG-UI SSE run endpoint while leaving the native DSH Web, Session, and Agent Loop paths unchanged. It maps one authenticated Principal and external thread pair to a bridge-owned Agent and translates claimed Turns plus live assistant frames into AG-UI 1.0 events.

## Table of Contents

- [Use this package](#use-this-package)
- [Behavior](#behavior)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount it only in an experimental profile, set the required `provider` and `model`, and configure `path`, `maxBodyBytes`, `maxThreads`, `maxHistoryBytes`, and `sessionCwd` as needed. `sessionCwd` is the absolute project directory recorded on the Sessions the bridge creates; without it a Session lands in the store's no-cwd bucket, which the Web workspace view cannot open. The named route requires an authenticated Peer, accepts `POST`, validates `RunAgentInput`, rejects concurrent runs on one thread, and disposes every bridge-owned Agent when the plugin unloads.

Set `demo: true` to serve a self-contained page at `<path>/demo` that posts to this endpoint, prints the RAW event stream, and renders the restricted A2UI Basic Catalog subset with a plain DOM renderer. Use it to inspect the bridge from a browser; it is not the product renderer and ships disabled.

<a id="behavior"></a>
## Behavior

Each Run carries the Thread history the bridge already produced followed by one new user text message, with empty tools, context, state, and forwarded props; unsupported fields fail with HTTP 400. The bridge records every message it publishes and compares the replayed prefix on `id`, `role`, text, `toolCallId`, and Tool call id/name/arguments, so a divergence fails with HTTP 409 instead of silently branching the Thread. A Run that published no message events leaves its user message recorded, and the client may resend that identical message; the bridge drops the recorded copy and runs it again. It maps `RUN_STARTED`, streamed text, streamed Tool call arguments, durable `TOOL_CALL_RESULT` for Tool calls the client already saw open, a `CUSTOM` event named `a2ui` when a Tool result carries `protocol: a2ui/v1` metadata, `RUN_FINISHED`, and `RUN_ERROR`. Public errors use stable messages and codes while Host logs retain internal diagnostics. A disconnected HTTP client cancels the active DSH Turn but receives no synthesized terminal event.

<a id="model-experience"></a>
## Model Experience

### Protocol adapter

#### What the model sees

The model sees a bounded attribution prefix containing the authenticated Principal, external Thread and Run ids, followed by the admitted user text, through the ordinary durable DSH `user/message` path. The bridge adds no system prompt or Tool schema.

#### Token effect

Only the submitted user message contributes tokens.

#### KV Cache effect

The bridge does not alter the reusable prompt prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Bridge-owned history only** — a Thread's history exists only after this process produced it. Replaying any history for an unknown Thread fails with `DSH_AG_UI_HISTORY_UNREPLAYABLE`, a replayed prefix that differs from the recorded one fails with `DSH_AG_UI_HISTORY_DIVERGED`, and a request above `maxHistoryBytes` fails with `DSH_AG_UI_HISTORY_TOO_LARGE`.
- **Interrupted streams end the Thread** — once a Run has written events and the response then aborts, the client cannot reproduce the delivered prefix, so the bridge retires that binding, frees its `maxThreads` slot, and later Runs fail with `DSH_AG_UI_HISTORY_UNUSABLE`. Backpressure counts as a write failure for the same reason: the bridge cancels the Run and retires the Thread rather than leave a partial history it cannot verify.
- **Process-local Thread bindings** — a Principal-scoped binding does not survive process restart, and no persisted external Thread identifier maps to a DSH Session yet.
- **Deferred protocol surface** — AG-UI state snapshots and deltas, interrupts, multimodal input, client-side Tools, and protobuf transport remain unsupported.
- **A2UI travels as Tool data** — the canonical surface messages arrive after the Tool result as a `CUSTOM` event named `a2ui`; no AG-UI state or activity channel carries them, and the demo page renders only the Basic Catalog subset this Host admits.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

`run-history.ts` must stay in step with how official clients rebuild messages from these events: an assistant message is keyed by `parentMessageId` when present (else `toolCallId`), Tool arguments accumulate by `toolCallId`, and a Tool result lands in its own `tool` message. Verified against `@ag-ui/client@1.0.5` `runAgent` for text-first, Tool-first, and multi-Round Turns.

</details>
