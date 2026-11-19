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
  .tool { font: 12px/1.4 ui-monospace, monospace; opacity: .7; }
  #log { font: 11px/1.4 ui-monospace, monospace; white-space: pre-wrap; opacity: .75; }
  form { display: flex; gap: 8px; margin-top: 12px; }
  input { flex: 1; padding: 8px 10px; }
  button { padding: 8px 14px; cursor: pointer; }
  .surface { border: 1px solid rgba(127,127,127,.35); border-radius: 12px; padding: 14px; margin: 12px 0; }
  .col { display: flex; flex-direction: column; gap: 10px; }
  .text { white-space: pre-wrap; }
  .button { align-self: flex-start; padding: 8px 14px; border-radius: 8px; border: 1px solid rgba(127,127,127,.5); cursor: pointer; }
</style>
</head>
<body>
<section id="chat">
  <h2>AG-UI + A2UI</h2>
  <div id="messages"></div>
  <form id="composer">
    <input id="prompt" placeholder="Ask for a card, e.g. render a card titled Hello" autocomplete="off">
    <button type="submit">Send</button>
  </form>
</section>
<section>
  <h2>Surfaces</h2>
  <div id="surfaces"></div>
  <h2>Raw events</h2>
  <div id="log"></div>
</section>
<script>
const RUN_PATH = ${JSON.stringify(runPath)};
const threadId = 'demo-' + Math.random().toString(36).slice(2);
const messages = [];
const surfaces = new Map();
const components = new Map();
const log = (line) => {
  const el = document.getElementById('log');
  el.textContent = line + '\\n' + el.textContent;
};
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
  for (const [surfaceId, ids] of surfaces) {
    const box = document.createElement('div');
    box.className = 'surface';
    box.dataset.surfaceId = surfaceId;
    const referenced = new Set();
    for (const id of ids) {
      const c = components.get(surfaceId + '/' + id);
      if (!c) continue;
      if (typeof c.child === 'string') referenced.add(c.child);
      if (Array.isArray(c.children)) for (const child of c.children) referenced.add(child);
    }
    const rootId = ids.find(id => !referenced.has(id));
    if (rootId) box.append(renderComponent(surfaceId, rootId));
    root.append(box);
  }
}

function renderComponent(surfaceId, id) {
  const c = components.get(surfaceId + '/' + id);
  if (!c) return document.createTextNode('[' + id + ' missing]');
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
      const action = c.action && c.action.event ? c.action.event : { name: 'unknown' };
      send('[A2UI action] ' + JSON.stringify({ ...action, surfaceId }));
    });
    return el;
  }
  const el = document.createElement('div');
  el.textContent = '[' + String(c.component) + ']';
  return el;
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
      surfaces.delete(message.deleteSurface.surfaceId);
    }
  }
  renderSurfaces();
}

function handleEvent(event) {
  log(event.type + (event.name ? ' ' + event.name : ''));
  switch (event.type) {
    case 'TEXT_MESSAGE_START': {
      const message = { id: event.messageId, role: 'assistant', content: '' };
      messages.push(message);
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
    bubble('tool', 'HTTP ' + response.status + ' ' + (await response.text()).slice(0, 300));
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let split = buffer.indexOf('\\n\\n');
    while (split !== -1) {
      const chunk = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      for (const line of chunk.split('\\n')) {
        if (!line.startsWith('data: ')) continue;
        try { handleEvent(JSON.parse(line.slice(6))); } catch { /* keep the stream alive */ }
      }
      split = buffer.indexOf('\\n\\n');
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
</script>
</body>
</html>`
}
