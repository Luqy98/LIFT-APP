// Settings: security, training preferences, appearance, backup/restore, install.
import { h, card, selectField, segmented, formDialog, choiceSheet, confirmDialog, toast, installState, pickFile } from './ui.js';
import * as WA from './webauthn.js';
import { runBackup } from './backup.js';
import * as S from './store.js';
import * as nav from './nav.js';
import { FORMULAS, fmtDateLong } from './calc.js';
import { applyTheme } from './theme.js';
import { validateSecret, strengthHint } from './views-lock.js';
import { VERSION } from './version.js';

const set = (k, v) => { S.data.settings[k] = v; S.touch(); nav.refresh(); };

async function changePasscode() {
  const numeric = S.vaultInfo().numeric;
  if (S.vaultInfo().bio) {
    const how = await choiceSheet({ title: 'Change PIN or passcode', options: [
      { label: 'I know my current PIN', value: 'pin' },
      { label: 'I forgot it: use my fingerprint', value: 'bio' }], cancel: 'Cancel' });
    if (how == null) return;
    if (how === 'bio') return resetWithFingerprint(numeric);
  }
  const v = await formDialog({
    title: 'Change PIN or passcode',
    message: 'Your data is re-protected instantly with the new one.',
    fields: [
      { key: 'cur', label: 'Current', type: 'password', autocomplete: 'current-password', inputmode: numeric ? 'numeric' : 'text' },
      { key: 'next', label: 'New (4+ digits, or 8+ characters)', type: 'password', autocomplete: 'new-password', inputmode: numeric ? 'numeric' : 'text' },
      { key: 'again', label: 'Repeat new', type: 'password', autocomplete: 'new-password', inputmode: numeric ? 'numeric' : 'text' },
    ],
    ok: 'Change',
    validate: async (f) => {
      const bad = validateSecret(f.next);
      if (bad) return bad;
      if (f.next !== f.again) return 'The new entries don’t match.';
      if (f.next === f.cur) return 'Choose something different from the current one.';
      return (await S.changePasscode(f.cur, f.next)) ? null : 'The current passcode is wrong.';
    },
  });
  if (v) toast('Passcode changed');
}

async function resetWithFingerprint(numeric) {
  let bytes;
  try { const p = S.bioParams(); bytes = await WA.derive(p.credId, p.salt); }
  catch (e) { toast(e.message || 'Fingerprint check failed.'); return; }
  const v = await formDialog({
    title: 'Choose a new PIN or passcode',
    message: 'Your fingerprint is verified. Pick a new PIN or passcode and write it down somewhere safe.',
    fields: [
      { key: 'next', label: 'New (4+ digits, or 8+ characters)', type: 'password', autocomplete: 'new-password', inputmode: numeric ? 'numeric' : 'text' },
      { key: 'again', label: 'Repeat new', type: 'password', autocomplete: 'new-password', inputmode: numeric ? 'numeric' : 'text' },
    ],
    ok: 'Set new PIN',
    validate: async (f) => {
      const bad = validateSecret(f.next);
      if (bad) return bad;
      if (f.next !== f.again) return 'The new entries don’t match.';
      return (await S.resetPasscodeWithBio(f.next, bytes)) ? null : 'Could not set the new PIN. Try again.';
    },
  });
  if (v) toast('New PIN set');
}

async function checkUpdate() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) { toast('Updates aren’t available in this browser window.'); return; }
    await reg.update();
    toast(reg.installing || reg.waiting ? 'Update found. It will ask you to reload.' : `You're on the latest version (${VERSION}).`, { ms: 4000 });
  } catch { toast('Couldn’t check. Are you online?'); }
}

