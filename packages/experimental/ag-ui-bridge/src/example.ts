/**
 * Stable page for the standalone AG-UI client example.
 *
 * Served by the bridge at `<path>/example`; the bundle beside it is built by
 * `pnpm --filter @deepseek-ai/dsh-ag-ui-bridge build:example`.
 */

/** Minimal shell around the bundled example. */
export const exampleHtml = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>AG-UI 独立客户端示例</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px; }
  h1 { font-size: 16px; margin: 0 0 8px; }
  .pane { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  textarea { min-height: 90px; font: inherit; padding: 8px; }
  button { padding: 8px 14px; cursor: pointer; align-self: flex-start; }
  #log { font: 12px/1.4 ui-monospace, monospace; opacity: .75; max-height: 240px; overflow: auto; white-space: pre-wrap; }
  .card { border: 1px solid #bbb; border-radius: 10px; padding: 12px; margin-bottom: 10px; }
  .card header { font: 11px/1.4 ui-monospace, monospace; opacity: .6; margin-bottom: 6px; }
  .stack { display: flex; flex-direction: column; gap: 6px; }
  .row { display: flex; gap: 8px; }
</style>
</head>
<body>
  <div class="pane">
    <h1>AG-UI 独立客户端（官方 @ag-ui/client，无 dsh 代码）</h1>
    <textarea id="prompt" placeholder="让小新渲染一张卡片…"></textarea>
    <button id="send" type="button">发送</button>
    <div id="log"></div>
  </div>
  <div class="pane">
    <h1>Surfaces（来自 STATE_SNAPSHOT）</h1>
    <div id="surfaces"></div>
  </div>
  <script src="./example/client.js"></script>
</body>
</html>`
