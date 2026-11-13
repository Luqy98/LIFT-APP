// Bootstrap: open storage, show the lock screen, wire tabs, auto-lock and the service worker.
import { openDb } from './db.js';
import * as S from './store.js';
import * as nav from './nav.js';
import { toast, installState, closeAllOverlays, clearTick, backHandlers } from './ui.js';
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
  if (!S.isUnlocked() || S.vaultInfo()?.open) return; // with the lock turned off the app never locks
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

// Inside the Android app the files are bundled in the app itself, so no service worker is needed.
// Android app: take the phone's Back button ourselves. (Browser history entries the page adds without a tap are skipped
// by Android's web view, which made Back close the app after the first step.) Each press closes a sheet, goes back one
// screen, or goes to the Dashboard; only from the Dashboard (or the lock screen) does it leave the app.
{
  const App = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.App;
  App?.addListener?.('backButton', () => {
    if (!document.getElementById('app').hidden) for (const fn of backHandlers) if (fn()) return;
    App.exitApp?.();
  });
}

if ('serviceWorker' in navigator && !window.Capacitor?.isNativePlatform?.()) {
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
  if (S.isSetup() && S.vaultInfo().open) {
    try { if ((await S.openWithoutLock()).ok) { onUnlocked(); return; } } catch (e) { console.error(e); }
  }
  showLock();
})();
