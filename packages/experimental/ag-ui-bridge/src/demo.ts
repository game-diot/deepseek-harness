/** Self-contained browser page that consumes this bridge and renders its A2UI surfaces. */

/**
 * Build the demo page HTML.
 * @param runPath - the authenticated Run endpoint the page posts to.
 * @returns a complete HTML document.
 */
export function demoPage(runPath: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>dsh AG-UI + A2UI demo</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); min-height: 100vh; }
  section { padding: 18px; overflow: auto; }
  #chat { border-right: 1px solid rgba(127,127,127,.3); }
  .row { margin: 0 0 10px; }
  .user { font-weight: 600; }
  .assistant { white-space: pre-wrap; }
  .tool { font: 12px/1.4 ui-monospace, monospace; opacity: .7; white-space: pre-wrap; }
  #log { font: 11px/1.4 ui-monospace, monospace; white-space: pre-wrap; opacity: .75; max-height: 40vh; overflow: auto; }
  form { display: flex; gap: 8px; margin-top: 12px; }
  input { flex: 1; padding: 8px 10px; }
  button { padding: 8px 14px; cursor: pointer; }
  button:disabled { cursor: progress; opacity: .55; }
  .surface { border: 1px solid rgba(127,127,127,.35); border-radius: 12px; padding: 14px; margin: 12px 0; }
  .surface-id { font: 11px/1.4 ui-monospace, monospace; opacity: .6; margin-bottom: 8px; }
  .col { display: flex; flex-direction: column; gap: 10px; }
  .text { white-space: pre-wrap; }
  .button { align-self: flex-start; padding: 8px 14px; border-radius: 8px; border: 1px solid rgba(127,127,127,.5); cursor: pointer; }
  .fallback { font: 12px/1.4 ui-monospace, monospace; opacity: .7; }
  #status { font: 12px/1.4 ui-monospace, monospace; opacity: .75; }
  label { font-size: 12px; opacity: .8; display: flex; gap: 6px; align-items: center; }
</style>
</head>
<body>
<section id="chat">
  <h2>AG-UI + A2UI</h2>
  <div id="messages"></div>
  <form id="composer">
    <input id="prompt" placeholder="Ask for a card, e.g. render two cards" autocomplete="off">
    <button type="submit" id="send">Send</button>
    <button type="button" id="new-thread">New thread</button>
  </form>
  <p id="status"></p>
</section>
<section>
  <h2>Surfaces</h2>
  <div id="surfaces"></div>
  <h2>Raw events</h2>
  <label><input type="checkbox" id="lifecycle-only"> lifecycle only</label>
  <div id="log"></div>
</section>
<script>
const RUN_PATH = ${JSON.stringify(runPath)};
const MAX_LOG = 200;
const NL = String.fromCharCode(10);
const SEP = NL + NL;
let threadId = newThreadId();
let messages = [];
let busy = false;
const surfaces = new Map();
const components = new Map();
const logLines = [];

function newThreadId() {
  return 'demo-' + Math.random().toString(36).slice(2);
}

function resetThread() {
  threadId = newThreadId();
  messages = [];
  surfaces.clear();
  components.clear();
  logLines.length = 0;
  document.getElementById('messages').textContent = '';
  document.getElementById('log').textContent = '';
  renderSurfaces();
  setStatus('new thread: ' + threadId);
}

function setStatus(text) {
  document.getElementById('status').textContent = text;
}

function setBusy(value) {
  busy = value;
  document.getElementById('send').disabled = value;
  document.getElementById('new-thread').disabled = value;
  if (value) setStatus('running…');
}

const log = (line) => {
  logLines.unshift(line);
  if (logLines.length > MAX_LOG) logLines.length = MAX_LOG;
  renderLog();
};

function renderLog() {
  const onlyLifecycle = document.getElementById('lifecycle-only').checked;
  const visible = onlyLifecycle
    ? logLines.filter(line => /^(RUN_|CUSTOM|TOOL_CALL_(START|END|RESULT))/.test(line))
    : logLines;
  document.getElementById('log').textContent = visible.join(NL);
}

