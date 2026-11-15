// Exercise picker: choose from the library, searching or filtering by body part. Exercises are created and edited in the library only.
import { h, sheet } from './ui.js';
import * as S from './store.js';
import { exerciseArt } from './art.js';
import { groupFor, MUSCLE_GROUPS } from './muscles.js';

let lastGroup = 'All';

/** -> exerciseId | null */
export function pickMovement({ title = 'Add exercise' } = {}) {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (v) => { if (!finished) { finished = true; resolve(v); } };
    const list = h('div', { class: 'picker-list' });
    const search = h('input', {
      type: 'search', class: 'search', placeholder: 'Search exercises', autocomplete: 'off',
      autocapitalize: 'words', enterkeyhint: 'search', 'aria-label': 'Search exercises',
    });
    const choose = (id) => { finish(id); close(); };
    let group = lastGroup;
    const chips = h('div', { class: 'chips-row', role: 'group', 'aria-label': 'Filter by body part' });
    const drawChips = () => chips.replaceChildren(...['All', ...MUSCLE_GROUPS].map((g) =>
      h('button', { type: 'button', class: 'fchip' + (group === g ? ' is-on' : ''), 'aria-pressed': String(group === g), text: g,
        onclick: () => { group = lastGroup = g; drawChips(); render(); } })));
    const render = () => {
      const ql = search.value.trim().toLowerCase();
      const rows = S.data.exercises
        .filter((e) => !e.archived && e.name.toLowerCase().includes(ql) && (group === 'All' || groupFor(e) === group))
        .sort((a, b) => a.name.localeCompare(b.name));
      const out = rows.map((e) => h('button', { class: 'choice choice-art', onclick: () => choose(e.id) },
        h('span', { class: 'art-tile art-sm', 'aria-hidden': 'true' }, exerciseArt(e.name, 28)),
        h('span', { class: 'choice-main' }, h('span', { class: 'choice-label', text: e.name }),
          groupFor(e) === 'Other' ? null : h('span', { class: 'choice-sub', text: groupFor(e) }))));
      if (!out.length) out.push(h('p', { class: 'sheet-msg', text: ql || group !== 'All' ? 'No exercises match. Add new exercises from the Exercises tab.' : 'No exercises yet. Add them from the Exercises tab.' }));
      list.replaceChildren(...out);
    };
    search.addEventListener('input', render);
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search.blur(); } });
    const { close, panel } = sheet(h('div', { class: 'picker' }, search, chips, list), { title, wide: true, onClose: () => finish(null) });
    panel.classList.add('sheet-picker');
    drawChips();
    render();
    requestAnimationFrame(() => search.focus());
  });
}
