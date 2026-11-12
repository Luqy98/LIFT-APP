// DOM helpers, dialogs, toasts and Android back-button handling.
// User text is only ever inserted with textContent / text nodes (never innerHTML), so stored data can't inject markup.

const SVGNS = 'http://www.w3.org/2000/svg';

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false || k === 'value') continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'checked') el.checked = !!v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, kids);
  if (props && props.value != null) el.value = props.value; // after children so <select> options exist
  return el;
}

export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
  append(el, kids);
  return el;
}

// ---- Icons -----------------------------------------------------------------
const ICONS = {
  back: 'M15 5l-7 7 7 7',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  right: 'M9 5l7 7-7 7',
  up: 'M6 14l6-6 6 6',
  down: 'M6 10l6 6 6-6',
  finger: 'M12 11v3c0 3-1 5-2.5 7M8 14c0-2.2 1.8-4 4-4s4 1.8 4 4c0 2.5-.5 4.500-1.500 6.500M5 12a7 7 0 0114 0c0 2 0 3.500-.5 5M8.500 5.500A7 7 0 0112 5',
  home: 'M4 11l8-7 8 7M6 9.500V20h12V9.500M10 20v-5h4v5',
  flame: 'M12 3c1 4 5 5.500 5 10a5 5 0 01-10 0c0-2 1-3.500 2-4.500.2 1.500 1 2.500 2 2.500 0-3-.5-5 1-8z',
  pencil: 'M4 20l1-4L16 5l3 3L8 19l-4 1zM14 7l3 3',
  lock: 'M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z',
  history: 'M4 12a8 8 0 108-8M4 4v5h5M12 8v4l3 2',
  dash: 'M5 20V10M12 20V4M19 20v-7',
  lift: 'M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
};
export function icon(name, size = 22) {
  return s('svg', { class: 'ic', viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    s('path', { d: ICONS[name] }));
}
export const iconBtn = (name, label, onclick, cls = '') =>
  h('button', { class: 'icon-btn ' + cls, 'aria-label': label, title: label, onclick }, icon(name));

// ---- Back button support (Android gesture / button) --------------------------
export const backHandlers = [];
export function ensureGuard() {
  if (!history.state || !history.state.guard) history.pushState({ guard: 1 }, '');
}
window.addEventListener('popstate', () => {
  for (const fn of backHandlers) if (fn()) { ensureGuard(); return; }
  history.back(); // nothing left to close: let the app exit
});

// ---- Overlays ---------------------------------------------------------------
const overlays = [];
const layerRoot = () => document.getElementById('layer');
export const hasOverlay = () => overlays.length > 0;
export function closeTopOverlay() {
  const top = overlays[overlays.length - 1];
  if (!top) return false;
  top.close();
  return true;
}
export function closeAllOverlays() { while (closeTopOverlay()); }
backHandlers.push(closeTopOverlay);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTopOverlay(); });

export function sheet(content, { title, onClose, wide = false } = {}) {
  const backdrop = h('div', { class: 'backdrop', onpointerdown: (e) => { if (e.target === backdrop) close(); } });
  const panel = h('div', { class: 'sheet' + (wide ? ' sheet-wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
    h('div', { class: 'sheet-grip' }),
    title ? h('h2', { class: 'sheet-title', text: title }) : null,
    content);
  backdrop.append(panel);
  layerRoot().append(backdrop);
  const entry = { close };
  overlays.push(entry);
  ensureGuard();
  function close() {
    const i = overlays.indexOf(entry);
    if (i < 0) return;
    overlays.splice(i, 1);
    backdrop.remove();
    onClose?.();
  }
  return { close, panel };
}

export function confirmDialog({ title, message, ok = 'Confirm', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (v) => { if (!finished) { finished = true; resolve(v); } };
    const { close } = sheet(h('div', {},
      message ? h('p', { class: 'sheet-msg', text: message }) : null,
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn', text: cancel, onclick: () => { finish(false); close(); } }),
        h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), text: ok, onclick: () => { finish(true); close(); } }))),
    { title, onClose: () => finish(false) });
  });
}

