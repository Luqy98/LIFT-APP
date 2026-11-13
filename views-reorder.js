// One "drag to reorder" screen used for weeks, workouts and exercises. It shows only names, each with a drag handle.
import { h, icon, sortableList } from './ui.js';
import { exerciseArt } from './art.js';
import * as nav from './nav.js';

/**
 * opts: { title, subtitle, rows: () => [{ id, name, sub?, color?, deload?, art? }], apply: (ids) => void }
 * rows() is read each time the screen is drawn so it always shows the current order.
 */
export function reorderScreen(opts) {
  const rows = opts.rows().map((r) => ({
    id: r.id,
    el: h('div', { class: `row-card sort-item${r.color != null ? ` wk wk-${r.color}` : ''}` },
      r.art ? h('span', { class: 'art-tile art-sm sort-art', 'aria-hidden': 'true' }, exerciseArt(r.art, 28)) : null,
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, r.color != null ? h('span', { class: 'wk-dot' }) : null, h('span', { text: r.name }), r.deload ? h('span', { class: 'tag-deload', text: 'Deload' }) : null),
        r.sub ? h('span', { class: 'row-sub', text: r.sub }) : null),
      h('span', { class: 'drag-handle', role: 'button', 'aria-label': `Drag ${r.name} to reorder` }, icon('grip', 22))),
  }));
  const content = h('div', { class: 'page' },
    h('p', { class: 'hint', text: opts.hint || 'Drag the handle on the right to move an item where you want it.' }),
    sortableList(rows, (ids) => opts.apply(ids)));
  return { title: opts.title, subtitle: opts.subtitle, color: opts.color, content };
}

export const openReorder = (opts) => nav.push(reorderScreen, opts);
