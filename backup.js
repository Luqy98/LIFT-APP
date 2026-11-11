// One-tap encrypted backup: encrypt, then hand the file to the phone's share sheet (Drive, email, Files…)
// or fall back to a normal download. The backup has its own passphrase and is useless without it.
import { formDialog, confirmDialog, toast, h } from './ui.js';
import * as S from './store.js';

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Shares if the phone supports file sharing, otherwise downloads. Resolves 'shared' | 'saved' | 'cancelled'. */
export async function deliver(name, text) {
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Gym Log backup' });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
    // anything else (e.g. sharing blocked): fall through to a download
  }
  download(name, text);
  return 'saved';
}

/** Full flow used by Settings and the reminder banner. Returns true if a backup was delivered. */
export async function runBackup() {
  const v = await formDialog({
    title: 'Back up your data',
    message: 'This makes an encrypted file you can keep in Google Drive, email or your files. It can only be opened with the passphrase you choose now, so remember it.',
    fields: [
      { key: 'p1', label: 'Backup passphrase (8+ characters)', type: 'password', autocomplete: 'new-password' },
      { key: 'p2', label: 'Repeat passphrase', type: 'password', autocomplete: 'new-password' },
    ],
    ok: 'Create backup',
    validate: (f) => (f.p1.length < 8 ? 'Use at least 8 characters.' : f.p1 !== f.p2 ? 'The two entries don’t match.' : null),
  });
  if (!v) return false;
  const text = await S.exportBackup(v.p1);
  const name = `gymlog-backup-${new Date().toISOString().slice(0, 10)}.json`;
  // A fresh tap is needed for the share sheet, because encrypting takes a moment.
  const go = await confirmDialog({ title: 'Backup ready', message: 'Choose where to keep it, for example Google Drive or an email to yourself.', ok: 'Share or save' });
  if (!go) return false;
  const how = await deliver(name, text);
  if (how === 'cancelled') return false;
  S.markBackedUp();
  toast(how === 'shared' ? 'Backup shared' : 'Backup saved to your downloads');
  return true;
}
