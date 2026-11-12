// Logging a workout, editing past logs, per-exercise history (locked to one workout), and the history list.
import { h, icon, iconBtn, confirmDialog, choiceSheet, toast, setTick, segmented, card, tile, emptyState, pickerField, sheet, modeBanner } from './ui.js';
import * as S from './store.js';
import * as nav from './nav.js';
import {
  SET_TYPES, typeInfo, parseNum, fmt, fmtW, fmtDate, fmtDateLong, fmtDuration, fmtVol, fmtMonth, setLabel,
  setStats, toLocalInput, FORMULAS, DELOAD_PCT,
} from './calc.js';
import { pickMovement } from './picker.js';
import { exerciseArt } from './art.js';
import { notesList, addNote, canAddNote, editFreeNote } from './notes.js';
import { workoutView } from './views-workouts.js';

// ---- Rest timer (kept across re-renders) --------------------------------------
import { startRest, adjustRest, clearRest, getRest } from './live.js';

// ---- Starting / resuming -------------------------------------------------------
export async function startWorkout(workoutId) {
  const act = S.activeSession();
  if (act && act.workoutId === workoutId) { nav.push(sessionView, { sessionId: act.id }); return; }
  if (act) {
    const choice = await choiceSheet({
      title: 'A workout is already in progress',
      message: `“${S.workoutName(act)}” hasn’t been finished.`,
      options: [
        { label: `Resume “${S.workoutName(act)}”`, value: 'resume' },
        { label: 'Discard it and start this one', value: 'discard', danger: true },
      ],
    });
    if (!choice) return;
    if (choice === 'resume') { nav.push(sessionView, { sessionId: act.id }); return; }
    S.deleteSession(act);
    clearRest();
  }
  const s = S.startSession(workoutId);
  if (s) nav.push(sessionView, { sessionId: s.id });
}

// ---- The workout log screen ------------------------------------------------------
export function sessionView({ sessionId }) {
  const s = S.sessionById(sessionId);
  if (!s) return { title: 'Workout', content: emptyState('This log no longer exists', 'It may have been deleted.') };
  const active = !s.finishedAt;
  const prevMap = S.previousFor(s);

  const dl = s.deload ? 'Deload · ' : '';
  const subtitle = () => (active
    ? `${dl}${fmtDuration(Date.now() - new Date(s.startedAt))} · ${S.routineName(s)} · ${S.weekName(s)}`
    : `${dl}${fmtDateLong(s.startedAt)} · ${S.routineName(s)} · ${S.weekName(s)}`);

  if (active) {
    setTick(() => {
      const sub = document.getElementById('hdr-sub');
      if (sub) sub.textContent = subtitle();
    });
  }
  const rest = active ? getRest() : null;

  const content = h('div', { class: 'page' });
  content.append(active
    ? modeBanner('log', 'Logging', 'Tick each set as you do it')
    : modeBanner('review', 'Logged workout', 'Changes here update your history'));
  if (s.deload) content.append(h('div', { class: 'deload-banner' },
    h('span', { class: 'tag-deload', text: 'Deload' }),
    h('span', { text: `Weights are suggested at ${Math.round(DELOAD_PCT * 100)}% of your best 1RM. This session does not count towards 1RM, records or exercise charts.` })));
  if (!active) content.append(summaryCard(s));

  if (!s.entries.length) content.append(emptyState('No exercises yet', 'Add the first exercise to start logging sets.'));
  s.entries.forEach((entry, i) => content.append(entryCard(s, entry, i, prevMap.get(entry.id), active)));

  content.append(h('button', { class: 'btn btn-block btn-ghost', onclick: async () => {
    const id = await pickMovement();
    if (id) { S.addEntry(s, id); nav.refresh(); }
  } }, icon('plus', 18), h('span', { text: 'Add exercise' })));
  if (active) content.append(h('button', { class: 'btn btn-primary btn-block btn-lg', text: 'Finish workout', onclick: () => finish(s) }));

  const actions = [];
  if (active) actions.push(h('button', { class: 'btn btn-primary btn-sm', text: 'Finish', onclick: () => finish(s) }));
  actions.push(iconBtn('more', 'Workout options', () => sessionMenu(s, active)));

  const footer = active && rest
    ? h('div', { class: 'rest' },
      h('div', { class: 'rest-label', text: 'Rest' }),
      h('div', { class: 'rest-time', 'data-rest-time': '', text: fmtDuration(Math.max(0, rest.end - Date.now())) }),
      h('button', { class: 'btn btn-sm', text: '−15', onclick: () => { adjustRest(-15000); nav.refresh(); } }),
      h('button', { class: 'btn btn-sm', text: '+15', onclick: () => { adjustRest(15000); nav.refresh(); } }),
      h('button', { class: 'btn btn-sm', text: 'Skip', onclick: () => { clearRest(); nav.refresh(); } }))
    : null;

  return { title: S.workoutName(s), subtitle: subtitle(), color: S.sessionColor(s), mode: active ? 'log' : 'review', actions, content, footer, sessionId: s.id };
}

