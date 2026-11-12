// Optional notes on an exercise inside a workout (the plan) or inside a logged workout. Nothing is shown until a note is added.
//   Lifting cues: reminders for how to lift. General note: anything else.
import { h, formDialog, choiceSheet } from './ui.js';

export const NOTE_TYPES = [
  { key: 'cues', label: 'Lifting Cues', sub: 'Reminders for how to perform the lifts', placeholder: 'e.g. Brace first, elbows tucked, pause on the chest' },
  { key: 'general', label: 'General Note', sub: 'Anything else about this exercise', placeholder: 'e.g. Felt strong, sleep was poor' },
];

async function editNote(owner, type, save) {
  const v = await formDialog({
    title: type.label,
    message: owner.notes && owner.notes[type.key] ? 'Clear the text to remove this note.' : null,
    fields: [{ key: 'text', label: type.label, value: (owner.notes && owner.notes[type.key]) || '', placeholder: type.placeholder, multiline: true, rows: 5 }],
    ok: 'Save',
  });
  if (!v) return false;
  if (!owner.notes) owner.notes = {};
  const text = v.text.trim();
  if (text) owner.notes[type.key] = text; else delete owner.notes[type.key];
  save();
  return true;
}

/** Notes already added, as tappable coloured blocks (null when there are none). */
export function notesList(owner, save, refresh) {
  const present = NOTE_TYPES.filter((t) => owner.notes && owner.notes[t.key]);
  if (!present.length) return null;
  return h('div', { class: 'notes-block' }, present.map((t) => h('button', {
    class: `note note-${t.key}`, 'aria-label': `Edit ${t.label}`,
    onclick: async () => { if (await editNote(owner, t, save)) refresh(); },
  }, h('span', { class: 'note-label', text: t.label }), h('span', { class: 'note-text', text: owner.notes[t.key] }))));
}

export const canAddNote = (owner) => NOTE_TYPES.some((t) => !(owner.notes && owner.notes[t.key]));

/** Asks which kind (when both are free) and opens the editor. */
export async function addNote(owner, save, refresh) {
  if (!owner.notes) owner.notes = {};
  const missing = NOTE_TYPES.filter((t) => !owner.notes[t.key]);
  if (!missing.length) return;
  let type = missing[0];
  if (missing.length > 1) {
    const k = await choiceSheet({ title: 'Add a note', options: missing.map((t) => ({ label: t.label, sub: t.sub, value: t.key })) });
    if (!k) return;
    type = NOTE_TYPES.find((t) => t.key === k);
  }
  if (await editNote(owner, type, save)) refresh();
}

/** Edits one free text field on `owner` (e.g. the note on a whole logged workout). Empty text removes it. */
export async function editFreeNote(owner, field, label, save) {
  const v = await formDialog({
    title: label, message: owner[field] ? 'Clear the text to remove this note.' : null,
    fields: [{ key: 'text', label, value: owner[field] || '', placeholder: 'How did it go? Anything to remember?', multiline: true, rows: 5 }],
    ok: 'Save',
  });
  if (!v) return false;
  const text = v.text.trim();
  if (text) owner[field] = text; else delete owner[field];
  save();
  return true;
}