async function enableFingerprint() {
  if (!(await WA.fingerprintAvailable())) { toast('This phone has no fingerprint or screen lock set up for Chrome.', { ms: 6000 }); return; }
  const v = await formDialog({
    title: 'Turn on fingerprint',
    message: 'Enter your PIN once to confirm. Then your phone will ask for your fingerprint. Your PIN keeps working as a backup way in.',
    fields: [{ key: 'cur', label: 'Current PIN or passcode', type: 'password', autocomplete: 'current-password', inputmode: S.vaultInfo().numeric ? 'numeric' : 'text' }],
    ok: 'Continue',
    validate: async (f) => ((await S.verifyPasscode(f.cur)) ? null : 'That PIN or passcode is wrong.'),
  });
  if (!v) return;
  try {
    const enrolled = await WA.enroll();
    const ok = await S.enableBio(v.cur, enrolled);
    toast(ok ? 'Fingerprint unlock is on' : 'Could not turn it on.');
  } catch (e) { toast(e.message, { ms: 7000 }); }
  nav.refresh();
}
async function disableFingerprint() {
  await S.disableBio();
  toast('Fingerprint unlock is off');
  nav.refresh();
}

async function importBackup() {
  const file = await pickFile();
  if (!file) return;
  const text = await file.text();
  const ok = await confirmDialog({ title: 'Replace everything with this backup?', message: 'Your current routines, logs and settings on this phone will be overwritten.', ok: 'Continue', danger: true });
  if (!ok) return;
  let result = null;
  const v = await formDialog({
    title: 'Backup passphrase', fields: [{ key: 'p', label: 'Passphrase used when exporting', type: 'password', autocomplete: 'off' }], ok: 'Restore',
    validate: async (f) => { try { result = await S.importBackup(f.p, text); return null; } catch (e) { return e.message; } },
  });
  if (!v) return;
  toast(`Restored ${result.routines} routines and ${result.sessions} workouts`);
  nav.resetAll();
  nav.refresh();
}

async function wipe() {
  const v = await formDialog({
    title: 'Erase all data?', danger: true, ok: 'Erase everything',
    message: 'This permanently deletes every routine, log and your passcode from this phone. Export a backup first if you might want it back.',
    fields: [{ key: 'confirm', label: 'Type DELETE to confirm', autocomplete: 'off', capitalize: 'characters' }],
    validate: (f) => (f.confirm.trim() === 'DELETE' ? null : 'Type DELETE exactly to continue.'),
  });
  if (!v) return;
  await S.wipeAll();
  try { localStorage.removeItem('gymlog-theme'); } catch { /* ignore */ }
  location.reload();
}

