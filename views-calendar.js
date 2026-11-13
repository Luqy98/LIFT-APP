// Month calendar: which days you trained, how long, and whether it was a normal or deload workout.
import { h, tile, emptyState, icon } from './ui.js';
import * as S from './store.js';
import * as nav from './nav.js';
import { fmtDate, fmt, fmtW } from './calc.js';
import { sessionView } from './views-session.js';

const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mins = (s) => Math.max(0, Math.round((new Date(s.finishedAt) - new Date(s.startedAt)) / 60000));
const fmtMins = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? pad(m % 60) : ''}` : `${m}m`);
const fmtMinsLong = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function calendarView(params) {
  const today = new Date();
  if (!params.month) params.month = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const first = new Date(params.month);
  if (!params.day) params.day = keyOf(today);
  const monthLabel = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  // Finished workouts by local day
  const byDay = new Map();
  for (const s of S.sessionsDesc((x) => x.finishedAt)) {
    const k = keyOf(new Date(s.startedAt));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s);
  }
  for (const list of byDay.values()) list.reverse(); // earliest first within a day
  // Target dates and the days targets were reached
  const targetsOn = new Map();
  const mark = (k, item) => { if (!targetsOn.has(k)) targetsOn.set(k, []); targetsOn.get(k).push(item); };
  for (const t of S.data.targets) {
    if (t.reachedAt) mark(t.reachedAt, { kind: 'won', t });
    if (t.date) mark(t.date, { kind: 'due', t });
  }

  const shiftMonth = (n) => { params.month = new Date(first.getFullYear(), first.getMonth() + n, 1).toISOString(); params.day = null; nav.refresh(); };
  const atCurrent = first.getFullYear() === today.getFullYear() && first.getMonth() === today.getMonth();

  // Month totals
  let workouts = 0, deloads = 0, total = 0;
  const lead = (first.getDay() + 6) % 7; // Monday-first offset
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(h('span', { class: 'cal-blank' }));
  for (let d = 1; d <= daysIn; d++) {
    const date = new Date(first.getFullYear(), first.getMonth(), d);
    const k = keyOf(date);
    const list = byDay.get(k) || [];
    const hasN = list.some((s) => !s.deload), hasD = list.some((s) => s.deload);
    const m = list.reduce((n, s) => n + mins(s), 0);
    workouts += list.length; deloads += list.filter((s) => s.deload).length; total += m;
    const cls = ['cal-day', hasN && hasD ? 'cal-both' : hasD ? 'cal-del' : hasN ? 'cal-reg' : '', k === keyOf(today) ? 'is-today' : '', k === params.day ? 'is-sel' : '', targetsOn.has(k) ? 'has-target' : ''].filter(Boolean).join(' ');
    cells.push(h('button', { class: cls, 'aria-label': `${fmtDate(date.toISOString())}${list.length ? `, ${list.length} workout${list.length > 1 ? 's' : ''}, ${m} minutes${hasD ? ', includes deload' : ''}` : ', no workouts'}`,
      onclick: () => { params.day = k; nav.refresh(); } },
      h('span', { class: 'cal-num', text: String(d) }),
      h('span', { class: 'cal-min', text: list.length ? fmtMins(m) : '' }),
      targetsOn.has(k) ? h('span', { class: 'cal-mark' + (targetsOn.get(k).some((x) => x.kind === 'won') ? ' is-won' : ''), 'aria-hidden': 'true' }, icon(targetsOn.get(k).some((x) => x.kind === 'won') ? 'trophy' : 'target', 11)) : null));
  }

  const selList = byDay.get(params.day) || [];
  const selDate = params.day ? new Date(params.day + 'T12:00:00') : null;
  const detail = [];
  if (selDate) {
    detail.push(h('h3', { class: 'month', text: selDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) }));
    for (const { kind, t } of targetsOn.get(params.day) || []) {
      const name = S.exerciseName(t.exerciseId);
      detail.push(h('div', { class: 'row-card cal-target' + (kind === 'won' ? ' is-won' : '') },
        icon(kind === 'won' ? 'trophy' : 'target', 20),
        h('span', { class: 'row-main' },
          h('span', { class: 'row-title', text: kind === 'won' ? `Target reached · ${name}` : `Target date · ${name}` }),
          h('span', { class: 'row-sub', text: kind === 'won' ? `Estimated 1RM ${fmt(t.reachedKg)} kg, target ${fmtW(t.kg)} kg` : t.reachedAt ? `Target ${fmtW(t.kg)} kg, reached` : `Target ${fmtW(t.kg)} kg` }))));
    }
    if (!selList.length) detail.push(h('p', { class: 'hint', text: 'No workouts logged this day.' }));
    for (const s of selList) {
      detail.push(h('button', { class: `row-card row-btn wk wk-${S.sessionColor(s)}`, onclick: () => nav.push(sessionView, { sessionId: s.id }) },
        h('span', { class: 'row-main' },
          h('span', { class: 'row-title' }, h('span', { text: S.workoutName(s) }), s.deload ? h('span', { class: 'tag-deload', text: 'Deload' }) : null),
          h('span', { class: 'row-sub', text: `${S.routineName(s)} · ${S.weekName(s)}` })),
        h('span', { class: 'row-side' },
          h('span', { class: 'row-date', text: fmtMinsLong(mins(s)) }),
          h('span', { class: 'row-sub', text: timeOf(s.startedAt) }))));
    }
  }

  const content = h('div', { class: 'page' },
    h('div', { class: 'cal-head' },
      h('button', { class: 'btn btn-sm btn-ghost cal-nav', 'aria-label': 'Previous month', onclick: () => shiftMonth(-1) }, icon('back', 18)),
      h('div', { class: 'cal-title', text: monthLabel }),
      h('button', { class: 'btn btn-sm btn-ghost cal-nav', 'aria-label': 'Next month', disabled: atCurrent, onclick: () => shiftMonth(1) }, icon('right', 18))),
    h('div', { class: 'cal-grid' }, WEEKDAYS.map((w) => h('span', { class: 'cal-wd', text: w })), cells),
    h('div', { class: 'chart-key cal-key' }, h('span', { class: 'key-swatch' }), h('span', { text: 'Workout' }), h('span', { class: 'key-swatch key-deload' }), h('span', { text: 'Deload' }), h('span', { class: 'key-target' }, icon('target', 12)), h('span', { text: 'Target' })),
    h('div', { class: 'tiles tiles-3' }, tile('Workouts', String(workouts), deloads ? `${deloads} deload` : ''), tile('Time', total ? fmtMinsLong(total) : '–'), tile('Avg length', workouts ? fmtMinsLong(Math.round(total / workouts)) : '–')),
    h('div', { class: 'list' }, detail));
  return { title: 'Calendar', subtitle: monthLabel, content };
}
