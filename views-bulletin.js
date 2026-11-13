// Bulletin: free notes. Pinned notes always stay at the top.
import { h, iconBtn, icon, formDialog, confirmDialog, toast, emptyState } from './ui.js';
import * as S from './store.js';
import * as nav from './nav.js';
import { fmtDate } from './calc.js';

async function edit(note) {
  const x = await formDialog({
    title: note ? 'Edit note' : 'New note', ok: 'Save',
    fields: [{ key: 'text', label: 'Note', value: note?.text || '', multiline: true, rows: 6, placeholder: 'Anything you want to keep in view' }],
    validate: (v) => (!v.text.trim() ? 'Write something first.' : null),
  });
  if (!x) return;
  if (note) S.updateNote(note.id, x.text); else S.addNote(x.text);
  nav.refresh();
}

async function remove(note) {
  if (!(await confirmDialog({ title: 'Remove this note?', message: note.text.length > 80 ? note.text.slice(0, 80) + '…' : note.text, ok: 'Remove', danger: true }))) return;
  S.deleteNote(note.id); toast('Note removed'); nav.refresh();
}

const noteCard = (n) => h('div', { class: 'card note-card' + (n.pinned ? ' is-pinned' : '') },
  h('button', { class: 'note-text', onclick: () => edit(n), 'aria-label': 'Edit note' }, h('span', { text: n.text }), h('span', { class: 'note-date', text: `${n.pinned ? 'Pinned · ' : ''}${fmtDate(n.updatedAt)}` })),
  h('div', { class: 'note-actions' },
    h('button', { class: 'btn btn-sm note-pin' + (n.pinned ? ' is-on' : ''), 'aria-pressed': String(!!n.pinned), 'aria-label': n.pinned ? 'Unpin note' : 'Pin note to top',
      onclick: () => { S.togglePin(n.id); nav.refresh(); } }, icon('pin', 16), h('span', { text: n.pinned ? 'Pinned' : 'Pin' })),
    h('button', { class: 'btn btn-sm', 'aria-label': 'Remove note', onclick: () => remove(n) }, icon('x', 16), h('span', { text: 'Remove' }))));

export function bulletinRoot() {
  const actions = [iconBtn('plus', 'New note', () => edit(null))];
  const notes = S.notesSorted();
  if (!notes.length) {
    return { title: 'Bulletin', subtitle: 'Notes to keep in view', actions,
      content: h('div', { class: 'page' }, emptyState('Nothing here yet', 'Jot down reminders, cues or goals. Pin the important ones and they stay at the top.',
        h('button', { class: 'btn btn-primary', text: 'Add a note', onclick: () => edit(null) }))) };
  }
  const pinned = notes.filter((n) => n.pinned), rest = notes.filter((n) => !n.pinned);
  const content = h('div', { class: 'page' },
    pinned.length ? h('h3', { class: 'month', text: 'Pinned' }) : null,
    pinned.length ? h('div', { class: 'list' }, pinned.map(noteCard)) : null,
    pinned.length && rest.length ? h('h3', { class: 'month', text: 'Notes' }) : null,
    rest.length ? h('div', { class: 'list' }, rest.map(noteCard)) : null);
  return { title: 'Bulletin', subtitle: `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}${pinned.length ? ` · ${pinned.length} pinned` : ''}`, actions, content };
}
