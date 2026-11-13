// Bootstrap: open storage, show the lock screen, wire tabs, auto-lock and the service worker.
import { openDb } from './db.js';
import * as S from './store.js';
import * as nav from './nav.js';
import { toast, installState, closeAllOverlays, clearTick } from './ui.js';
import { renderLock } from './views-lock.js';
import { dashboardView } from './views-dash.js';
import { workoutsRoot } from './views-workouts.js';
import { movementsRoot } from './views-library.js';
import { settingsRoot } from './views-settings.js';
import { targetsRoot } from './views-targets.js';
import { bulletinRoot } from './views-bulletin.js';
import { applyTheme } from './theme.js';
import { setResume } from './live.js';
import { sessionView } from './views-session.js';

nav.registerRoot('dashboard', dashboardView);
nav.registerRoot('workouts', workoutsRoot);
nav.registerRoot('movements', movementsRoot);
nav.registerRoot('targets', targetsRoot);
nav.registerRoot('bulletin', bulletinRoot);
nav.registerRoot('settings', settingsRoot);
setResume((sessionId) => nav.push(sessionView, { sessionId }));

const $ = (id) => document.getElementById(id);

function showLock() {
  closeAllOverlays();
  clearTick();
  $('app').hidden = true;
  $('lock').hidden = false;
  renderLock($('lock'), onUnlocked);
}

function onUnlocked() {
  if (!$('app').hidden) return; // already unlocked by the other method (PIN and fingerprint can finish together)
  $('lock').hidden = true;
  $('lock').replaceChildren();
  $('app').hidden = false;
  applyTheme(S.data.settings.theme);
  nav.render({ restore: true });
  navigator.storage?.persist?.().catch(() => {});
}

async function lockNow() {
  if (!S.isUnlocked()) return;
  closeAllOverlays();
  clearTick();
  await S.lock();
  for (const id of ['main', 'hdr', 'footer', 'tabs']) $(id).replaceChildren(); // drop all rendered data from the DOM
  showLock();
}
window.addEventListener('gymlog:lock', lockNow);

// Hide the screen in the app switcher, and lock after the chosen time away.
let hiddenAt = null;
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    if (!S.isUnlocked()) return;
    $('cover').hidden = false;
    hiddenAt = Date.now();
    S.flush();
    if (S.data.settings.autoLockMin === 0) await lockNow();
  } else {
    if (S.isUnlocked() && hiddenAt != null && Date.now() - hiddenAt >= S.data.settings.autoLockMin * 60000) await lockNow();
    $('cover').hidden = true;
    hiddenAt = null;
  }
});
window.addEventListener('pagehide', () => { S.flush(); });

S.onSaveError(() => toast('Could not save. Storage may be full.', { ms: 8000 }));

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installState.prompt = e; });

if ('serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('Update installed', { action: { label: 'Reload', onclick: () => location.reload() } });
    hadController = true;
  });
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker not registered', e));
}

(async function main() {
  try { applyTheme(localStorage.getItem('gymlog-theme') || 'dark'); } catch { applyTheme('dark'); }
  try {
    await S.init(await openDb());
  } catch (e) {
    console.error(e);
    $('lock').hidden = false;
    $('lock').textContent = 'This browser is blocking local storage (private browsing?). Open Gym Log in a normal Chrome window.';
    return;
  }
  showLock();
})();
