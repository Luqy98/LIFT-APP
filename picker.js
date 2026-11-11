// Movement picker: search the library, or create a new movement on the spot.
import { h, sheet } from './ui.js';
import * as S from './store.js';

/** -> exerciseId | null */
export function pickMovement({ title = 'Add movement' } = {}) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (v) => { if (!finished) { finished = true; resolve(v); } };
    const list = h('div', { class: 'picker-list' });
    const search = h('input', {
      type: 'search', class: 'search', placeholder: 'Search or create a movement', autocomplete: 'off',
      autocapitalize: 'words', enterkeyhint: 'search', 'aria-label': 'Search movements',
    });
    const choose = (id) => { finish(id); close(); };
    const render = () => {
      const q = search.value.trim();
      const ql = q.toLowerCase();
      const rows = S.data.exercises
        .filter((e) => !e.archived && e.name.toLowerCase().includes(ql))
        .sort((a, b) => a.name.localeCompare(b.name));
      const out = [];
      if (q && !S.findExerciseByName(q)) {
        out.push(h('button', { class: 'choice choice-create', onclick: () => choose(S.addExercise(q).id) },
          h('span', { class: 'choice-main' }, h('span', { class: 'choice-label', text: `Create “${q}”` }), h('span', { class: 'choice-sub', text: 'Adds it to your movement library' }))));
      }
      rows.forEach((e) => out.push(h('button', { class: 'choice', onclick: () => choose(e.id) }, h('span', { class: 'choice-main' }, h('span', { class: 'choice-label', text: e.name })))));
      if (!out.length) out.push(h('p', { class: 'sheet-msg', text: 'No movements yet. Type a name to create one.' }));
      list.replaceChildren(...out);
    };
    search.addEventListener('input', render);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const q = search.value.trim(); if (q) choose((S.findExerciseByName(q) || S.addExercise(q)).id); }
    });
    const { close } = sheet(h('div', { class: 'picker' }, search, list), { title, wide: true, onClose: () => finish(null) });
    render();
    requestAnimationFrame(() => search.focus());
  });
}
