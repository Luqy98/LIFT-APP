// Dashboard: overview + per-exercise analysis (estimated 1RM, heaviest set, rep records).
import { h, card, tile, emptyState, pickerField, icon } from './ui.js';
import { exerciseArt, mascotArt } from './art.js';
import * as S from './store.js';
import * as nav from './nav.js';
import { FORMULAS, repRecords, fmt, fmtW, fmtSign, fmtVol, fmtDate, setLabel, typeInfo } from './calc.js';
import { lineChart, barChart, dataTable } from './charts.js';
import { activeBanner, sessionView } from './views-session.js';
import { runBackup } from './backup.js';

const dash = { exerciseId: null, slotId: 'all', range: '12w' };
const RANGES = [['4w', 28, '4 wks'], ['12w', 84, '12 wks'], ['6m', 182, '6 mo'], ['1y', 365, '1 yr'], ['all', 0, 'All']];

export function selectMovement(id) { dash.exerciseId = id; dash.slotId = 'all'; }

export function dashboardView() {
  const have = S.exercisesWithData();
  const ov = S.overview();
  const content = h('div', { class: 'page' }, activeBanner());

  const unbacked = S.unbackedCount();
  const age = S.backupAgeDays();
  if (unbacked > 0 && (age == null || age >= 7)) {
    content.append(h('div', { class: 'backup-banner' },
      h('p', { text: age == null ? `You haven’t backed up yet. ${unbacked} ${unbacked === 1 ? 'workout is' : 'workouts are'} only on this phone.` : `${unbacked} ${unbacked === 1 ? 'workout' : 'workouts'} since your last backup (${age} days ago).` }),
      h('button', { class: 'btn btn-sm btn-primary', text: 'Back up', onclick: async () => { await runBackup(); nav.refresh(); } })));
  }

  content.append(greetingCard(), weekCard());
  const wp = S.weekProgress();
  const lifts = S.liftProgress(6);
  const top = lifts.slice().sort((a, b) => b.best - a.best)[0];
  const pct = (n) => (n == null ? null : `${n > 0 ? '▲ +' : n < 0 ? '▼ −' : ''}${Math.abs(n)}%`);
  content.append(h('div', { class: 'tiles tiles-3' },
    tile('Sets', String(wp.sets), pct(wp.setsPct) || 'this week', wp.setsPct == null ? '' : wp.setsPct >= 0 ? 'up' : 'down'),
    tile('Top 1RM', top ? `${fmt(top.best)} kg` : '–', top ? (top.delta != null ? `▲ +${fmt(top.delta)} kg` : S.exerciseName(top.exerciseId)) : 'no lifts yet', top && top.delta != null ? 'up' : ''),
    tile('Sessions', String(ov.month), 'last 30 days')));
  if (lifts.length) content.append(liftsCard(lifts));

  if (!have.size) {
    content.append(emptyState('Your charts will appear here', 'Finish a workout and each exercise you trained gets an estimated 1RM trend, heaviest set and rep records.',
      h('button', { class: 'btn btn-primary', text: 'Go to workouts', onclick: () => nav.switchTab('workouts') })));
    return { title: 'LIFT', brand: true, content };
  }

  const weeks = S.weeklyCounts(12);
  const unit = (n) => `${n} ${n === 1 ? 'workout' : 'workouts'}`;
  content.append(card('Workouts per week',
    h('p', { class: 'card-note', text: 'Weeks start on Monday · last 12 weeks' }),
    barChart({
      label: 'Workouts per week', integer: true,
      points: weeks.map((w) => ({ label: fmtDate(w.start.toISOString()), y: w.count, title: unit(w.count), detail: `Week of ${fmtDate(w.start.toISOString())}` })),
    }),
    dataTable(['Week starting (Mon)', 'Workouts'], weeks.map((w) => [fmtDate(w.start.toISOString()), String(w.count)]))));

  if (!dash.exerciseId || !have.has(dash.exerciseId)) { dash.exerciseId = [...have.keys()][0]; dash.slotId = 'all'; }
  const slots = S.slotsForExercise(dash.exerciseId);
  if (dash.slotId !== 'all' && !slots.some((x) => x.slotId === dash.slotId)) dash.slotId = 'all';

  const movementSelect = pickerField('Exercise', [...have.keys()].map((id) => [id, S.exerciseName(id)]), dash.exerciseId,
    (v) => { dash.exerciseId = v; dash.slotId = 'all'; nav.refresh(); });
  const scopeSelect = pickerField('Workout', [['all', 'All workouts'], ...slots.map((x) => [x.slotId, x.name])], dash.slotId,
    (v) => { dash.slotId = v; nav.refresh(); });
  const ranges = h('div', { class: 'seg seg-scroll', role: 'group', 'aria-label': 'Time range' }, RANGES.map(([id, , label]) =>
    h('button', { type: 'button', class: 'seg-btn' + (dash.range === id ? ' is-on' : ''), 'aria-pressed': String(dash.range === id), text: label, onclick: () => { dash.range = id; nav.refresh(); } })));

  content.append(h('div', { class: 'controls' }, movementSelect, slots.length > 1 ? scopeSelect : null, ranges));

  // ---- data
  const hist = S.historyFor(dash.exerciseId, dash.slotId === 'all' ? null : dash.slotId); // newest first
  const days = RANGES.find((r) => r[0] === dash.range)[1];
  const since = days ? Date.now() - days * 864e5 : 0;
  const rows = hist.filter((r) => +new Date(r.date) >= since).reverse(); // oldest first
  const withE = rows.filter((r) => r.stats.e1rm != null);
  const latestE = hist.find((r) => r.stats.e1rm != null);
  const bestE = hist.reduce((b, r) => (r.stats.e1rm != null && (!b || r.stats.e1rm > b.stats.e1rm) ? r : b), null);
  const heavy = hist.reduce((b, r) => (r.stats.top && (!b || r.stats.top.weight > b.stats.top.weight) ? r : b), null);
  const delta = withE.length > 1 ? withE[withE.length - 1].stats.e1rm - withE[0].stats.e1rm : null;

  content.append(h('div', { class: 'tiles tiles-2' },
    tile('Estimated 1RM', latestE ? `${fmt(latestE.stats.e1rm)} kg` : '–', delta != null ? `${fmtSign(delta)} kg over this range` : latestE ? fmtDate(latestE.date) : 'Needs a set of up to ' + S.data.settings.maxReps + ' reps'),
    tile('Best ever', bestE ? `${fmt(bestE.stats.e1rm)} kg` : '–', bestE ? fmtDate(bestE.date) : ''),
    tile('Heaviest set', heavy ? `${fmtW(heavy.stats.top.weight)} kg` : '–', heavy ? `× ${fmt(heavy.stats.top.reps, 0)} · ${fmtDate(heavy.date)}` : ''),
    tile('Sessions', String(rows.length), days ? 'in this range' : 'all time')));

  const name = S.exerciseName(dash.exerciseId);
  const formula = FORMULAS[S.data.settings.formula]?.label || 'Blend';

  content.append(card('Estimated 1RM',
    h('p', { class: 'card-note', text: `Best set each session · ${formula} · sets up to ${S.data.settings.maxReps} reps` }),
    lineChart({
      label: `Estimated 1RM for ${name}`, unit: ' kg',
      points: withE.map((r) => ({ t: +new Date(r.date), y: r.stats.e1rm, title: `${fmt(r.stats.e1rm)} kg`, detail: `${fmtDate(r.date)} · from ${fmtW(r.stats.bestSet.weight)}×${fmt(r.stats.bestSet.reps, 0)}${dash.slotId === 'all' ? ' · ' + S.workoutName(r.session) : ''}` })),
    }),
    dataTable(['Date', 'Est. 1RM (kg)', 'From'], withE.map((r) => [fmtDate(r.date), fmt(r.stats.e1rm), `${fmtW(r.stats.bestSet.weight)}×${fmt(r.stats.bestSet.reps, 0)}`]))));

  const topRows = rows.filter((r) => r.stats.top && r.stats.top.weight > 0);
  content.append(card('Heaviest set',
    h('p', { class: 'card-note', text: 'Top weight lifted each session (warm-ups excluded)' }),
    lineChart({
      label: `Heaviest set for ${name}`, unit: ' kg',
      points: topRows.map((r) => ({ t: +new Date(r.date), y: r.stats.top.weight, title: `${fmtW(r.stats.top.weight)} kg × ${fmt(r.stats.top.reps, 0)}`, detail: fmtDate(r.date) })),
    }),
    dataTable(['Date', 'Weight (kg)', 'Reps'], topRows.map((r) => [fmtDate(r.date), fmtW(r.stats.top.weight), fmt(r.stats.top.reps, 0)]))));

  const recs = repRecords(hist.map((r) => ({ date: r.date, sets: r.sets }))).slice(0, 12);
  if (recs.length) {
    content.append(card('Rep records',
      h('p', { class: 'card-note', text: 'Heaviest weight for each rep count' }),
      h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, h('th', { text: 'Reps' }), h('th', { text: 'Best' }), h('th', { text: 'When' }))),
        h('tbody', {}, recs.map((r) => h('tr', {}, h('td', { text: String(r.reps) }), h('td', { text: `${fmtW(r.weight)} kg` }), h('td', { text: fmtDate(r.date) })))))));
  }

  content.append(card('Recent sessions',
    h('div', { class: 'list' }, hist.slice(0, 6).map((r) => h('button', { class: `hist-row wk wk-${S.sessionColor(r.session)}`, onclick: () => nav.push(sessionView, { sessionId: r.session.id }) },
      h('div', { class: 'hist-top' },
        h('span', { class: 'hist-date', text: fmtDate(r.date) }),
        h('span', { class: 'hist-where', text: `${S.workoutName(r.session)} · ${S.weekName(r.session)}` }),
        h('span', { class: 'hist-e1', text: r.stats.e1rm != null ? `${fmt(r.stats.e1rm)} kg` : '' })),
      h('div', { class: 'chips' }, r.sets.map((x) => h('span', { class: 'chip chip-' + x.type, text: (x.type !== 'normal' ? typeInfo(x.type).short + ' ' : '') + setLabel(x) }))))))));

  return { title: 'LIFT', brand: true, content };
}

