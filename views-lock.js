// Lock screen: first-run passcode setup, and unlock.
import { h, icon, segmented, formDialog, pickFile, toast } from './ui.js';
import * as S from './store.js';
import * as WA from './webauthn.js';

/** All digits => a PIN (4+ digits). Anything else => a passcode (8+ characters). */
export function validateSecret(secret) {
  if (/^\d+$/.test(secret)) return secret.length >= 4 ? null : 'Use at least 4 digits.';
  return secret.length >= 8 ? null : 'Use at least 8 characters.';
}
export const strengthHint = (secret) => {
  if (!/^\d+$/.test(secret) || secret.length >= 8) return '';
  return secret.length < 6
    ? 'A short PIN keeps people out of the app, but it is weak against anyone who could copy the phone’s stored data. Fingerprint and a passcode are stronger.'
    : 'Works, but 8 or more digits is much harder to crack if someone ever copies the phone’s storage.';
};

const nextFrame = () => new Promise((r) => setTimeout(r, 30));

export function renderLock(root, onDone) {
  root.replaceChildren(S.isSetup() ? unlockForm(onDone) : setupForm(onDone));
  const first = root.querySelector('input');
  if (first) requestAnimationFrame(() => first.focus());
}

function setupForm(onDone) {
  let kind = 'pin';
  const p1 = h('input', { type: 'password', class: 'lock-input', autocomplete: 'new-password', inputmode: 'numeric', placeholder: 'PIN (4+ digits)', 'aria-label': 'New passcode' });
  const p2 = h('input', { type: 'password', class: 'lock-input', autocomplete: 'new-password', inputmode: 'numeric', placeholder: 'Repeat PIN', 'aria-label': 'Repeat passcode' });
  const hint = h('div', { class: 'lock-hint' });
  const err = h('div', { class: 'lock-msg', role: 'alert' });
  const btn = h('button', { type: 'submit', class: 'btn btn-primary btn-block', text: 'Create and encrypt' });
  const segHost = h('div', {});

  const draw = () => {
    segHost.replaceChildren(segmented([['pin', 'PIN'], ['pass', 'Passcode']], kind, (v) => { kind = v; draw(); }));
    const numeric = kind === 'pin';
    for (const el of [p1, p2]) el.setAttribute('inputmode', numeric ? 'numeric' : 'text');
    p1.placeholder = numeric ? 'PIN (4+ digits)' : 'Passcode (8+ characters)';
    p2.placeholder = numeric ? 'Repeat PIN' : 'Repeat passcode';
  };
  p1.addEventListener('input', () => { hint.textContent = strengthHint(p1.value); });
  draw();

  return h('form', {
    class: 'lock-card', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      const a = p1.value;
      if (kind === 'pin' && !/^\d+$/.test(a)) { err.textContent = 'A PIN can only contain digits.'; return; }
      const bad = validateSecret(a);
      if (bad) { err.textContent = bad; return; }
      if (a !== p2.value) { err.textContent = 'The two entries don’t match.'; return; }
      btn.disabled = true; btn.textContent = 'Encrypting…';
      await nextFrame();
      try { await S.setup(a); onDone(); }
      catch (ex) { console.error(ex); err.textContent = 'Could not set up secure storage on this browser.'; btn.disabled = false; btn.textContent = 'Create and encrypt'; }
    },
  },
  h('div', { class: 'lock-mark' }, icon('lock', 30)),
  h('h1', { text: 'Gym Log' }),
  h('p', { class: 'lock-lead', text: 'Choose a PIN. Everything you log is encrypted on this phone with a key made from it, and never sent anywhere.' }),
  segHost, p1, p2, hint, err, btn,
  h('button', { type: 'button', class: 'btn btn-block', text: 'Restore from a backup', onclick: () => restoreFlow(onDone) }),
  h('p', { class: 'lock-fine', text: 'There is no reset. If you forget it, the data can’t be recovered, so back up regularly.' }));
}