function summaryCard(s) {
  let vol = 0, sets = 0;
  for (const e of s.entries) { const st = setStats(e.sets, S.calcOpts()); vol += st.volume; sets += st.sets; }
  const mins = s.finishedAt ? Math.round((new Date(s.finishedAt) - new Date(s.startedAt)) / 60000) : 0;
  const prs = S.prsForSession(s);
  return card(null,
    h('div', { class: 'tiles tiles-3' }, tile('Exercises', String(s.entries.filter((e) => e.sets.some((x) => x.done)).length)), tile('Sets', String(sets)), tile('Duration', mins > 0 && mins < 600 ? `${mins} min` : '–')),
    prs.length ? h('div', { class: 'prs' }, prs.map((p) => h('div', { class: 'pr' },
      h('span', { class: 'pr-tag', text: 'New best' }),
      h('span', { text: `${S.exerciseName(p.exerciseId)}: est. 1RM ${fmt(p.e1rm)} kg (+${fmt(p.gain)})` })))) : null,
    s.workoutNote ? h('button', { class: 'note note-general', 'aria-label': 'Edit workout note', onclick: async () => { if (await editFreeNote(s, 'workoutNote', 'Workout Note', () => S.touchSession(s))) nav.refresh(); } },
      h('span', { class: 'note-label', text: 'Workout Note' }),
      h('span', { class: 'note-text', text: s.workoutNote })) : null,
    h('label', { class: 'field' },
      h('span', { class: 'field-label', text: 'Date and time' }),
      h('input', { type: 'datetime-local', value: toLocalInput(s.startedAt), onchange: (e) => {
        if (!e.target.value) return;
        S.setSessionDate(s, new Date(e.target.value).toISOString());
        nav.refresh();
      } })));
}

function entryCard(s, entry, index, prev, active) {
  const name = S.exerciseName(entry.exerciseId, entry.exerciseName);
  let n = 0;
  const rows = entry.sets.map((set, i) => {
    const label = set.type === 'normal' ? String(++n) : typeInfo(set.type).short;
    return setRow(s, entry, set, i, prev?.sets, active, label);
  });
  return h('section', { class: `card entry entry-log wk wk-${S.sessionColor(s)}` },
    h('div', { class: 'entry-head' },
      h('span', { class: 'art-tile art-sm', 'aria-hidden': 'true' }, exerciseArt(name, 28)),
      h('button', { class: 'entry-name', onclick: () => entryMenu(s, entry, index), text: name }),
      h('button', { class: 'btn btn-sm btn-ghost', 'aria-label': `History of ${name} in this workout`, onclick: () => nav.push(movementHistoryView, { exerciseId: entry.exerciseId, slotId: s.slotId }) },
        icon('history', 18), h('span', { text: 'History' }))),
    notesList(entry, () => S.touchSession(s), () => nav.refresh()),
    s.deload ? deloadHint(entry.exerciseId) : null,
    prev ? h('div', { class: 'entry-prev', text: `Previous: ${fmtDate(prev.session.startedAt)} · ${S.weekName(prev.session)}` }) : null,
    h('div', { class: 'sets' },
      h('div', { class: 'srow srow-head' }, h('span', { text: 'Set' }), h('span', { text: 'Previous' }), h('span', { text: 'kg' }), h('span', { text: 'Reps' }), h('span', {})),
      rows),
    h('button', { class: 'btn btn-block btn-ghost btn-add', text: '+ Add set', onclick: () => { S.addSessionSet(s, entry); nav.refresh(); } }));
}

function deloadHint(exerciseId) {
  const t = S.deloadTarget(exerciseId);
  return h('div', { class: 'deload-hint', text: t
    ? `Deload: ${Math.round(DELOAD_PCT * 100)}% of your ${fmt(t.best)} kg 1RM = ${fmtW(t.weight)} kg`
    : 'Deload: no 1RM logged for this yet, so pick a light weight' });
}