export function settingsRoot() {
  const st = S.data.settings;
  const persistLine = h('span', { class: 'hint', text: 'Checking…' });
  navigator.storage?.persisted?.().then((p) => { persistLine.textContent = p ? 'Protected from automatic cleanup by the browser.' : 'Not guaranteed. The browser may clear data if the phone is very low on space, so export backups.'; })
    .catch(() => { persistLine.textContent = ''; });

  const content = h('div', { class: 'page' },
    card('About',
      h('div', { class: 'row-between' },
        h('div', { class: 'row-main ver' }, h('span', { class: 'row-title', text: `Version ${VERSION}` }), h('span', { class: 'row-sub', text: 'Shown here so you can tell when an update has installed' })),
        h('button', { class: 'btn btn-sm', text: 'Check for update', onclick: checkUpdate }))),
    card('Security',
      selectField('Lock after leaving the app', [[0, 'Immediately'], [1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes']], st.autoLockMin, (v) => set('autoLockMin', +v)),
      h('div', { class: 'row-between' },
        h('div', {}, h('div', { class: 'row-title', text: 'Fingerprint unlock' }), h('div', { class: 'hint', text: S.vaultInfo().bio ? 'On. Your PIN still works too.' : 'Off' })),
        S.vaultInfo().bio
          ? h('button', { class: 'btn btn-sm', text: 'Turn off', onclick: disableFingerprint })
          : h('button', { class: 'btn btn-sm btn-primary', text: 'Turn on', onclick: enableFingerprint })),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', text: 'Change PIN or passcode', onclick: changePasscode }),
        h('button', { class: 'btn', text: 'Lock now', onclick: () => window.dispatchEvent(new Event('gymlog:lock')) })),
      h('p', { class: 'hint', text: 'Data is encrypted on this phone (AES-256). A 4-digit PIN only has 10,000 combinations, so it protects against people using your phone, not against someone copying its stored data. For that, use a longer passcode.' })),

    card('Profile',
      h('div', { class: 'row-between' },
        h('div', { class: 'row-main ver' }, h('span', { class: 'row-title', text: 'Your name' }), h('span', { class: 'row-sub', text: st.name ? `Greeting shows “${st.name}”` : 'Not set' })),
        h('button', { class: 'btn btn-sm', text: 'Change', onclick: async () => {
          const v = await formDialog({ title: 'Your name', message: 'Used for the greeting on the dashboard. It stays on this phone.', fields: [{ key: 'name', label: 'Name', value: st.name || '', autocomplete: 'off' }], ok: 'Save' });
          if (v) set('name', v.name.trim().slice(0, 30));
        } })),
      selectField('Workouts per week (goal)', [1, 2, 3, 4, 5, 6, 7].map((n) => [n, `${n} ${n === 1 ? 'workout' : 'workouts'}`]), st.weeklyGoal || 4, (v) => set('weeklyGoal', +v))),
    card('Training',
      selectField('Estimated 1RM formula', Object.entries(FORMULAS).map(([k, f]) => [k, k === 'blend' ? 'Blend of three' : f.label]), st.formula, (v) => set('formula', v)),
      selectField('Count sets up to', [5, 6, 8, 10, 12, 15].map((n) => [n, `${n} reps`]), st.maxReps, (v) => set('maxReps', +v)),
      selectField('Rest timer', [[0, 'Off'], [60, '1:00'], [90, '1:30'], [120, '2:00'], [150, '2:30'], [180, '3:00'], [240, '4:00'], [300, '5:00']], st.restSec, (v) => set('restSec', +v)),
      h('p', { class: 'hint', text: 'Estimates get less reliable as reps go up, so sets above the limit are left out of the 1RM chart. Warm-up and drop sets are never used. The blend averages three well-known formulas to smooth out any single formula’s bias.' })),

    card('Appearance',
      segmented([['dark', 'Dark'], ['light', 'Light'], ['system', 'Match phone']], st.theme, (v) => { applyTheme(v); set('theme', v); })),

    card('Backup and restore',
      h('p', { class: 'hint', text: st.lastBackup ? `Last backup: ${fmtDateLong(st.lastBackup)}` : 'No backup yet.' }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', text: 'Back up now', onclick: async () => { await runBackup(); nav.refresh(); } }),
        h('button', { class: 'btn', text: 'Restore from backup', onclick: importBackup })),
      h('p', { class: 'hint', text: 'Clearing Chrome’s “Cookies and site data” deletes this app’s data (clearing only browsing history or cached files does not). Back up before you clear, and keep the file in Google Drive or email.' }),
      persistLine,
      h('button', { class: 'btn btn-sm', text: 'Ask the browser to protect this data', onclick: async () => {
        const ok = await navigator.storage?.persist?.();
        toast(ok ? 'Storage protected' : 'The browser declined for now');
        nav.refresh();
      } })),

    card('Install',
      installState.prompt
        ? h('button', { class: 'btn btn-primary', text: 'Install app on this phone', onclick: async () => { installState.prompt.prompt(); installState.prompt = null; nav.refresh(); } })
        : h('p', { class: 'hint', text: 'In Chrome, open the ⋮ menu and choose “Install app” (or “Add to Home screen”). Once installed it opens full-screen and works offline.' })),

    card('Danger zone', h('button', { class: 'btn btn-danger', text: 'Erase all data', onclick: wipe })),
    h('p', { class: 'foot', text: `LIFT ${VERSION}` }));

  return { title: 'Settings', content };
}
