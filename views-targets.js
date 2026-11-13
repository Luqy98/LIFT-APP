// Targets: pick a 1RM goal for any exercise and watch the progress towards it.
import { h, iconBtn, formDialog, choiceSheet, confirmDialog, toast, emptyState } from './ui.js';
import * as S from './store.js';
import * as nav from './nav.js';
import { fmt, fmtW } from './calc.js';
import { exerciseArt } from './art.js';

const daysText = (date) => {
  const n = S.daysLeft(date);
  return n < 0 ? `${-n} ${-n === 1 ? 'day' : 'days'} overdue` : n === 0 ? 'Due today' : `${n} ${n === 1 ? 'day' : 'days'} left`;
};
const step5 = (n) => Math.round(n / 5) * 5;

async function askTarget(title, current, best, curDate) {
  const suggest = best != null ? Math.ceil((best * 1.1) / 2.5) * 2.5 : null;
  const x = await formDialog({
    title,
    fields: [{ key: 'kg', label: 'Target 1RM (kg)', value: current != null ? String(current) : '', placeholder: suggest != null ? `e.g. ${fmtW(suggest)}` : 'e.g. 100', type: 'text', inputmode: 'decimal',
      hint: best != null ? `Your best estimated 1RM is ${fmt(best)} kg` : 'No estimated 1RM logged for this exercise yet' },
    { key: 'date', label: 'Target date (optional)', value: curDate || '', type: 'date', hint: 'Shows days left on the card and the chart' }],
    validate: (v) => {
      const n = parseFloat(String(v.kg).replace(',', '.'));
      if (!(n > 0 && n <= 1000)) return 'Enter a weight in kg, for example 140.';
      if (v.date && S.daysLeft(v.date) < 0) return 'Pick a date that is today or later.';
      return null;
    },
  });
  return x ? { kg: parseFloat(String(x.kg).replace(',', '.')), date: x.date || '' } : null;
}

async function addTarget() {
  const have = new Set(S.data.targets.map((t) => t.exerciseId));
  const free = S.data.exercises.filter((e) => !e.archived && !have.has(e.id)).sort((a, b) => a.name.localeCompare(b.name));
  if (!free.length) { toast('Every exercise already has a target'); return; }
  const id = await choiceSheet({
    title: 'Target for which exercise?', compact: true,
    options: free.map((e) => { const b = S.bestE1rm(e.id); return { label: e.name, sub: b != null ? `Best 1RM ${fmt(b)} kg` : 'No 1RM logged yet', value: e.id }; }),
  });
  if (!id) return;
  const r = await askTarget('Set 1RM target', null, S.bestE1rm(id), '');
  if (!r) return;
  S.setTarget(id, r.kg, r.date);
  toast('Target set');
  nav.refresh();
}

async function targetMenu(t, name) {
  const v = await choiceSheet({ title: name, options: [
    { label: 'Change target', value: 'edit' },
    { label: 'Remove target', value: 'del', danger: true },
  ] });
  if (v === 'edit') {
    const r = await askTarget(`Target for ${name}`, t.kg, S.bestE1rm(t.exerciseId), t.date);
    if (r) { S.setTarget(t.exerciseId, r.kg, r.date); nav.refresh(); }
  } else if (v === 'del') {
    if (await confirmDialog({ title: `Remove the target for ${name}?`, message: 'Your logs are not affected. The dotted target line disappears from its chart.', ok: 'Remove target', danger: true })) {
      S.removeTarget(t.exerciseId); toast('Target removed'); nav.refresh();
    }
  }
}

export function targetsRoot() {
  const actions = [iconBtn('plus', 'Add a target', addTarget)];
  if (!S.data.targets.length) {
    return { title: 'Targets', subtitle: 'Goals for your estimated 1RM', actions,
      content: h('div', { class: 'page' }, emptyState('No targets yet', 'Pick an exercise and a 1RM to aim for. You’ll see your progress here and a dotted target line on its chart.',
        h('button', { class: 'btn btn-primary', text: 'Set a target', onclick: addTarget })) ) };
  }
  const rows = S.data.targets.map((t) => {
    const name = S.exerciseName(t.exerciseId);
    const best = S.bestE1rm(t.exerciseId);
    const ratio = best != null ? best / t.kg : 0;
    const pct = Math.min(100, Math.floor(ratio * 100));
    const done = best != null && best >= t.kg;
    return { t, name, best, pct, done };
  });
  const content = h('div', { class: 'page' },
    h('div', { class: 'list' }, rows.map(({ t, name, best, pct, done }) =>
      h('button', { class: 'card target-card' + (done ? ' is-done' : ''), onclick: () => targetMenu(t, name), 'aria-label': `${name}, ${pct}% of target. Tap for options` },
        h('div', { class: 'target-top' },
          h('span', { class: 'art-tile', 'aria-hidden': 'true' }, exerciseArt(name, 34)),
          h('span', { class: 'target-main' },
            h('span', { class: 'row-title', text: name }),
            h('span', { class: 'row-sub', text: best != null ? `Now ${fmt(best)} kg · Target ${fmtW(t.kg)} kg` : `No 1RM logged yet · Target ${fmtW(t.kg)} kg` })),
          h('span', { class: 'target-pct', text: `${pct}%` })),
        h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': `${name} progress to target` },
          pct > 0 ? h('div', { class: 'meter-fill' + (done ? ' meter-done' : '') + ' w-' + step5(pct) }) : null),
        h('div', { class: 'target-foot' },
          h('span', { text: done ? 'Target reached' : best != null ? `${fmt(t.kg - best)} kg to go` : 'Log a set to start tracking' }),
          t.date ? h('span', { class: 'target-days' + (!done && S.daysLeft(t.date) < 0 ? ' is-late' : ''), text: daysText(t.date) }) : null)))));
  return { title: 'Targets', subtitle: `${rows.length} ${rows.length === 1 ? 'goal' : 'goals'}`, actions, content };
}
