// Tabs + a view stack per tab. A "view" is a function (params) => { title, subtitle, actions[], content, footer }.
// Views read the store fresh on every render, so state changes just call refresh().

import { h, icon, iconBtn, backHandlers, ensureGuard, clearTick, titleCase } from './ui.js';
import { liveBar, setOnChange } from './live.js';

export const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dash' },
  { id: 'workouts', label: 'Workouts', icon: 'lift' },
  { id: 'movements', label: 'Exercises', icon: 'list' },
  { id: 'targets', label: 'Targets', icon: 'target' },
  { id: 'bulletin', label: 'Bulletin', icon: 'note' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
];

const stacks = {};
let tab = 'dashboard';
const $ = (id) => document.getElementById(id);

export const currentTab = () => tab;

// ---- Remember where you were, so closing the app (or Android killing it) reopens on the same screen ----
// Only screens registered here are saved, and only with plain-data params (ids). Anything else ends the saved stack.
const named = new Map();
export function registerViews(...fns) { for (const f of fns) named.set(f.name, f); }
const NAV_KEY = 'lift-nav';
const plainParams = (p) => p && typeof p === 'object' && Object.values(p).every((v) => typeof v !== 'function');
function persist() {
  try {
    const out = {};
    for (const [k, st] of Object.entries(stacks)) {
      const list = [];
      for (const it of st.slice(1)) {
        if (named.get(it.fn.name) !== it.fn || !plainParams(it.params || {})) break;
        list.push({ v: it.fn.name, p: JSON.parse(JSON.stringify(it.params || {})), s: it.scroll || 0 });
      }
      out[k] = { s0: st[0].scroll || 0, list };
    }
    localStorage.setItem(NAV_KEY, JSON.stringify({ tab, stacks: out }));
  } catch { /* ignore */ }
}
/** Save the current screen and scroll position now (called when the app goes to the background). */
export function saveState() { saveScroll(); persist(); }
/** Put the saved screens back. Call once, before the first render after opening the app. */
export function restoreState() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(NAV_KEY) || 'null'); } catch { /* ignore */ }
  if (!saved || !stacks[saved.tab]) return;
  for (const [k, st] of Object.entries(saved.stacks || {})) {
    if (!stacks[k]) continue;
    stacks[k].length = 1;
    stacks[k][0].scroll = st.s0 || 0;
    for (const e of st.list || []) {
      const fn = named.get(e.v);
      if (!fn) break;
      stacks[k].push({ fn, params: e.p || {}, scroll: e.s || 0, restored: true });
    }
  }
  tab = saved.tab;
  if (tab !== 'dashboard' || stacks[tab].length > 1) ensureGuard();
}
export const registerRoot = (tabId, fn) => { stacks[tabId] = [{ fn, params: {}, scroll: 0 }]; };
const top = () => stacks[tab][stacks[tab].length - 1];
const saveScroll = () => { const t = top(); if (t) t.scroll = $('main').scrollTop; };

export function push(fn, params = {}) {
  saveScroll();
  stacks[tab].push({ fn, params, scroll: 0 });
  ensureGuard();
  render({ scroll: 0 });
}
export function pop() {
  if (stacks[tab].length <= 1) return false;
  stacks[tab].pop();
  render({ restore: true });
  return true;
}
export function replace(fn, params = {}) {
  stacks[tab][stacks[tab].length - 1] = { fn, params, scroll: 0 };
  render({ scroll: 0 });
}
export function switchTab(id) {
  saveScroll();
  if (id === tab) stacks[tab].length = 1;
  tab = id;
  if (id !== 'dashboard') ensureGuard();
  render({ restore: true });
}
export const refresh = () => render({ keep: true });
/** Jump straight to the first screen of a tab (default: the current one), clearing the back stack. */
export function goHome(tabId = tab) {
  stacks[tab].length = 1;
  stacks[tabId].length = 1;
  tab = tabId;
  render({ scroll: 0 });
}
export function resetAll() {
  for (const k of Object.keys(stacks)) stacks[k].length = 1;
  tab = 'dashboard';
}

backHandlers.push(() => pop());
// On the first screen of any other tab, Back goes to the Dashboard; only from the Dashboard does it leave the app.
backHandlers.push(() => { if (tab === 'dashboard') return false; switchTab('dashboard'); return true; });

export function render({ keep = false, restore = false, scroll = 0 } = {}) {
  const main = $('main');
  if (!main) return;
  clearTick();
  const item = top();
  const depth = stacks[tab].length;
  const kept = main.scrollTop;
  let view;
  try {
    view = item.fn(item.params || {});
  } catch (e) {
    console.error(e);
    // A screen put back after a restart whose workout/exercise no longer exists: fall back to the tab's first screen.
    if (item.restored && depth > 1) { stacks[tab].length = 1; render({ restore: true }); return; }
    view = { title: 'Something went wrong', content: h('div', { class: 'empty' }, h('p', { text: 'This screen could not be drawn. Go back and try again.' })) };
  }

  const hdrKids = [];
  if (depth > 1) hdrKids.push(iconBtn('back', 'Back', () => pop(), 'hdr-back'));
  hdrKids.push(
    h('div', { class: 'hdr-title' },
      h('h1', { text: titleCase(view.title || '') }),
      view.subtitle ? h('div', { class: 'hdr-sub', id: 'hdr-sub', text: view.subtitle }) : null),
    h('div', { class: 'hdr-actions' },
      depth > 1 ? iconBtn('home', `Back to start of ${TABS.find((x) => x.id === tab).label}`, () => goHome(), 'hdr-home') : null,
      view.actions || []));
  $('hdr').replaceChildren(...hdrKids);
  $('hdr').className = (view.color != null ? 'wk wk-' + view.color : '') + (view.brand ? ' brand' : '');
  $('app').dataset.mode = view.mode || '';

  main.replaceChildren(view.content);
  main.scrollTop = keep ? kept : restore ? item.scroll || 0 : scroll;
  if (item.restored) { delete item.restored; requestAnimationFrame(() => { main.scrollTop = item.scroll || 0; }); }
  persist();

  const footer = $('footer');
  const bar = liveBar(view.sessionId);
  const kids = [bar, view.footer].filter(Boolean);
  footer.replaceChildren(...kids);
  footer.hidden = !kids.length;

  $('tabs').replaceChildren(...TABS.map((t) =>
    h('button', {
      class: 'tab' + (t.id === tab ? ' is-active' : ''), 'aria-current': t.id === tab ? 'page' : null,
      onclick: () => switchTab(t.id),
    }, icon(t.icon, 22), h('span', { text: t.label }))));
}

// When the rest timer ends (or the workout disappears) redraw so the bar/footers update.
setOnChange(() => render({ keep: true }));