/** fields: [{key,label,type,value,placeholder,inputmode,hint,autocomplete,min,max}], checks: [{key,label,checked}] -> values | null */
export function formDialog({ title, message, fields = [], checks = [], ok = 'Save', danger = false, validate }) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (v) => { if (!finished) { finished = true; resolve(v); } };
    const inputs = {};
    const err = h('div', { class: 'form-err', role: 'alert' });
    const submit = h('button', { type: 'submit', class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), text: ok });
    const collect = () => {
      const out = {};
      for (const f of fields) out[f.key] = inputs[f.key].value;
      for (const c of checks) out[c.key] = inputs[c.key].checked;
      return out;
    };
    const form = h('form', {
      class: 'form', novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        const vals = collect();
        if (validate) {
          submit.disabled = true; submit.textContent = 'Working…';
          let msg;
          try { msg = await validate(vals); } catch (ex) { msg = ex?.message || 'Something went wrong.'; }
          submit.disabled = false; submit.textContent = ok;
          if (msg) { err.textContent = msg; return; }
        }
        finish(vals);
        close();
      },
    },
    message ? h('p', { class: 'sheet-msg', text: message }) : null,
    fields.map((f) => {
      const inp = f.multiline
        ? h('textarea', { rows: f.rows || 4, value: f.value ?? '', placeholder: f.placeholder || '', autocapitalize: f.capitalize || 'sentences', autocomplete: 'off' })
        : h('input', {
          type: f.type || 'text', value: f.value ?? '', placeholder: f.placeholder || '', inputmode: f.inputmode,
          autocomplete: f.autocomplete || 'off', autocapitalize: f.capitalize || 'sentences', enterkeyhint: 'done',
          min: f.min, max: f.max, step: f.step,
        });
      inputs[f.key] = inp;
      return h('label', { class: 'field' }, h('span', { class: 'field-label', text: f.label }), inp, f.hint ? h('span', { class: 'field-hint', text: f.hint }) : null);
    }),
    checks.map((c) => {
      const cb = h('input', { type: 'checkbox', checked: c.checked });
      inputs[c.key] = cb;
      return h('label', { class: 'check-row' }, cb, h('span', { text: c.label }));
    }),
    err,
    h('div', { class: 'sheet-actions' },
      h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => { finish(null); close(); } }),
      submit));
    const { close } = sheet(form, { title, onClose: () => finish(null) });
    const first = form.querySelector('input:not([type=checkbox]), textarea');
    if (first) requestAnimationFrame(() => { first.focus(); if (first.select && first.value) first.select(); });
  });
}

/** options: [{label, sub, value, danger, selected}] -> chosen value | null */
export function choiceSheet({ title, message, options, cancel = true, compact = false }) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (v) => { if (!finished) { finished = true; resolve(v); } };
    const list = h('div', { class: 'choice-list' + (compact ? ' is-compact' : '') }, options.map((o) =>
      h('button', {
        class: 'choice' + (o.danger ? ' is-danger' : '') + (o.selected ? ' is-selected' : ''), disabled: o.disabled,
        onclick: () => { finish(o.value); close(); },
      },
      h('span', { class: 'choice-main' }, h('span', { class: 'choice-label', text: o.label }), o.sub ? h('span', { class: 'choice-sub', text: o.sub }) : null),
      o.selected ? icon('check', 20) : null)));
    const { close } = sheet(h('div', {}, message ? h('p', { class: 'sheet-msg', text: message }) : null, list,
      cancel ? h('button', { class: 'btn btn-block', text: 'Cancel', onclick: () => { finish(null); close(); } }) : null),
    { title, onClose: () => finish(null) });
  });
}

// ---- Toasts ------------------------------------------------------------------
export function toast(msg, { action, ms = 3500 } = {}) {
  const root = document.getElementById('toasts');
  const t = h('div', { class: 'toast', role: 'status' },
    h('span', { text: msg }),
    action ? h('button', { class: 'toast-btn', text: action.label, onclick: () => { action.onclick(); t.remove(); } }) : null);
  root.append(t);
  setTimeout(() => t.remove(), action ? Math.max(ms, 8000) : ms);
}

