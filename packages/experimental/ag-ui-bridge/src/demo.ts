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
  .surface { --a2ui-gap: 10px; --a2ui-font: 14px; --a2ui-accent: #8a8f98; border: 1px solid rgba(127,127,127,.35); border-radius: 12px; padding: 14px; margin: 12px 0; }
  .surface[data-tone="info"] { --a2ui-accent: #4c8dff; }
  .surface[data-tone="success"] { --a2ui-accent: #3fb950; }
  .surface[data-tone="warning"] { --a2ui-accent: #d29922; }
  .surface[data-tone="danger"] { --a2ui-accent: #f85149; }
  .card { border-left: 3px solid var(--a2ui-accent); padding-left: 10px; }
  @keyframes a2ui-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes a2ui-flash { from { background: rgba(90,150,255,.35); } to { background: transparent; } }
  .surface .enter { animation: a2ui-enter .3s ease; }
  .surface .flash { animation: a2ui-flash .8s ease; }
  .surface-id { font: 11px/1.4 ui-monospace, monospace; opacity: .6; margin-bottom: 8px; }
  .col { display: flex; flex-direction: column; gap: var(--a2ui-gap); }
  .row { display: flex; flex-direction: row; gap: var(--a2ui-gap); align-items: center; }
  .text { white-space: pre-wrap; font-size: var(--a2ui-font); }
  .caption { font-size: 12px; opacity: .75; }
  .divider-h { border: 0; border-top: 1px solid rgba(127,127,127,.35); margin: 6px 0; width: 100%; }
  .divider-v { border: 0; border-left: 1px solid rgba(127,127,127,.35); margin: 0 6px; align-self: stretch; }
  .image { max-width: 100%; border-radius: 8px; }
  .image.avatar { width: 48px; height: 48px; border-radius: 50%; }
  .image.icon { width: 24px; height: 24px; }
  .icon { font-size: 18px; line-height: 1; }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .field-label { font-size: 12px; opacity: .8; }
  .control { padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(127,127,127,.45); background: transparent; color: inherit; }
  .choices { display: flex; flex-wrap: wrap; gap: 10px; }
  .choice { display: flex; gap: 6px; align-items: center; font-size: 14px; }
  .slider { display: flex; gap: 8px; align-items: center; }
  .slider input { flex: 1; }
  .slider-value { font: 12px/1.4 ui-monospace, monospace; opacity: .8; min-width: 3ch; }
  .list { display: flex; gap: var(--a2ui-gap); }
  .list.vertical { flex-direction: column; }
  .list.horizontal { flex-direction: row; flex-wrap: wrap; }
  .tabs { display: flex; flex-direction: column; gap: 8px; }
  .tabbar { display: flex; gap: 4px; border-bottom: 1px solid rgba(127,127,127,.35); }
  .tab { padding: 6px 10px; border: 0; background: transparent; color: inherit; cursor: pointer; opacity: .65; }
  .tab.active { opacity: 1; box-shadow: inset 0 -2px 0 currentColor; }
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 10; }
  .modal-panel { background: Canvas; color: CanvasText; border-radius: 12px; padding: 18px; min-width: 280px; max-width: min(80vw, 520px); max-height: 80vh; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
  .media { max-width: 100%; border-radius: 8px; }
  .button { align-self: flex-start; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--a2ui-accent); cursor: pointer; }
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
const dataModels = new Map();
const surfaceBoxes = new Map();
const signatureCache = new Map();
const themes = new Map();
const scopedBases = new Map();
const logLines = [];

const JUSTIFY = {
  start: 'flex-start', center: 'center', end: 'flex-end',
  spaceBetween: 'space-between', spaceAround: 'space-around', spaceEvenly: 'space-evenly', stretch: 'stretch',
};
const DENSITY = { compact: '6px', comfortable: '10px', spacious: '16px' };
const TEXT_SCALE = { sm: '12px', md: '14px', lg: '17px' };

const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
const FIT = { contain: 'contain', cover: 'cover', fill: 'fill', none: 'none', scaleDown: 'scale-down' };
const ICONS = {
  check: '✓', close: '✕', add: '＋', delete: '🗑', edit: '✎', search: '🔍', home: '🏠',
  mail: '✉', info: 'ℹ', help: '?', error: '⚠', favorite: '★', favoriteOff: '☆',
  calendarToday: '📅', locationOn: '📍', menu: '☰', moreVert: '⋮', download: '⭳',
  arrowBack: '←', arrowForward: '→', accountCircle: '👤', lock: '🔒', lockOpen: '🔓',
};

function resolvePath(surfaceId, path) {
  const owner = String(path).startsWith('/') ? scopedBases.get(surfaceId) : undefined;
  let cur = owner === undefined ? (dataModels.get(surfaceId) || {}) : owner;
  for (const segment of String(path).split('/').filter(Boolean)) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[segment];
  }
  return cur;
}

function dyn(surfaceId, value) {
  if (value !== null && typeof value === 'object' && typeof value['@path'] === 'string') {
    const resolved = resolvePath(surfaceId, value['@path']);
    return resolved === undefined ? '' : String(resolved);
  }
  return value === undefined || value === null ? '' : String(value);
}

const overrides = new Map();

function controlKey(surfaceId, id) {
  return surfaceId + '/' + id;
}

function setPath(surfaceId, path, value) {
  const model = dataModels.get(surfaceId) || {};
  const segments = String(path).split('/').filter(Boolean);
  let cursor = model;
  for (const segment of segments.slice(0, -1)) {
    if (cursor[segment] === null || typeof cursor[segment] !== 'object') cursor[segment] = {};
    cursor = cursor[segment];
  }
  const leaf = segments[segments.length - 1];
  if (leaf !== undefined) cursor[leaf] = value;
  dataModels.set(surfaceId, model);
}

function controlValue(surfaceId, component, fallback) {
  const key = controlKey(surfaceId, component.id);
  if (overrides.has(key)) return overrides.get(key);
  const raw = component.value;
  if (raw !== null && typeof raw === 'object' && typeof raw['@path'] === 'string') {
    const resolved = resolvePath(surfaceId, raw['@path']);
    return resolved === undefined ? fallback : resolved;
  }
  return raw === undefined || raw === null ? fallback : raw;
}

function commitControl(surfaceId, component, value) {
  overrides.set(controlKey(surfaceId, component.id), value);
  const raw = component.value;
  if (raw !== null && typeof raw === 'object' && typeof raw['@path'] === 'string') {
    setPath(surfaceId, raw['@path'], value);
  }
}

function resolveDeep(surfaceId, value) {
  if (Array.isArray(value)) return value.map(item => resolveDeep(surfaceId, item));
  if (value !== null && typeof value === 'object') {
    if (typeof value['@path'] === 'string') {
      const resolved = resolvePath(surfaceId, value['@path']);
      return resolved === undefined ? null : resolved;
    }
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = resolveDeep(surfaceId, item);
    return out;
  }
  return value;
}

// This page is a template literal, so the script avoids backslash escapes: a regex here
// would lose its escapes when the template is evaluated.
const MARKERS = [
  { marker: '**', tag: 'strong' },
  { marker: '__', tag: 'strong' },
  { marker: '\u0060', tag: 'code' },
  { marker: '*', tag: 'em' },
  { marker: '_', tag: 'em' },
];
const NEWLINE = String.fromCharCode(10);

function renderMarkdown(text) {
  const fragment = document.createDocumentFragment();
  const source = text === undefined || text === null ? '' : String(text);
  source.split(NEWLINE).forEach((line, index) => {
    if (index > 0) fragment.append(document.createElement('br'));
    let rest = line;
    while (rest.length > 0) {
      let hit = null;
      for (const { marker, tag } of MARKERS) {
        const open = rest.indexOf(marker);
        if (open === -1) continue;
        const close = rest.indexOf(marker, open + marker.length);
        if (close === -1) continue;
        if (hit === null || open < hit.open || (open === hit.open && marker.length > hit.marker.length)) {
          hit = { open, close, marker, tag };
        }
      }
      if (hit === null) {
        fragment.append(document.createTextNode(rest));
        break;
      }
      if (hit.open > 0) fragment.append(document.createTextNode(rest.slice(0, hit.open)));
      const el = document.createElement(hit.tag);
      el.textContent = rest.slice(hit.open + hit.marker.length, hit.close);
      fragment.append(el);
      rest = rest.slice(hit.close + hit.marker.length);
    }
  });
  return fragment;
}

function baseSurfaceId(surfaceId) {
  const cut = surfaceId.indexOf('#');
  return cut === -1 ? surfaceId : surfaceId.slice(0, cut);
}

function componentFor(surfaceId, id) {
  const own = components.get(surfaceId + '/' + id);
  if (own !== undefined) return own;
  const base = baseSurfaceId(surfaceId);
  return base === surfaceId ? undefined : components.get(base + '/' + id);
}

function bindTemplateItems(surfaceId, children) {
  const items = resolvePath(surfaceId, children.path);
  if (!Array.isArray(items)) return [];
  const owner = dataModels.get(baseSurfaceId(surfaceId)) || {};
  return items.map((item, index) => {
    const scoped = surfaceId + '#' + children.componentId + ':' + index;
    dataModels.set(scoped, item);
    scopedBases.set(scoped, owner);
    return scoped;
  });
}

function renderChildren(el, surfaceId, children) {
  if (Array.isArray(children)) {
    for (const child of children) el.append(renderComponent(surfaceId, child));
    return;
  }
  if (children === undefined || children === null) return;
  for (const scoped of bindTemplateItems(surfaceId, children)) {
    el.append(renderComponent(scoped, children.componentId));
  }
}

function newThreadId() {
  return 'demo-' + Math.random().toString(36).slice(2);
}

function resetThread() {
  threadId = newThreadId();
  messages = [];
  surfaces.clear();
  components.clear();
  dataModels.clear();
  surfaceBoxes.clear();
  signatureCache.clear();
  themes.clear();
  scopedBases.clear();
  overrides.clear();
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

function componentSignature(c) {
  const parts = [];
  for (const key of Object.keys(c).sort()) {
    if (key === 'value' || key === 'checks') continue;
    parts.push(key + '=' + JSON.stringify(c[key]));
  }
  return parts.join('&');
}

function pulse(el, name) {
  el.classList.remove(name);
  void el.offsetWidth;
  el.classList.add(name);
  el.addEventListener('animationend', () => el.classList.remove(name), { once: true });
}

function reconcileNode(oldEl, newEl) {
  if (!oldEl || oldEl.dataset.kind !== newEl.dataset.kind) return newEl;
  oldEl.className = newEl.className;
  const style = newEl.getAttribute('style');
  if (style === null) oldEl.removeAttribute('style');
  else oldEl.setAttribute('style', style);
  const newChildren = [...newEl.children];
  if (newChildren.length === 0) {
    for (const attr of ['type', 'min', 'max', 'step', 'placeholder', 'poster', 'src']) {
      const value = newEl.getAttribute(attr);
      if (value === null) oldEl.removeAttribute(attr);
      else if (oldEl.getAttribute(attr) !== value) oldEl.setAttribute(attr, value);
    }
    if (oldEl.innerHTML !== newEl.innerHTML) oldEl.innerHTML = newEl.innerHTML;
    return oldEl;
  }
  const oldByCid = new Map();
  const anonymousOld = [];
  for (const child of [...oldEl.children]) {
    if (child.dataset && child.dataset.cid !== undefined) oldByCid.set(child.dataset.cid, child);
    else anonymousOld.push(child);
  }
  const used = new Set();
  let anonymousIndex = 0;
  for (const newChild of newChildren) {
    const cid = newChild.dataset ? newChild.dataset.cid : undefined;
    let target = newChild;
    if (cid !== undefined && oldByCid.has(cid)) {
      target = reconcileNode(oldByCid.get(cid), newChild);
      used.add(cid);
    } else if (cid === undefined && anonymousIndex < anonymousOld.length) {
      target = reconcileNode(anonymousOld[anonymousIndex], newChild);
      anonymousIndex += 1;
    } else {
      target.dataset.fresh = '1';
    }
    oldEl.append(target);
  }
  for (const child of anonymousOld.slice(anonymousIndex)) child.remove();
  for (const [cid, child] of oldByCid) {
    if (!used.has(cid)) child.remove();
  }
  return oldEl;
}

function renderSurfaces() {
  const root = document.getElementById('surfaces');
  if (surfaces.size === 0) {
    root.textContent = '';
    surfaceBoxes.clear();
    signatureCache.clear();
    const empty = document.createElement('div');
    empty.className = 'fallback';
    empty.textContent = 'no surfaces yet';
    root.append(empty);
    return;
  }
  const empty = root.querySelector('.fallback');
  if (empty) empty.remove();
  const live = new Set();
  for (const [surfaceId, ids] of surfaces) {
    live.add(surfaceId);
    let box = surfaceBoxes.get(surfaceId);
    if (box === undefined) {
      box = document.createElement('div');
      box.className = 'surface';
      box.dataset.surfaceId = surfaceId;
      const label = document.createElement('div');
      label.className = 'surface-id';
      label.textContent = surfaceId;
      box.append(label);
      surfaceBoxes.set(surfaceId, box);
    }
    const theme = themes.get(surfaceId);
    if (theme === undefined) {
      delete box.dataset.tone;
      box.style.removeProperty('--a2ui-gap');
      box.style.removeProperty('--a2ui-font');
    } else {
      if (theme.tone === undefined) delete box.dataset.tone;
      else box.dataset.tone = theme.tone;
      if (theme.density === undefined) box.style.removeProperty('--a2ui-gap');
      else box.style.setProperty('--a2ui-gap', DENSITY[theme.density] || '');
      if (theme.textScale === undefined) box.style.removeProperty('--a2ui-font');
      else box.style.setProperty('--a2ui-font', TEXT_SCALE[theme.textScale] || '');
    }
    const signatures = new Map();
    const referenced = new Set();
    for (const id of ids) {
      const c = components.get(surfaceId + '/' + id);
      if (!c) continue;
      signatures.set(id, componentSignature(c));
      if (typeof c.child === 'string') referenced.add(c.child);
      if (Array.isArray(c.children)) for (const child of c.children) referenced.add(child);
      else if (c.children !== undefined && c.children !== null) referenced.add(c.children.componentId);
      if (Array.isArray(c.tabs)) for (const tab of c.tabs) referenced.add(tab.child);
      if (typeof c.trigger === 'string') referenced.add(c.trigger);
      if (typeof c.content === 'string') referenced.add(c.content);
    }
    const rootId = ids.find(id => !referenced.has(id));
    const next = rootId ? renderComponent(surfaceId, rootId) : fallback('no root component');
    const previousCard = box.querySelector(':scope > [data-cid]');
    if (previousCard === null) {
      next.dataset.fresh = '1';
      box.append(next);
    } else {
      const card = reconcileNode(previousCard, next);
      if (card !== previousCard) previousCard.replaceWith(card);
    }
    const previous = signatureCache.get(surfaceId);
    const nodesById = new Map();
    for (const el of box.querySelectorAll('[data-cid]')) nodesById.set(el.dataset.cid, el);
    for (const [cid, signature] of signatures) {
      const el = nodesById.get(cid);
      if (el === undefined) continue;
      if (el.dataset.fresh === '1') {
        delete el.dataset.fresh;
        pulse(el, 'enter');
      } else if (previous !== undefined && previous.get(cid) !== signature) {
        pulse(el, 'flash');
      }
    }
    signatureCache.set(surfaceId, signatures);
    root.append(box);
  }
  for (const [surfaceId, box] of [...surfaceBoxes]) {
    if (live.has(surfaceId)) continue;
    box.remove();
    surfaceBoxes.delete(surfaceId);
    signatureCache.delete(surfaceId);
  }
}

function fallback(text) {
  const el = document.createElement('div');
  el.className = 'fallback';
  el.textContent = '[' + text + ']';
  return el;
}

function renderComponent(surfaceId, id) {
  const el = buildComponent(surfaceId, id);
  const c = componentFor(surfaceId, id);
  if (c) {
    const base = baseSurfaceId(surfaceId);
    el.dataset.cid = base === surfaceId ? c.id : c.id + surfaceId.slice(base.length);
    el.dataset.kind = c.component;
  }
  return el;
}

function buildComponent(surfaceId, id) {
  const c = componentFor(surfaceId, id);
  if (!c) return fallback(id + ' missing');
  if (c.component === 'Card') {
    const el = document.createElement('div');
    el.className = 'card';
    if (c.child) el.append(renderComponent(surfaceId, c.child));
    return el;
  }
  if (c.component === 'Column') {
    const el = document.createElement('div');
    el.className = 'col';
    if (c.justify) el.style.justifyContent = JUSTIFY[c.justify] || 'flex-start';
    if (c.align) el.style.alignItems = ALIGN[c.align] || 'stretch';
    renderChildren(el, surfaceId, c.children);
    return el;
  }
  if (c.component === 'Row') {
    const el = document.createElement('div');
    el.className = 'row';
    if (c.justify) el.style.justifyContent = JUSTIFY[c.justify] || 'flex-start';
    if (c.align) el.style.alignItems = ALIGN[c.align] || 'center';
    renderChildren(el, surfaceId, c.children);
    return el;
  }
  if (c.component === 'Divider') {
    const el = document.createElement('div');
    el.className = c.axis === 'vertical' ? 'divider-v' : 'divider-h';
    return el;
  }
  if (c.component === 'Image') {
    const el = document.createElement('img');
    el.className = 'image' + (c.variant ? ' ' + c.variant : '');
    el.src = dyn(surfaceId, c.url);
    el.alt = dyn(surfaceId, c.description);
    el.style.objectFit = FIT[c.fit] || 'fill';
    el.addEventListener('error', () => el.replaceWith(fallback('image failed to load')));
    return el;
  }
  if (c.component === 'Icon') {
    const el = document.createElement('span');
    el.className = 'icon';
    el.title = String(c.name);
    el.textContent = ICONS[c.name] || '•';
    return el;
  }
  if (c.component === 'TextField') {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    const label = document.createElement('span');
    label.className = 'field-label';
    label.textContent = dyn(surfaceId, c.label);
    const input = c.variant === 'longText' ? document.createElement('textarea') : document.createElement('input');
    input.className = 'control';
    if (c.variant === 'number') input.type = 'number';
    else if (c.variant === 'obscured') input.type = 'password';
    else if (c.variant !== 'longText') input.type = 'text';
    const current = controlValue(surfaceId, c, '');
    input.value = current === null || current === undefined ? '' : String(current);
    if (c.placeholder !== undefined) input.placeholder = dyn(surfaceId, c.placeholder);
    input.addEventListener('input', () => commitControl(surfaceId, c, input.value));
    wrap.append(label, input);
    return wrap;
  }
  if (c.component === 'CheckBox') {
    const wrap = document.createElement('label');
    wrap.className = 'choice';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(controlValue(surfaceId, c, false));
    input.addEventListener('change', () => commitControl(surfaceId, c, input.checked));
    const text = document.createElement('span');
    text.textContent = dyn(surfaceId, c.label);
    wrap.append(input, text);
    return wrap;
  }
  if (c.component === 'ChoicePicker') {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const label = document.createElement('span');
    label.className = 'field-label';
    label.textContent = dyn(surfaceId, c.label);
    const list = document.createElement('div');
    list.className = 'choices';
    const multiple = c.variant === 'multipleSelection';
    const current = controlValue(surfaceId, c, []);
    const selected = new Set(Array.isArray(current) ? current.map(String) : []);
    for (const option of c.options || []) {
      const row = document.createElement('label');
      row.className = 'choice';
      const input = document.createElement('input');
      input.type = multiple ? 'checkbox' : 'radio';
      input.name = surfaceId + '-' + c.id;
      input.checked = selected.has(String(option.value));
      input.addEventListener('change', () => {
        if (multiple) {
          if (input.checked) selected.add(String(option.value));
          else selected.delete(String(option.value));
          commitControl(surfaceId, c, [...selected]);
        } else {
          commitControl(surfaceId, c, [String(option.value)]);
        }
      });
      const text = document.createElement('span');
      text.textContent = dyn(surfaceId, option.label);
      row.append(input, text);
      list.append(row);
    }
    wrap.append(label, list);
    return wrap;
  }
  if (c.component === 'Slider') {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    const label = document.createElement('span');
    label.className = 'field-label';
    if (c.label !== undefined) label.textContent = dyn(surfaceId, c.label);
    const row = document.createElement('div');
    row.className = 'slider';
    const input = document.createElement('input');
    input.type = 'range';
    const min = c.min === undefined ? 0 : Number(c.min);
    input.min = String(min);
    input.max = String(c.max);
    if (c.steps !== undefined) input.step = String((Number(c.max) - min) / Number(c.steps) || 1);
    const raw = Number(controlValue(surfaceId, c, min));
    input.value = String(Number.isFinite(raw) ? raw : min);
    const out = document.createElement('span');
    out.className = 'slider-value';
    out.textContent = input.value;
    input.addEventListener('input', () => {
      out.textContent = input.value;
      commitControl(surfaceId, c, Number(input.value));
    });
    row.append(input, out);
    wrap.append(label, row);
    return wrap;
  }
  if (c.component === 'List') {
    const el = document.createElement('div');
    el.className = 'list ' + (c.direction === 'horizontal' ? 'horizontal' : 'vertical');
    if (c.align) el.style.alignItems = ALIGN[c.align] || 'stretch';
    renderChildren(el, surfaceId, c.children);
    return el;
  }
  if (c.component === 'Tabs') {
    const wrap = document.createElement('div');
    wrap.className = 'tabs';
    const bar = document.createElement('div');
    bar.className = 'tabbar';
    const panel = document.createElement('div');
    const tabs = c.tabs || [];
    const stateKey = controlKey(surfaceId, c.id);
    const activeIndex = Math.min(Number(overrides.get(stateKey) || 0), tabs.length - 1);
    tabs.forEach((tab, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tab' + (index === activeIndex ? ' active' : '');
      button.textContent = dyn(surfaceId, tab.title);
      button.addEventListener('click', () => {
        overrides.set(stateKey, index);
        renderSurfaces();
      });
      bar.append(button);
    });
    const active = tabs[activeIndex];
    if (active) panel.append(renderComponent(surfaceId, active.child));
    wrap.append(bar, panel);
    return wrap;
  }
  if (c.component === 'Modal') {
    const wrap = document.createElement('div');
    const trigger = document.createElement('div');
    trigger.style.cursor = 'pointer';
    trigger.append(renderComponent(surfaceId, c.trigger));
    trigger.addEventListener('click', () => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      const panel = document.createElement('div');
      panel.className = 'modal-panel';
      panel.append(renderComponent(surfaceId, c.content));
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'button';
      close.textContent = '关闭';
      close.addEventListener('click', () => backdrop.remove());
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop) backdrop.remove();
      });
      panel.append(close);
      backdrop.append(panel);
      document.body.append(backdrop);
    });
    wrap.append(trigger);
    return wrap;
  }
  if (c.component === 'DateTimeInput') {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    const label = document.createElement('span');
    label.className = 'field-label';
    if (c.label !== undefined) label.textContent = dyn(surfaceId, c.label);
    const input = document.createElement('input');
    input.className = 'control';
    input.type = c.enableDate && c.enableTime ? 'datetime-local' : c.enableTime ? 'time' : 'date';
    const current = controlValue(surfaceId, c, '');
    input.value = current === null || current === undefined ? '' : String(current);
    if (c.min !== undefined) input.min = dyn(surfaceId, c.min);
    if (c.max !== undefined) input.max = dyn(surfaceId, c.max);
    input.addEventListener('input', () => commitControl(surfaceId, c, input.value));
    wrap.append(label, input);
    return wrap;
  }
  if (c.component === 'Video') {
    const el = document.createElement('video');
    el.className = 'media';
    el.controls = true;
    el.src = dyn(surfaceId, c.url);
    if (c.posterUrl !== undefined) el.poster = dyn(surfaceId, c.posterUrl);
    return el;
  }
  if (c.component === 'AudioPlayer') {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    if (c.description !== undefined) {
      const label = document.createElement('span');
      label.className = 'field-label';
      label.textContent = dyn(surfaceId, c.description);
      wrap.append(label);
    }
    const audio = document.createElement('audio');
    audio.className = 'media';
    audio.controls = true;
    audio.src = dyn(surfaceId, c.url);
    wrap.append(audio);
    return wrap;
  }
  if (c.component === 'Text') {
    const el = document.createElement('div');
    el.className = 'text' + (c.variant === 'caption' ? ' caption' : '');
    el.append(renderMarkdown(dyn(surfaceId, c.text)));
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
      send('[A2UI action] ' + JSON.stringify({ ...resolveDeep(surfaceId, action), surfaceId }))
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
      dataModels.set(surface.surfaceId, surface.dataModel || {});
      const theme = surface.metadata && surface.metadata.extensions ? surface.metadata.extensions.dsh_theme : undefined;
      if (theme) themes.set(surface.surfaceId, theme);
      else themes.delete(surface.surfaceId);
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
      dataModels.delete(surfaceId);
      for (const key of [...dataModels.keys()]) {
        if (key.startsWith(surfaceId + '#')) dataModels.delete(key);
      }
      for (const key of [...scopedBases.keys()]) {
        if (key.startsWith(surfaceId + '#')) scopedBases.delete(key);
      }
      themes.delete(surfaceId);
      signatureCache.delete(surfaceId);
      const box = surfaceBoxes.get(surfaceId);
      if (box !== undefined) {
        box.remove();
        surfaceBoxes.delete(surfaceId);
      }
      for (const key of [...overrides.keys()]) {
        if (key.startsWith(surfaceId + '/')) overrides.delete(key);
      }
      for (const key of [...components.keys()]) {
        if (key.startsWith(surfaceId + '/')) components.delete(key);
      }
    }
    if (message.updateDataModel) {
      const update = message.updateDataModel;
      const segments = String(update.path).split('/').filter(Boolean);
      if (segments.length === 0) {
        dataModels.set(update.surfaceId, update.value === null || typeof update.value !== 'object' ? {} : update.value);
        continue;
      }
      const model = dataModels.get(update.surfaceId) || {};
      let cursor = model;
      for (const segment of segments.slice(0, -1)) {
        if (cursor[segment] === null || typeof cursor[segment] !== 'object') cursor[segment] = {};
        cursor = cursor[segment];
      }
      const leaf = segments[segments.length - 1];
      if (leaf !== undefined) cursor[leaf] = update.value;
      dataModels.set(update.surfaceId, model);
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
