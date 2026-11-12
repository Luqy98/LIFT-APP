// Tabs + a view stack per tab. A "view" is a function (params) => { title, subtitle, actions[], content, footer }.
// Views read the store fresh on every render, so state changes just call refresh().

import { h, icon, iconBtn, backHandlers, ensureGuard, clearTick } from './ui.js';

export const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dash' },
  { id: 'workouts', label: 'Workouts', icon: 'lift' },
  { id: 'movements', label: 'Exercises', icon: 'list' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
];

const stacks = {};
let tab = 'dashboard';
const $ = (id) => document.getElementById(id);

export const currentTab = () => tab;
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
    view = { title: 'Something went wrong', content: h('div', { class: 'empty' }, h('p', { text: 'This screen could not be drawn. Go back and try again.' })) };
  }

  const hdrKids = [];
  if (depth > 1) hdrKids.push(iconBtn('back', 'Back', () => pop(), 'hdr-back'));
  hdrKids.push(
    h('div', { class: 'hdr-title' },
      h('h1', { text: view.title || '' }),
      view.subtitle ? h('div', { class: 'hdr-sub', id: 'hdr-sub', text: view.subtitle }) : null),
    h('div', { class: 'hdr-actions' },
      depth > 1 ? iconBtn('home', `Back to start of ${TABS.find((x) => x.id === tab).label}`, () => goHome(), 'hdr-home') : null,
      view.actions || []));
  $('hdr').replaceChildren(...hdrKids);
  $('hdr').className = (view.color != null ? 'wk wk-' + view.color : '') + (view.brand ? ' brand' : '');
  $('app').dataset.mode = view.mode || '';

  main.replaceChildren(view.content);
  main.scrollTop = keep ? kept : restore ? item.scroll || 0 : scroll;

  const footer = $('footer');
  footer.replaceChildren(...(view.footer ? [view.footer] : []));
  footer.hidden = !view.footer;

  $('tabs').replaceChildren(...TABS.map((t) =>
    h('button', {
      class: 'tab' + (t.id === tab ? ' is-active' : ''), 'aria-current': t.id === tab ? 'page' : null,
      onclick: () => switchTab(t.id),
    }, icon(t.icon, 24), h('span', { text: t.label }))));
}
