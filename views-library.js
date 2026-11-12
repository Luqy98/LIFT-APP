// Exercises tab: the shared library every workout draws from, so "Bench Press" is one exercise everywhere.
import { h, iconBtn, formDialog, choiceSheet, confirmDialog, toast, emptyState } from './ui.js';
import * as S from './store.js';
import * as nav from './nav.js';
import { fmtDate } from './calc.js';
import { exerciseArt, exerciseKind, GROUPS } from './art.js';
import { selectMovement } from './views-dash.js';

const lib = { q: '', g: 'All' };

async function addMovement() {
  const v = await formDialog({
    title: 'New exercise', fields: [{ key: 'name', label: 'Exercise name', placeholder: 'e.g. Pause Bench Press', capitalize: 'words' }],
    ok: 'Add', validate: (f) => (!f.name.trim() ? 'Give the exercise a name.' : null),
  });
  if (!v) return;
  const existed = S.findExerciseByName(v.name);
  S.addExercise(v.name);
  toast(existed ? 'That exercise already exists' : 'Exercise added');
  nav.refresh();
}

async function movementMenu(e, stats) {
  const used = S.exerciseUsage(e.id);
  const inUse = used.plan || used.logs;
  const v = await choiceSheet({
    title: e.name,
    options: [
      { label: 'Rename', value: 'rename' },
      ...(stats ? [{ label: 'View on dashboard', value: 'dash' }] : []),
      inUse ? { label: 'Archive', value: 'del', sub: 'Hides it from the picker. Past logs and charts are kept.' } : { label: 'Delete', value: 'del', danger: true },
    ],
  });
  if (v === 'rename') {
    const x = await formDialog({
      title: 'Rename exercise', message: 'Every workout and past log using it shows the new name.',
      fields: [{ key: 'name', label: 'Exercise name', value: e.name, capitalize: 'words' }],
      validate: (f) => (!f.name.trim() ? 'Name can’t be empty.' : S.findExerciseByName(f.name, e.id) ? 'You already have an exercise with that name.' : null),
    });
    if (x) { S.renameExercise(e.id, x.name); nav.refresh(); }
  } else if (v === 'dash') {
    selectMovement(e.id);
    nav.switchTab('dashboard');
  } else if (v === 'del') {
    if (!inUse && !(await confirmDialog({ title: `Delete ${e.name}?`, ok: 'Delete', danger: true }))) return;
    const r = S.removeExercise(e.id);
    toast(r === 'archived' ? 'Archived. Past logs are kept.' : 'Deleted');
    nav.refresh();
  }
}

export function movementsRoot() {
  const have = S.exercisesWithData();
  const list = h('div', { class: 'list' });
  const archivedBox = h('div', {});

  const draw = () => {
    const q = lib.q.trim().toLowerCase();
    const items = S.data.exercises.filter((e) => !e.archived && e.name.toLowerCase().includes(q) && (lib.g === 'All' || exerciseKind(e.name).group === lib.g)).sort((a, b) => a.name.localeCompare(b.name));
    list.replaceChildren(...(items.length ? items.map((e) => {
      const st = have.get(e.id);
      return h('div', { class: 'row-card ex-row' },
        h('span', { class: 'art-tile', 'aria-hidden': 'true' }, exerciseArt(e.name, 34)),
        h('button', { class: 'row-main row-btn', onclick: () => movementMenu(e, st) },
          h('span', { class: 'row-title', text: e.name }),
          h('span', { class: 'row-sub', text: `${exerciseKind(e.name).group === 'Other' ? '' : exerciseKind(e.name).group + ' · '}${st ? `Trained ${st.count} ${st.count === 1 ? 'time' : 'times'} · last ${fmtDate(st.last)}` : 'Not logged yet'}` })),
        iconBtn('more', `Options for ${e.name}`, () => movementMenu(e, st)));
    }) : [h('p', { class: 'hint', text: q ? 'No match. Add it with the + button.' : 'No exercises yet.' })]));

    const arch = S.data.exercises.filter((e) => e.archived).sort((a, b) => a.name.localeCompare(b.name));
    archivedBox.replaceChildren(...(arch.length ? [h('details', { class: 'archived' },
      h('summary', { text: `Archived (${arch.length})` }),
      h('div', { class: 'list' }, arch.map((e) => h('div', { class: 'row-card' },
        h('span', { class: 'row-main' }, h('span', { class: 'row-title', text: e.name })),
        h('button', { class: 'btn btn-sm', text: 'Restore', onclick: () => { S.restoreExercise(e.id); nav.refresh(); } })))))] : []));
  };
  draw();

  const search = h('input', {
    type: 'search', class: 'search', placeholder: 'Search exercises', autocomplete: 'off', value: lib.q, 'aria-label': 'Search exercises',
    oninput: (e) => { lib.q = e.target.value; draw(); },
  });
  return {
    title: 'Exercises', subtitle: `${S.data.exercises.filter((e) => !e.archived).length} in your library`,
    actions: [iconBtn('plus', 'New exercise', addMovement)],
    content: h('div', { class: 'page' }, search,
      h('div', { class: 'chips-row', role: 'group', 'aria-label': 'Filter by group' }, ['All', ...GROUPS].map((g) =>
        h('button', { type: 'button', class: 'fchip' + (lib.g === g ? ' is-on' : ''), 'aria-pressed': String(lib.g === g), text: g, onclick: () => { lib.g = g; nav.refresh(); } }))),
      list, archivedBox),
  };
}