function numInput({ value, placeholder, mode, label, onValue }) {
  return h('input', {
    class: 'num', type: 'text', inputmode: mode, autocomplete: 'off', placeholder, 'aria-label': label,
    value: value ?? '', onfocus: (e) => e.target.select(),
    oninput: (e) => onValue(e.target.value.trim() === '' ? null : parseNum(e.target.value)),
  });
}

function setRow(s, entry, set, idx, prevSets, active, label) {
  const ps = prevSets?.[idx];
  const phW = set.tw != null ? fmtW(set.tw) : ps ? fmtW(ps.weight) : '';
  const phR = set.tr ? String(set.tr) : ps ? fmt(parseNum(ps.reps), 0) : '';
  const t = typeInfo(set.type);
  return h('div', { class: 'srow' + (set.done ? ' is-done' : '') },
    h('button', { class: 'pill pill-' + set.type, 'aria-label': `Set ${label}, ${t.label}. Change type`, onclick: () => setMenu(s, entry, set), text: label }),
    h('div', { class: 'prev', text: ps ? setLabel(ps) : '–' }),
    numInput({ value: set.weight, placeholder: phW, mode: 'decimal', label: 'Weight in kilograms', onValue: (v) => { set.weight = v; S.touchSession(s); } }),
    numInput({ value: set.reps, placeholder: phR || (set.type === 'hold' ? 'sec' : ''), mode: 'numeric', label: set.type === 'hold' ? 'Seconds held' : 'Reps', onValue: (v) => { set.reps = v; S.touchSession(s); } }),
    h('button', {
      class: 'tick' + (set.done ? ' is-on' : ''), 'aria-label': set.done ? 'Mark set not done' : 'Mark set done', 'aria-pressed': String(!!set.done),
      onclick: () => {
        if (!set.done) {
          if (set.weight == null) { const v = set.tw ?? ps?.weight; if (v != null) set.weight = parseNum(v); }
          if (set.reps == null) { const v = parseNum(set.tr) ?? parseNum(ps?.reps); if (v != null) set.reps = v; }
          if (set.reps == null) { toast('Enter the reps first'); return; }
          if (set.weight == null) set.weight = 0; // bodyweight
          set.done = true;
          if (active) startRest();
        } else set.done = false;
        S.touchSession(s);
        nav.refresh();
      },
    }, icon('check', 20)));
}

async function setMenu(s, entry, set) {
  const v = await choiceSheet({
    title: 'Set type',
    options: [
      ...SET_TYPES.map((t) => ({ label: t.label, sub: t.hint, value: t.id, selected: set.type === t.id })),
      { label: 'Delete this set', value: '__delete', danger: true },
    ],
  });
  if (!v) return;
  if (v === '__delete') entry.sets = entry.sets.filter((x) => x !== set);
  else set.type = v;
  S.touchSession(s);
  nav.refresh();
}

async function entryMenu(s, entry, index) {
  const v = await choiceSheet({
    title: S.exerciseName(entry.exerciseId, entry.exerciseName),
    options: [
      ...(canAddNote(entry) ? [{ label: 'Add note', value: 'note', sub: 'Lifting cues or a general note' }] : []),
      { label: 'History in this workout', value: 'history' },
      { label: 'Replace exercise', value: 'replace' },
      { label: 'Move up', value: 'up', disabled: index === 0 },
      { label: 'Move down', value: 'down', disabled: index === s.entries.length - 1 },
      { label: 'Remove from this workout', value: 'remove', danger: true },
    ],
  });
  if (!v) return;
  if (v === 'note') await addNote(entry, () => S.touchSession(s), () => nav.refresh());
  else if (v === 'history') nav.push(movementHistoryView, { exerciseId: entry.exerciseId, slotId: s.slotId });
  else if (v === 'replace') {
    const id = await pickMovement({ title: 'Replace with' });
    if (!id) return;
    entry.exerciseId = id; entry.exerciseName = S.exerciseName(id);
    S.touchSession(s); nav.refresh();
  } else if (v === 'up' || v === 'down') {
    const i = s.entries.indexOf(entry), j = i + (v === 'up' ? -1 : 1);
    [s.entries[i], s.entries[j]] = [s.entries[j], s.entries[i]];
    S.touchSession(s); nav.refresh();
  } else if (v === 'remove') {
    if (entry.sets.some((x) => x.done) && !(await confirmDialog({ title: 'Remove this exercise?', message: 'Its logged sets in this workout will be deleted.', ok: 'Remove', danger: true }))) return;
    s.entries = s.entries.filter((x) => x !== entry);
    S.touchSession(s); nav.refresh();
  }
}