const bubble = (role, text) => {
  const el = document.createElement('div');
  el.className = 'row ' + role;
  el.textContent = text;
  document.getElementById('messages').append(el);
  return el;
};

function renderSurfaces() {
  const root = document.getElementById('surfaces');
  root.textContent = '';
  if (surfaces.size === 0) {
    const empty = document.createElement('div');
    empty.className = 'fallback';
    empty.textContent = 'no surfaces yet';
    root.append(empty);
    return;
  }
  for (const [surfaceId, ids] of surfaces) {
    const box = document.createElement('div');
    box.className = 'surface';
    box.dataset.surfaceId = surfaceId;
    const label = document.createElement('div');
    label.className = 'surface-id';
    label.textContent = surfaceId;
    box.append(label);
    const referenced = new Set();
    for (const id of ids) {
      const c = components.get(surfaceId + '/' + id);
      if (!c) continue;
      if (typeof c.child === 'string') referenced.add(c.child);
      if (Array.isArray(c.children)) for (const child of c.children) referenced.add(child);
    }
    const rootId = ids.find(id => !referenced.has(id));
    box.append(rootId ? renderComponent(surfaceId, rootId) : fallback('no root component'));
    root.append(box);
  }
}

function fallback(text) {
  const el = document.createElement('div');
  el.className = 'fallback';
  el.textContent = '[' + text + ']';
  return el;
}

function renderComponent(surfaceId, id) {
  const c = components.get(surfaceId + '/' + id);
  if (!c) return fallback(id + ' missing');
  if (c.component === 'Card') {
    const el = document.createElement('div');
    if (c.child) el.append(renderComponent(surfaceId, c.child));
    return el;
  }
  if (c.component === 'Column') {
    const el = document.createElement('div');
    el.className = 'col';
    for (const child of c.children || []) el.append(renderComponent(surfaceId, child));
    return el;
  }
  if (c.component === 'Text') {
    const el = document.createElement('div');
    el.className = 'text';
    el.textContent = String(c.text ?? '');
    return el;
  }
  if (c.component === 'Button') {
    const el = document.createElement('button');
    el.className = 'button';
    if (c.child) el.append(renderComponent(surfaceId, c.child));
    el.addEventListener('click', () => {
      if (busy) {
        log('ignored: button pressed while a run is in flight');
        return;
      }
      const action = c.action && c.action.event ? c.action.event : { name: 'unknown' };
      send('[A2UI action] ' + JSON.stringify({ ...action, surfaceId }))
        .catch(error => bubble('tool', String(error)));
    });
    return el;
  }
  return fallback('unsupported component ' + String(c.component));
}

function applyA2ui(payload) {
  for (const message of payload.messages || []) {
    if (message.createSurface) {
      const surface = message.createSurface;
      surfaces.set(surface.surfaceId, []);
      for (const component of surface.components || []) {
        components.set(surface.surfaceId + '/' + component.id, component);
        surfaces.get(surface.surfaceId).push(component.id);
      }
    }
    if (message.updateComponents) {
      const update = message.updateComponents;
      if (!surfaces.has(update.surfaceId)) surfaces.set(update.surfaceId, []);
      for (const component of update.components || []) {
        components.set(update.surfaceId + '/' + component.id, component);
        if (!surfaces.get(update.surfaceId).includes(component.id)) surfaces.get(update.surfaceId).push(component.id);
      }
    }
    if (message.deleteSurface) {
      const surfaceId = message.deleteSurface.surfaceId;
      surfaces.delete(surfaceId);
      for (const key of [...components.keys()]) {
        if (key.startsWith(surfaceId + '/')) components.delete(key);
      }
    }
  }
  renderSurfaces();
}