// ---- One shared 1-second ticker for live timers -------------------------------
let tickFn = null;
export const setTick = (fn) => { tickFn = fn; };
export const clearTick = () => { tickFn = null; };
setInterval(() => { try { tickFn?.(); } catch { /* ignore */ } }, 1000);

export const installState = { prompt: null };

// ---- Small shared widgets -------------------------------------------------------
export const segmented = (options, value, onchange) =>
  h('div', { class: 'seg', role: 'group' }, options.map(([v, l]) =>
    h('button', { type: 'button', class: 'seg-btn' + (v === value ? ' is-on' : ''), 'aria-pressed': String(v === value), onclick: () => onchange(v), text: l })));

export const selectField = (label, options, value, onchange) =>
  h('label', { class: 'setting' },
    h('span', { class: 'setting-label', text: label }),
    h('select', { class: 'select', value: String(value), onchange: (e) => onchange(e.target.value) },
      options.map(([v, l]) => h('option', { value: String(v), text: l }))));

export const card = (title, ...kids) =>
  h('section', { class: 'card' }, title ? h('h2', { class: 'card-title', text: title }) : null, ...kids);

export const tile = (label, value, sub, tone = '') =>
  h('div', { class: 'tile' },
    h('div', { class: 'tile-label', text: label }),
    h('div', { class: 'tile-value', text: value }),
    sub ? h('div', { class: 'tile-sub' + (tone ? ' tone-' + tone : ''), text: sub }) : null);

export const emptyState = (title, body, action) =>
  h('div', { class: 'empty' }, h('h2', { text: title }), body ? h('p', { text: body }) : null, action || null);

/** Opens the system file picker. Resolves a File or null. */
export const pickFile = () => new Promise((resolve) => {
  const inp = h('input', { type: 'file', accept: '.json,application/json', onchange: () => resolve(inp.files[0] || null) });
  inp.addEventListener('cancel', () => resolve(null));
  inp.click();
});

/** Colour picker sheet. names: label per palette index. Resolves the chosen index or null. */
export function colorSheet(current, names) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (v) => { if (!finished) { finished = true; resolve(v); } };
    const grid = h('div', { class: 'swatches' }, names.map((name, i) =>
      h('button', { class: `swatch wk wk-${i}` + (i === current ? ' is-on' : ''), 'aria-pressed': String(i === current), onclick: () => { finish(i); close(); } },
        h('span', { class: 'wk-dot' }), h('span', { text: name }))));
    const { close } = sheet(h('div', {}, h('p', { class: 'sheet-msg', text: 'Used for this workout in every week, in history and on the dashboard.' }), grid,
      h('button', { class: 'btn btn-block', text: 'Cancel', onclick: () => { finish(null); close(); } })),
    { title: 'Workout colour', onClose: () => finish(null) });
  });
}

/** A compact picker button: shows the current choice and opens a small-text list. options: [[value, label]] */
export function pickerField(label, options, value, onchange) {
  const cur = options.find(([v]) => String(v) === String(value));
  return h('button', {
    type: 'button', class: 'picker-btn', 'aria-label': label, 'aria-haspopup': 'dialog',
    onclick: async () => {
      const v = await choiceSheet({ title: label, compact: true, options: options.map(([val, text]) => ({ label: text, value: String(val), selected: String(val) === String(value) })) });
      if (v != null) onchange(v);
    },
  }, h('span', { class: 'picker-text', text: cur ? cur[1] : '' }), icon('down', 16));
}

/** Strip at the top of a workout screen that says which mode you are in. kind: 'plan' | 'log' | 'review' */
export function modeBanner(kind, title, sub) {
  const lead = kind === 'plan' ? icon('pencil', 18) : kind === 'log' ? h('span', { class: 'banner-dot' }) : icon('check', 18);
  return h('div', { class: 'mode mode-' + kind }, lead,
    h('div', { class: 'mode-main' }, h('span', { class: 'mode-title', text: title }), h('span', { class: 'mode-sub', text: sub })));
}
