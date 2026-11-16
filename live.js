// Things that must keep running whichever screen you're on: the rest timer (and its bell)
// and the "Workout in progress" bar shown above the tabs.
import { h, toast } from './ui.js';
import * as S from './store.js';
import { fmtDuration } from './calc.js';
import { scheduleBell, buzz } from './sound.js';

let rest = null;       // { end:ms, bell:{cancel}|null, rung:boolean }
let onChange = () => {};
let resumeFn = () => {};

export const setOnChange = (fn) => { onChange = fn; };
export const setResume = (fn) => { resumeFn = fn; };
export const getRest = () => rest;


// ---- Survive the app being closed: the rest timer is saved as a timestamp and picked up on reopening ----
const LIVE_KEY = 'lift-live';
function saveLive() {
  try { localStorage.setItem(LIVE_KEY, JSON.stringify({ restEnd: rest ? rest.end : null })); } catch { /* ignore */ }
  syncNotify();
}
/** Call once after the vault opens. */
export function restoreLive() {
  try {
    const x = JSON.parse(localStorage.getItem(LIVE_KEY) || 'null');
    if (x && S.activeSession() && x.restEnd && x.restEnd > Date.now()) { rest = { end: x.restEnd, bell: null, rung: false }; plan(); }
  } catch { /* ignore */ }
  saveLive();
}

// ---- Android app: the rest timer counting down in the notification bar (ticks on its own, even with the app closed) ----
const notifier = () => (window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.LiftNotify : null);
let lastNote = '';
function syncNotify() {
  const N = notifier();
  if (!N || !S.isUnlocked()) return;
  const act = S.activeSession();
  if (!rest || !act || rest.end <= Date.now()) {
    if (lastNote !== 'off') { lastNote = 'off'; N.hide().catch(() => {}); }
    return;
  }
  const msg = { title: 'Rest timer', text: `${S.workoutName(act) || 'Workout'} · tap to open`, endsAt: rest.end, leftMs: Math.max(0, rest.end - Date.now()) };
  const key = JSON.stringify([msg.text, msg.endsAt]);
  if (key === lastNote) return;
  lastNote = key;
  N.show(msg).catch(() => {});
}
let asked = false;
function askNotify() {
  const N = notifier();
  if (!N || asked) return;
  asked = true;
  N.requestPerm().then((r) => {
    lastNote = '';
    syncNotify();
    if (r && r.granted === false) toast('Notifications are off for LIFT, so the rest timer can’t show in the notification bar. Turn them on in Android Settings → Apps → LIFT → Notifications.', { ms: 7000 });
  }).catch(() => {});
}

function plan() {
  rest.bell?.cancel();
  rest.bell = S.data.settings.restBell === false ? null : scheduleBell(rest.end - Date.now());
}

/** Ticking a set starts (or restarts) the rest timer, replacing any running one. Manual starts from the
 *  rest timer card use the same length, falling back to 90 s if automatic rest is switched off. */
export function startRest({ manual = false } = {}) {
  clearRest();
  let sec = S.data.settings.restSec;
  if (!(sec > 0)) { if (!manual) return; sec = 90; }
  rest = { end: Date.now() + sec * 1000, bell: null, rung: false };
  plan();
  saveLive();
  askNotify();
}
export function adjustRest(ms) {
  if (!rest) return;
  rest.end += ms;
  rest.rung = false;
  plan();
  saveLive();
}
export function clearRest() {
  rest?.bell?.cancel();
  rest = null;
  saveLive();
}

const left = () => Math.max(0, Math.ceil((rest.end - Date.now()) / 1000));

setInterval(() => {
  try {
    if (!S.isUnlocked()) return; // locked: keep timers as they are, nothing to draw
    if (rest) {
      if (!S.activeSession()) { clearRest(); onChange(); return; }
      if (Date.now() >= rest.end) {
        // If the bell wasn't pre-scheduled on the audio clock (no audio support), ring now.
        if (!rest.bell && S.data.settings.restBell !== false) scheduleBell(0);
        rest = null;
        saveLive();
        if (S.data.settings.restBell !== false) buzz();
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
    rest ? h('span', { class: 'livebar-rest' }, h('span', { text: 'Rest ' }), h('span', { 'data-rest-time': '', text: fmtDuration(left() * 1000) })) : null,
    h('span', { class: 'banner-go', text: 'Resume' }));
}