async function restoreFlow(onDone) {
  const file = await pickFile();
  if (!file) return;
  const text = await file.text();
  let payload = null;
  const v = await formDialog({
    title: 'Restore from backup',
    message: 'Enter the passphrase you chose when making the backup, then pick a PIN or passcode for this phone.',
    fields: [
      { key: 'bp', label: 'Backup passphrase', type: 'password', autocomplete: 'off' },
      { key: 'pin', label: 'New PIN (4+ digits) or passcode (8+)', type: 'password', autocomplete: 'new-password' },
    ],
    ok: 'Restore',
    validate: async (f) => {
      const bad = validateSecret(f.pin);
      if (bad) return bad;
      try { payload = await S.readBackup(f.bp, text); } catch (e) { return e.message; }
      return null;
    },
  });
  if (!v) return;
  try {
    await S.setup(v.pin);
    const r = await S.applyBackup(payload);
    toast(`Restored ${r.routines} routines and ${r.sessions} workouts`);
    onDone();
  } catch (e) { console.error(e); toast(e.message || 'Could not restore that backup.'); }
}

function unlockForm(onDone) {
  const info = S.vaultInfo();
  const input = h('input', {
    type: 'password', class: 'lock-input', autocomplete: 'current-password', enterkeyhint: 'go',
    inputmode: info.numeric ? 'numeric' : 'text', placeholder: info.numeric ? 'PIN' : 'Passcode', 'aria-label': 'Passcode',
  });
  const msg = h('div', { class: 'lock-msg', role: 'alert' });
  const btn = h('button', { type: 'submit', class: 'btn btn-primary btn-block', text: 'Unlock' });
  let timer = null;

  const countdown = (until) => {
    clearInterval(timer);
    const tick = () => {
      const left = Math.ceil((until - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(timer);
        msg.textContent = ''; btn.disabled = false; input.disabled = false; input.focus();
      } else {
        msg.textContent = `Too many wrong attempts. Try again in ${left > 90 ? Math.ceil(left / 60) + ' min' : left + ' s'}.`;
        btn.disabled = true; input.disabled = true;
      }
    };
    tick();
    if (until > Date.now()) timer = setInterval(tick, 500);
  };
  if (info.lockedUntil > Date.now()) countdown(info.lockedUntil);

  let bioBusy = false;
  const tryBio = async (auto) => {
    if (bioBusy) return;
    bioBusy = true;
    try {
      const bytes = await WA.derive(S.bioParams().credId, S.bioParams().salt);
      const res = await S.unlockBio(bytes);
      if (res.ok) { clearInterval(timer); onDone(); return; }
      msg.textContent = 'Fingerprint didn’t unlock your data. Use your PIN.';
    } catch (e) {
      if (!auto) msg.textContent = e.message;
    } finally { bioBusy = false; }
  };
  const bioBtn = info.bio ? h('button', { type: 'button', class: 'btn btn-block bio-btn', onclick: () => tryBio(false) }, icon('finger', 22), h('span', { text: 'Use fingerprint' })) : null;
  if (info.bio) setTimeout(() => tryBio(true), 250);

  return h('form', {
    class: 'lock-card', novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      if (!input.value) return;
      msg.textContent = '';
      btn.disabled = true; btn.textContent = 'Unlocking…';
      await nextFrame();
      let res;
      try { res = await S.unlock(input.value); }
      catch (ex) { console.error(ex); msg.textContent = 'Your data could not be read. Restore a backup if this keeps happening.'; btn.disabled = false; btn.textContent = 'Unlock'; return; }
      btn.textContent = 'Unlock';
      if (res.ok) { clearInterval(timer); input.value = ''; onDone(); return; }
      input.value = '';
      btn.disabled = false;
      if (res.wait) countdown(S.vaultInfo().lockedUntil);
      else { msg.textContent = info.numeric ? 'Wrong PIN.' : 'Wrong passcode.'; input.focus(); }
    },
  },
  h('div', { class: 'lock-mark' }, icon('lock', 30)),
  h('h1', { text: 'Gym Log' }),
  bioBtn, input, msg, btn);
}