function greeting() {
  const hr = new Date().getHours();
  const part = hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening';
  const name = (S.data.settings.name || '').trim();
  return { part: `Good ${part},`, name };
}

function greetingCard() {
  const g = greeting();
  const streak = S.weekStreak();
  return h('section', { class: 'hero' },
    h('div', { class: 'hero-text' },
      h('p', { class: 'hero-hi', text: g.part }),
      h('h2', { class: 'hero-name', text: g.name || 'Lifter' }),
      h('span', { class: 'streak', title: 'Weeks in a row with at least one workout' }, h('span', { class: 'streak-flame', 'aria-hidden': 'true' }, icon('flame', 16)),
        h('span', { text: streak > 0 ? `${streak} week streak` : 'Start your streak' }))),
    h('div', { class: 'hero-art' }, mascotArt()));
}

function weekCard() {
  const w = S.weekProgress();
  const pct = Math.min(100, Math.round((w.done / w.goal) * 100));
  const bar = h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': w.goal, 'aria-valuenow': w.done, 'aria-label': 'Workouts this week' },
    h('div', { class: 'meter-fill w-' + (Math.round(pct / 5) * 5) }));
  return card('This week',
    h('div', { class: 'week-row' },
      h('span', { class: 'week-count', text: `${w.done} / ${w.goal} workouts` }),
      h('span', { class: 'week-pct', text: `${pct}%` })),
    bar);
}

function liftsCard(lifts) {
  return card('Lift progress',
    h('p', { class: 'card-note', text: 'Estimated 1RM, and how much it rose when you last set a new best' }),
    h('div', { class: 'lifts' }, lifts.map((l) => {
      const name = S.exerciseName(l.exerciseId);
      return h('button', { class: 'lift-row', onclick: () => { selectMovement(l.exerciseId); nav.refresh(); } },
        h('span', { class: 'art-tile art-sm', 'aria-hidden': 'true' }, exerciseArt(name, 28)),
        h('span', { class: 'lift-main' }, h('span', { class: 'lift-name', text: name }), h('span', { class: 'lift-sub', text: l.prDate ? `Best set ${fmtDate(l.prDate)}` : '' })),
        h('span', { class: 'lift-val' }, h('b', { text: `${fmt(l.best)} kg` }),
          l.delta != null ? h('span', { class: 'delta up', text: `▲ +${fmt(l.delta)} kg` }) : h('span', { class: 'delta', text: 'first max' })));
    })));
}
