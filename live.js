// Things that must keep running whichever screen you're on: the rest timer (and its bell)
// and the "Workout in progress" bar shown above the tabs.
import { h } from './ui.js';
import * as S from './store.js';
import { fmtDuration } from './calc.js';
import { scheduleBell } from './sound.js';

let rest = null;       // { end:ms, bell:{cancel}|null, rung:boolean }
let onChange = () => {};
let resumeFn = () => {};

export const setOnChange = (fn) => { onChange = fn; };
export const setResume = (fn) => { resumeFn = fn; };
export const getRest = () => rest;

// Stopwatch: a free timer for the workout in progress, separate from the set-completion rest timer.
let sw = null; // { sessionId, base:ms, since:ms|null }
export const getStopwatch = (sessionId) => (sw && sw.sessionId === sessionId ? sw : null);
export const swElapsed = (x = sw) => (x ? x.base + (x.since != null ? Date.now() - x.since : 0) : 0);
export function swStart(sessionId) {
  if (!sw || sw.sessionId !== sessionId) sw = { sessionId, base: 0, since: null };
  if (sw.since == null) sw.since = Date.now();
}
export function swPause() { if (sw && sw.since != null) { sw.base += Date.now() - sw.since; sw.since = null; } }
export function swReset() { sw = null; }
export const swRunning = () => !!sw && sw.since != null;

function plan() {
  rest.bell?.cancel();
  rest.bell = S.data.settings.restBell === false ? null : scheduleBell(rest.end - Date.now());
}

export function startRest() {
  clearRest();
  const sec = S.data.settings.restSec;
  if (!(sec > 0)) return;
  rest = { end: Date.now() + sec * 1000, bell: null, rung: false };
  plan();
}
export function adjustRest(ms) {
  if (!rest) return;
  rest.end += ms;
  rest.rung = false;
  plan();
}
export function clearRest() {
  rest?.bell?.cancel();
  rest = null;
}

const left = () => Math.max(0, Math.ceil((rest.end - Date.now()) / 1000));

setInterval(() => {
  try {
    if (sw && !S.activeSession()) sw = null;
    if (sw) for (const el of document.querySelectorAll('[data-sw-time]')) el.textContent = fmtDuration(swElapsed());
    if (rest) {
      if (!S.activeSession()) { clearRest(); onChange(); return; }
      if (Date.now() >= rest.end) {
        // If the bell wasn't pre-scheduled on the audio clock (no audio support), ring now.
        if (!rest.bell && S.data.settings.restBell !== false) scheduleBell(0);
        rest = null;
        navigator.vibrate?.([200, 100, 200, 100, 200]);
        onChange(true);
        return;
      }
      for (const el of document.querySelectorAll('[data-rest-time]')) el.textContent = fmtDuration(left() * 1000);
    }
  } catch { /* ignore */ }
}, 500);

/** The bar above the tabs. Pass the session id of the screen being shown so it hides on the workout's own screen. */
export function liveBar(currentSessionId) {
  const act = S.activeSession();
  if (!act || act.id === currentSessionId) return null;
  return h('button', { class: 'livebar', 'aria-label': 'Return to workout in progress', onclick: () => resumeFn(act.id) },
    h('span', { class: 'banner-dot' }),
    h('span', { class: 'livebar-main' },
      h('span', { class: 'livebar-title', text: 'Workout in progress' }),
      h('span', { class: 'livebar-sub', text: `${S.workoutName(act)} · ${S.weekName(act)}` })),
    sw && sw.since != null ? h('span', { class: 'livebar-rest' }, h('span', { text: 'Timer ' }), h('span', { 'data-sw-time': '', text: fmtDuration(swElapsed()) })) : null,
    rest ? h('span', { class: 'livebar-rest' }, h('span', { text: 'Rest ' }), h('span', { 'data-rest-time': '', text: fmtDuration(left() * 1000) })) : null,
    h('span', { class: 'banner-go', text: 'Resume' }));
}