function handleEvent(event) {
  log(event.type + (event.name ? ' ' + event.name : ''));
  switch (event.type) {
    case 'TEXT_MESSAGE_START': {
      messages.push({ id: event.messageId, role: 'assistant', content: '' });
      bubble('assistant', '');
      return;
    }
    case 'TEXT_MESSAGE_CONTENT': {
      const message = messages.find(m => m.id === event.messageId);
      if (!message) return;
      message.content += event.delta;
      const rows = document.querySelectorAll('#messages .assistant');
      if (rows.length) rows[rows.length - 1].textContent = message.content;
      return;
    }
    case 'TOOL_CALL_START': {
      const parentId = event.parentMessageId;
      let owner = parentId ? messages.find(m => m.id === parentId) : undefined;
      if (!owner) {
        owner = { id: parentId || event.toolCallId, role: 'assistant', toolCalls: [] };
        messages.push(owner);
      }
      owner.toolCalls = owner.toolCalls || [];
      owner.toolCalls.push({ id: event.toolCallId, type: 'function', function: { name: event.toolCallName, arguments: '' } });
      bubble('tool', 'tool ' + event.toolCallName);
      return;
    }
    case 'TOOL_CALL_ARGS': {
      for (const message of messages) {
        const call = (message.toolCalls || []).find(c => c.id === event.toolCallId);
        if (call) call.function.arguments += event.delta;
      }
      return;
    }
    case 'TOOL_CALL_RESULT': {
      messages.push({ id: event.messageId, role: 'tool', toolCallId: event.toolCallId, content: String(event.content ?? '') });
      bubble('tool', String(event.content ?? '').slice(0, 200));
      return;
    }
    case 'CUSTOM': {
      if (event.name === 'a2ui') applyA2ui(event.value || {});
      else log('unhandled custom event: ' + String(event.name));
      return;
    }
    case 'RUN_ERROR': {
      bubble('tool', 'RUN_ERROR ' + String(event.message ?? ''));
      return;
    }
    default:
      return;
  }
}

async function send(text) {
  if (!text.trim()) return;
  if (busy) {
    log('ignored: a run is already in flight');
    return;
  }
  setBusy(true);
  setStatus('running… (' + threadId + ')');
  try {
    await runOnce(text, false);
  } finally {
    setBusy(false);
    setStatus('idle (' + threadId + ')');
  }
}

async function runOnce(text, retried) {
  messages.push({ id: 'user-' + Math.random().toString(36).slice(2), role: 'user', content: text });
  bubble('user', text);
  const response = await fetch(RUN_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({
      protocolVersion: '1.0',
      threadId,
      runId: 'run-' + Math.random().toString(36).slice(2),
      messages,
      state: {},
      tools: [],
      context: [],
      forwardedProps: {},
    }),
  });
  if (!response.ok || !response.body) {
    const detail = (await response.text()).slice(0, 300);
    // A retired Thread cannot be resumed; start a clean one and replay this message once.
    if (!retried && detail.includes('DSH_AG_UI_HISTORY_UNUSABLE')) {
      log('thread retired; starting a new one');
      resetThread();
      return runOnce(text, true);
    }
    bubble('tool', 'HTTP ' + response.status + ' ' + detail);
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let split = buffer.indexOf(SEP);
    while (split !== -1) {
      const chunk = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      for (const line of chunk.split(NL)) {
        if (!line.startsWith('data: ')) continue;
        try { handleEvent(JSON.parse(line.slice(6))); } catch { /* keep the stream alive */ }
      }
      split = buffer.indexOf(SEP);
    }
  }
}

document.getElementById('composer').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.getElementById('prompt');
  const text = input.value;
  input.value = '';
  send(text).catch(error => bubble('tool', String(error)));
});
document.getElementById('new-thread').addEventListener('click', () => {
  if (busy) {
    log('ignored: cannot reset while a run is in flight');
    return;
  }
  resetThread();
});
document.getElementById('lifecycle-only').addEventListener('change', renderLog);

renderSurfaces();
setStatus('idle (' + threadId + ')');
</script>
</body>
</html>`
}