async function sessionMenu(s, active) {
  const loc = S.locateWorkout(s.workoutId);
  const v = await choiceSheet({
    title: 'Workout options',
    options: [
      { label: s.workoutNote ? 'Edit workout note' : 'Add workout note', value: 'wnote' },
      s.deload
        ? { label: 'Switch back to a normal workout', value: 'deload', sub: 'Counts towards 1RM and charts again' }
        : { label: 'Make this a deload workout', value: 'deload', sub: `Suggests ${Math.round(DELOAD_PCT * 100)}% of your 1RM; left out of 1RM and charts` },
      ...(loc ? [{ label: 'Open workout plan', value: 'plan' }] : []),
      active ? { label: 'Discard this workout', value: 'delete', danger: true } : { label: 'Delete this log', value: 'delete', danger: true },
    ],
  });
  if (v === 'wnote') { if (await editFreeNote(s, 'workoutNote', 'Workout Note', () => S.touchSession(s))) nav.refresh(); }
  if (v === 'deload') { S.setSessionDeload(s, !s.deload); toast(s.deload ? 'Deload workout' : 'Normal workout'); nav.refresh(); }
  if (v === 'plan') nav.push(workoutView, { routineId: loc.routine.id, weekId: loc.week.id, workoutId: loc.workout.id });
  if (v === 'delete') {
    const ok = await confirmDialog({
      title: active ? 'Discard this workout?' : 'Delete this log?',
      message: active ? 'Nothing you entered so far will be kept.' : 'It will be removed from your history and charts. This can’t be undone.',
      ok: active ? 'Discard' : 'Delete', danger: true,
    });
    if (!ok) return;
    S.deleteSession(s);
    clearRest();
    nav.pop();
  }
}

async function finish(s) {
  const loose = S.filledButUndone(s);
  let mode = 'drop';
  if (loose.length) {
    const c = await choiceSheet({
      title: `${loose.length} ${loose.length === 1 ? 'set has' : 'sets have'} numbers but no tick`,
      options: [
        { label: 'Count them as done', value: 'count' },
        { label: 'Leave them out', value: 'drop' },
      ],
    });
    if (!c) return;
    mode = c;
  }
  const wouldBeDone = S.doneSetCount(s) + (mode === 'count' ? loose.filter((x) => x.reps != null).length : 0);
  if (!wouldBeDone) {
    const ok = await confirmDialog({ title: 'No sets logged', message: 'Nothing has been ticked off. Discard this workout instead?', ok: 'Discard', cancel: 'Keep logging', danger: true });
    if (ok) { S.deleteSession(s); clearRest(); nav.pop(); }
    return;
  }
  S.finishSession(s, mode);
  clearRest();
  await loggedSheet(s);
}

/** "Workout logged" popup: optional note, then back to the start of Workouts or the summary. */
async function loggedSheet(s) {
  let vol = 0, sets = 0;
  for (const e of s.entries) { const st = setStats(e.sets, S.calcOpts()); vol += st.volume; sets += st.sets; }
  const note = h('textarea', { class: 'notes', rows: 3, id: 'logged-note', placeholder: 'How did it go? Anything to remember? (optional)', value: s.workoutNote || '' });
  const keep = () => { const v = note.value.trim(); if (v) s.workoutNote = v; else delete s.workoutNote; S.touchSession(s); };
  let go = 'summary';
  await new Promise((resolve) => {
    const leave = (to) => { go = to; close(); };
    const { close } = sheet(h('div', { class: 'form' },
      h('p', { class: 'sheet-msg', text: `${S.workoutName(s)} · ${sets} ${sets === 1 ? 'set' : 'sets'} · ${fmtVol(vol)}` }),
      h('label', { class: 'field' }, h('span', { class: 'field-label', text: 'Add a note' }), note),
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn', text: 'View summary', onclick: () => leave('summary') }),
        h('button', { class: 'btn btn-primary', id: 'logged-home', text: 'Back to Workouts', onclick: () => leave('home') }))),
    { title: 'Workout logged', onClose: () => { keep(); resolve(); } });
  });
  if (go === 'home') nav.goHome('workouts'); else nav.refresh();
}

// ---- Per-exercise history, locked to one workout -----------------------------------
export function movementHistoryView(params) {
  const { exerciseId, slotId } = params;
  const all = !!params.all;
  const name = S.exerciseName(exerciseId);
  const wName = S.slotName(slotId);
  const hist = S.historyFor(exerciseId, all ? null : slotId, null, true);
  const counted = hist.filter((r) => !r.session.deload);
  const best = counted.reduce((b, r) => (r.stats.e1rm != null && (b == null || r.stats.e1rm > b.stats.e1rm) ? r : b), null);
  const heaviest = counted.reduce((b, r) => (r.stats.top && (b == null || r.stats.top.weight > b.stats.top.weight) ? r : b), null);

  const content = h('div', { class: 'page' },
    segmented([['slot', `${wName} only`], ['all', 'All workouts']], all ? 'all' : 'slot', (v) => { params.all = v === 'all'; nav.refresh(); }),
    h('p', { class: 'hint', text: all
      ? 'Every logged session of this exercise, whichever workout it was in.'
      : `Only sessions of “${wName}”, so history from your other workouts never gets mixed in.` }));

  if (!hist.length) {
    content.append(emptyState('Nothing logged yet', all ? 'Finish a workout with this exercise to see its history.' : `You haven’t finished “${wName}” with this exercise yet.`));
  } else {
    content.append(
      h('div', { class: 'tiles tiles-3' },
        tile('Best 1RM', best ? `${fmt(best.stats.e1rm)} kg` : '–', best ? `${fmtW(best.stats.bestSet.weight)}×${fmt(best.stats.bestSet.reps, 0)} · ${fmtDate(best.date)}` : ''),
        tile('Heaviest set', heaviest ? `${fmtW(heaviest.stats.top.weight)} kg` : '–', heaviest ? `× ${fmt(heaviest.stats.top.reps, 0)}` : ''),
        tile('Sessions', String(counted.length), counted.length < hist.length ? `+${hist.length - counted.length} deload` : '')));
    content.append(h('div', { class: 'list' }, hist.map((r) => h('button', { class: `hist-row wk wk-${S.sessionColor(r.session)}`, onclick: () => nav.push(sessionView, { sessionId: r.session.id }) },
      h('div', { class: 'hist-top' },
        h('span', { class: 'hist-date', text: fmtDate(r.date) }),
        h('span', { class: 'hist-where', text: all ? `${S.workoutName(r.session)} · ${S.weekName(r.session)}` : S.weekName(r.session) }),
        r.session.deload ? h('span', { class: 'tag-deload', text: 'Deload' }) : null,
        h('span', { class: 'hist-e1', text: r.stats.e1rm != null && !r.session.deload ? `${fmt(r.stats.e1rm)} kg` : '' })),
      h('div', { class: 'chips' }, r.sets.map((x) => h('span', { class: 'chip chip-' + x.type, text: (x.type !== 'normal' ? typeInfo(x.type).short + ' ' : '') + setLabel(x) }))),
      icon('right', 18)))));
  }
  return { title: name, subtitle: all ? 'All workouts' : wName, color: all ? undefined : S.sessionColor(hist[0]?.session || { slotId }), content };
}

// ---- History list (Workouts tab) --------------------------------------------------------
const hf = { routineId: 'all' };
export function historyContent() {
  const all = S.sessionsDesc();
  if (!all.length) return emptyState('No workouts logged yet', 'Start a workout from a routine and finish it. It will show up here, and you can amend it any time.');
  const routines = new Map();
  for (const s of all) routines.set(s.routineId, S.routineName(s));
  if (hf.routineId !== 'all' && !routines.has(hf.routineId)) hf.routineId = 'all';
  const list = all.filter((s) => hf.routineId === 'all' || s.routineId === hf.routineId);

  const out = [];
  if (routines.size > 1) {
    out.push(pickerField('Filter by routine', [['all', 'All routines'], ...routines], hf.routineId, (v) => { hf.routineId = v; nav.refresh(); }));
  }
  let month = '';
  for (const s of list) {
    const m = fmtMonth(s.startedAt);
    if (m !== month) { month = m; out.push(h('h3', { class: 'month', text: m })); }
    let vol = 0, sets = 0;
    for (const e of s.entries) { const st = setStats(e.sets, S.calcOpts()); vol += st.volume; sets += st.sets; }
    out.push(h('button', { class: `row-card row-btn wk wk-${S.sessionColor(s)}`, onclick: () => nav.push(sessionView, { sessionId: s.id }) },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, h('span', { text: S.workoutName(s) }), s.deload ? h('span', { class: 'tag-deload', text: 'Deload' }) : null),
        h('span', { class: 'row-sub', text: `${S.routineName(s)} · ${S.weekName(s)}` })),
      h('span', { class: 'row-side' },
        h('span', { class: 'row-date', text: s.finishedAt ? fmtDate(s.startedAt) : 'In progress' }),
        h('span', { class: 'row-sub', text: s.finishedAt ? `${sets} sets · ${fmtVol(vol)}` : '' }))));
  }
  return h('div', { class: 'list' }, out);
}
