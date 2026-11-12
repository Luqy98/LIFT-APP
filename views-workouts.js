// Workouts tab: routines -> weeks -> workouts -> exercises -> sets (the plan), plus the History segment.
import { h, icon, iconBtn, confirmDialog, formDialog, choiceSheet, toast, segmented, emptyState, colorSheet, modeBanner } from './ui.js';
import { notesList, addNote, canAddNote } from './notes.js';
import * as S from './store.js';
import * as nav from './nav.js';
import { exerciseArt } from './art.js';
import { SET_TYPES, typeInfo, parseNum, fmtW, fmtDate, WORKOUT_COLORS } from './calc.js';
import { pickMovement } from './picker.js';
import { startWorkout, historyContent, sessionView, movementHistoryView } from './views-session.js';

const ui = { seg: 'routines' };

const notFound = (what) => ({ title: what, content: emptyState('Not found', 'This item no longer exists. Go back and pick another.') });
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

function routineProgress(r) {
  let total = 0, done = 0;
  for (const wk of r.weeks) for (const w of wk.workouts) { total++; if (S.statusOfWorkout(w.id).done) done++; }
  return { total, done };
}
function weekProgress(wk) {
  let done = 0;
  for (const w of wk.workouts) if (S.statusOfWorkout(w.id).done) done++;
  return { total: wk.workouts.length, done };
}

// ---- Root: routines | history ----------------------------------------------------------
export function workoutsRoot() {
  const body = ui.seg === 'routines' ? routinesContent() : historyContent();
  return {
    title: 'Workouts',
    actions: ui.seg === 'routines' ? [iconBtn('plus', 'New routine', newRoutine)] : [],
    content: h('div', { class: 'page' }, segmented([['routines', 'Routines'], ['history', 'History']], ui.seg, (v) => { ui.seg = v; nav.refresh(); }), body),
  };
}

function routinesContent() {
  if (!S.data.routines.length) {
    return emptyState('Plan your first routine', 'A routine is made of weeks, each week of workouts, each workout of exercises and sets. You control every level.',
      h('button', { class: 'btn btn-primary', text: 'Create a routine', onclick: newRoutine }));
  }
  return h('div', { class: 'list' }, S.data.routines.map((r) => {
    const p = routineProgress(r);
    return h('div', { class: 'row-card' },
      h('button', { class: 'row-main row-btn', onclick: () => nav.push(routineView, { routineId: r.id }) },
        h('span', { class: 'row-title', text: r.name }),
        h('span', { class: 'row-sub', text: `${plural(r.weeks.length, 'week')} · ${plural(p.total, 'workout')}${p.total ? ` · ${p.done} done` : ''}` })),
      iconBtn('more', `Options for ${r.name}`, () => routineMenu(r)));
  }));
}

async function newRoutine() {
  const v = await formDialog({
    title: 'New routine',
    message: 'Weeks and workouts are created blank so you can rename and fill them in. Use 0 to start empty.',
    fields: [
      { key: 'name', label: 'Routine name', placeholder: 'e.g. Strength block', capitalize: 'words' },
      { key: 'weeks', label: 'Weeks', type: 'number', value: '4', inputmode: 'numeric', min: 0, max: 52 },
      { key: 'per', label: 'Workouts per week', type: 'number', value: '5', inputmode: 'numeric', min: 0, max: 14 },
    ],
    ok: 'Create',
    validate: (x) => (!x.name.trim() ? 'Give the routine a name.' : null),
  });
  if (!v) return;
  const weeks = Math.max(0, Math.min(52, parseInt(v.weeks, 10) || 0));
  const per = Math.max(0, Math.min(14, parseInt(v.per, 10) || 0));
  const r = S.addRoutine(v.name, { weeks, perWeek: per });
  nav.refresh();
  nav.push(routineView, { routineId: r.id });
}

async function routineMenu(r, thenPop = false) {
  const v = await choiceSheet({
    title: r.name,
    options: [
      { label: 'Rename', value: 'rename' },
      { label: 'Duplicate routine', value: 'dup', sub: 'Copies every week and workout. History starts fresh.' },
      { label: 'Delete routine', value: 'del', danger: true },
    ],
  });
  if (v === 'rename') {
    const x = await formDialog({ title: 'Rename routine', fields: [{ key: 'name', label: 'Routine name', value: r.name, capitalize: 'words' }], validate: (f) => (!f.name.trim() ? 'Name can’t be empty.' : null) });
    if (x) { S.renameRoutine(r.id, x.name); nav.refresh(); }
  } else if (v === 'dup') {
    S.duplicateRoutine(r.id);
    toast('Routine duplicated');
    nav.refresh();
  } else if (v === 'del') {
    const ok = await confirmDialog({ title: `Delete “${r.name}”?`, message: 'The plan is removed. Workouts you have already logged stay in your history and charts.', ok: 'Delete routine', danger: true });
    if (!ok) return;
    S.deleteRoutine(r.id);
    if (thenPop) nav.pop(); else nav.refresh();
  }
}

// ---- Routine: weeks ------------------------------------------------------------------------
export function routineView({ routineId }) {
  const r = S.routineById(routineId);
  if (!r) return notFound('Routine');
  const content = h('div', { class: 'page' });
  if (!r.weeks.length) content.append(emptyState('No weeks yet', 'Add a week, then add workouts to it.'));
  else {
    content.append(h('div', { class: 'list' }, r.weeks.map((wk) => {
      const p = weekProgress(wk);
      return h('div', { class: 'row-card' },
        h('button', { class: 'row-main row-btn', onclick: () => nav.push(weekView, { routineId, weekId: wk.id }) },
          h('span', { class: 'row-title', text: wk.name }),
          h('span', { class: 'row-sub', text: `${plural(p.total, 'workout')}${p.total ? ` · ${p.done} done` : ''}` })),
        iconBtn('more', `Options for ${wk.name}`, () => weekMenu(r, wk)));
    })));
  }
  content.append(h('button', { class: 'btn btn-block btn-ghost', onclick: () => addWeek(r) }, icon('plus', 18), h('span', { text: 'Add week' })));
  return { title: r.name, subtitle: plural(r.weeks.length, 'week'), actions: [iconBtn('more', 'Routine options', () => routineMenu(r, true))], content };
}

async function addWeek(r) {
  let copyFrom = null;
  if (r.weeks.length) {
    const last = r.weeks[r.weeks.length - 1];
    const v = await choiceSheet({
      title: 'Add week',
      options: [
        { label: `Copy ${last.name}`, sub: 'Same workouts, exercises and planned sets. Workout history stays linked.', value: 'copy' },
        { label: 'Blank week', value: 'blank' },
      ],
    });
    if (!v) return;
    if (v === 'copy') copyFrom = last.id;
  }
  const wk = S.addWeek(r.id, { copyFromWeekId: copyFrom });
  nav.refresh();
  nav.push(weekView, { routineId: r.id, weekId: wk.id });
}

async function weekMenu(r, wk) {
  const i = r.weeks.indexOf(wk);
  const v = await choiceSheet({
    title: wk.name,
    options: [
      { label: 'Rename', value: 'rename' },
      { label: 'Duplicate week', value: 'dup' },
      { label: 'Move up', value: 'up', disabled: i === 0 },
      { label: 'Move down', value: 'down', disabled: i === r.weeks.length - 1 },
      { label: 'Delete week', value: 'del', danger: true },
    ],
  });
  if (v === 'rename') {
    const x = await formDialog({ title: 'Rename week', fields: [{ key: 'name', label: 'Week name', value: wk.name, capitalize: 'words' }], validate: (f) => (!f.name.trim() ? 'Name can’t be empty.' : null) });
    if (x) { S.renameWeek(r.id, wk.id, x.name); nav.refresh(); }
  } else if (v === 'dup') { S.duplicateWeek(r.id, wk.id); nav.refresh(); }
  else if (v === 'up' || v === 'down') { S.moveInArray(r.weeks, wk, v === 'up' ? -1 : 1); nav.refresh(); }
  else if (v === 'del') {
    if (await confirmDialog({ title: `Delete ${wk.name}?`, message: 'Its workouts and planned sets are removed. Anything you logged stays in your history.', ok: 'Delete week', danger: true })) {
      S.deleteWeek(r.id, wk.id);
      nav.refresh();
    }
  }
}

// ---- Week: workouts -----------------------------------------------------------------------
export function weekView({ routineId, weekId }) {
  const r = S.routineById(routineId);
  const wk = S.weekById(routineId, weekId);
  if (!r || !wk) return notFound('Week');
  const content = h('div', { class: 'page' });
  if (!wk.workouts.length) content.append(emptyState('No workouts in this week', 'Add the workouts you’ll do, then fill each with exercises.'));
  else {
    content.append(h('div', { class: 'list' }, wk.workouts.map((w) => {
      const st = S.statusOfWorkout(w.id);
      const sets = w.items.reduce((n, it) => n + it.sets.length, 0);
      return h('div', { class: `row-card wk wk-${w.color ?? 0}` },
        h('button', { class: 'row-main row-btn', onclick: () => nav.push(workoutView, { routineId, weekId, workoutId: w.id }) },
          h('span', { class: 'row-title' }, h('span', { class: 'wk-dot' }), h('span', { text: w.name }), w.deload ? h('span', { class: 'tag-deload', text: 'Deload' }) : null),
          h('span', { class: 'row-sub', text: w.items.length ? `${plural(w.items.length, 'exercise')} · ${plural(sets, 'set')}` : 'No exercises yet' })),
        st.active ? h('span', { class: 'status status-live', text: 'In progress' })
          : st.done ? h('span', { class: 'status status-done' }, icon('check', 14), h('span', { text: fmtDate(st.done.startedAt) })) : null,
        iconBtn('more', `Options for ${w.name}`, () => workoutMenu(r, wk, w)));
    })));
  }
  content.append(h('button', { class: 'btn btn-block btn-ghost', onclick: () => addWorkout(r, wk) }, icon('plus', 18), h('span', { text: 'Add workout' })));
  return {
    title: wk.name, subtitle: r.name,
    actions: [iconBtn('more', 'Week options', () => weekMenu(r, wk).then(() => { if (!S.weekById(routineId, weekId)) nav.pop(); }))],
    content,
  };
}

async function addWorkout(r, wk) {
  const v = await formDialog({
    title: 'Add workout',
    fields: [{ key: 'name', label: 'Workout name', value: 'Workout ' + (wk.workouts.length + 1), capitalize: 'words' }],
    checks: [],
    validate: (f) => (!f.name.trim() ? 'Give the workout a name.' : null),
  });
  if (!v) return;
  const w = S.addWorkout(r.id, wk.id, v.name);
  nav.refresh();
  nav.push(workoutView, { routineId: r.id, weekId: wk.id, workoutId: w.id });
}

async function workoutMenu(r, wk, w) {
  const i = wk.workouts.indexOf(w);
  const links = S.linkCandidates(w.id);
  const v = await choiceSheet({
    title: w.name,
    options: [
      { label: 'Rename', value: 'rename' },
      { label: 'Colour', value: 'color', sub: WORKOUT_COLORS[w.color ?? 0] },
      w.deload
        ? { label: 'Remove deload', value: 'deload', sub: 'Make this a normal workout again' }
        : { label: 'Mark as deload workout', value: 'deload', sub: 'Suggests 60% of your 1RM. Left out of 1RM and charts' },
      { label: 'Duplicate', value: 'dup', sub: 'A separate workout with its own history' },
      ...(links.length ? [{ label: 'Share history with another workout…', value: 'link', sub: 'Previous values and history carry over between them' }] : []),
      { label: 'Move up', value: 'up', disabled: i === 0 },
      { label: 'Move down', value: 'down', disabled: i === wk.workouts.length - 1 },
      { label: 'Delete workout', value: 'del', danger: true },
    ],
  });
  if (v === 'rename') {
    const multi = r.weeks.some((x) => x !== wk && x.workouts.some((o) => o.slotId === w.slotId));
    const x = await formDialog({
      title: 'Rename workout',
      fields: [{ key: 'name', label: 'Workout name', value: w.name, capitalize: 'words' }],
      checks: multi ? [{ key: 'all', label: 'Rename it in every week too', checked: true }] : [],
      validate: (f) => (!f.name.trim() ? 'Name can’t be empty.' : null),
    });
    if (x) { S.renameWorkout(r.id, w.id, x.name, !!x.all); nav.refresh(); }
  } else if (v === 'deload') { S.setWorkoutDeload(w.id, !w.deload); toast(w.deload ? 'Marked as deload' : 'Deload removed'); nav.refresh();
  } else if (v === 'color') {
    const c = await colorSheet(w.color ?? 0, WORKOUT_COLORS);
    if (c != null) { S.setWorkoutColor(r.id, w.id, c); nav.refresh(); }
  } else if (v === 'dup') { S.duplicateWorkout(r.id, wk.id, w.id); nav.refresh(); }
  else if (v === 'link') {
    const pick = await choiceSheet({
      title: 'Share history with…',
      message: `“${w.name}” will use the same history and previous values as the one you pick.`,
      options: links.map((l) => ({ label: l.name, sub: l.week, value: l.slotId })),
    });
    if (pick) { S.linkWorkoutSlot(w.id, pick); toast('History linked'); nav.refresh(); }
  } else if (v === 'up' || v === 'down') { S.moveInArray(wk.workouts, w, v === 'up' ? -1 : 1); nav.refresh(); }
  else if (v === 'del') {
    if (await confirmDialog({ title: `Delete ${w.name}?`, message: 'The plan is removed. Logs you already saved stay in your history.', ok: 'Delete workout', danger: true })) {
      S.deleteWorkout(r.id, wk.id, w.id);
      nav.refresh();
    }
  }
}

// ---- Workout: exercises and planned sets -------------------------------------------------------
export function workoutView({ routineId, weekId, workoutId }) {
  const loc = S.locateWorkout(workoutId);
  if (!loc) return notFound('Workout');
  const { routine, week, workout } = loc;
  const st = S.statusOfWorkout(workout.id);
  const content = h('div', { class: 'page' }, modeBanner('plan', 'Planning', 'Set up exercises and target sets. Nothing here is logged until you start the workout.'));
  if (workout.deload) content.append(h('div', { class: 'deload-banner' }, h('span', { class: 'tag-deload', text: 'Deload' }), h('span', { text: 'Starting this workout suggests 60% of your best 1RM for each exercise. It won’t count towards 1RM or exercise charts.' })));

  if (!workout.items.length) content.append(emptyState('No exercises yet', 'Add the exercises for this workout, then set the sets, reps and any target weight.'));
  workout.items.forEach((item, i) => content.append(itemCard(workout, item, i)));
  content.append(h('button', { class: 'btn btn-block btn-ghost', onclick: async () => {
    const id = await pickMovement();
    if (id) { workout.items.push(S.mkItem(id)); S.touch(); nav.refresh(); }
  } }, icon('plus', 18), h('span', { text: 'Add exercise' })));

  const bar = [];
  bar.push(h('button', {
    class: 'btn btn-primary btn-lg grow', text: st.active ? 'Resume workout' : 'Start workout',
    disabled: !workout.items.length && !st.active, onclick: () => startWorkout(workout.id),
  }));
  if (st.done && !st.active) bar.push(h('button', { class: 'btn btn-lg', text: `Last log · ${fmtDate(st.done.startedAt)}`, onclick: () => nav.push(sessionView, { sessionId: st.done.id }) }));

  return {
    title: workout.name, subtitle: `${routine.name} · ${week.name}`, color: workout.color ?? 0, mode: 'plan',
    actions: [iconBtn('more', 'Workout options', () => workoutMenu(routine, week, workout))],
    content, footer: h('div', { class: 'footer-bar' }, bar),
  };
}

function itemCard(workout, item, index) {
  const ex = S.exerciseById(item.exerciseId);
  let n = 0;
  const rows = item.sets.map((set, i) => {
    const label = set.type === 'normal' ? String(++n) : typeInfo(set.type).short;
    return h('div', { class: 'srow srow-plan' },
      h('button', { class: 'pill pill-' + set.type, 'aria-label': `Set ${label}, ${typeInfo(set.type).label}. Change type`, text: label, onclick: () => planSetType(item, set) }),
      h('input', { class: 'num', type: 'text', inputmode: 'text', autocomplete: 'off', placeholder: set.type === 'hold' ? 'seconds' : 'reps', 'aria-label': set.type === 'hold' ? 'Target seconds' : 'Target reps', value: set.reps ?? '', oninput: (e) => { set.reps = e.target.value.trim(); S.touch(); } }),
      h('input', { class: 'num', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'kg', 'aria-label': 'Target weight in kilograms', value: set.weight ?? '', oninput: (e) => { set.weight = e.target.value.trim() === '' ? null : parseNum(e.target.value); S.touch(); } }),
      iconBtn('x', 'Remove set', () => { item.sets = item.sets.filter((x) => x !== set); S.touch(); nav.refresh(); }, 'icon-btn-sm'));
  });
  return h('section', { class: `card entry entry-plan wk wk-${workout.color ?? 0}` },
    h('div', { class: 'entry-head' },
      h('span', { class: 'art-tile art-sm', 'aria-hidden': 'true' }, exerciseArt(ex?.name || '', 28)),
      h('button', { class: 'entry-name', text: ex?.name || 'Deleted exercise', onclick: () => itemMenu(workout, item, index) }),
      iconBtn('more', 'Exercise options', () => itemMenu(workout, item, index))),
    notesList(item, () => S.touch(), () => nav.refresh()),
    h('div', { class: 'sets' },
      h('div', { class: 'srow srow-plan srow-head' }, h('span', { text: 'Set' }), h('span', { text: 'Target reps' }), h('span', { text: 'Target kg' }), h('span', {})),
      rows),
    h('button', { class: 'btn btn-block btn-ghost btn-add', text: '+ Add set', onclick: () => {
      const last = item.sets[item.sets.length - 1];
      item.sets.push(S.mkSet({ type: last?.type || 'normal', reps: last?.reps ?? '', weight: last?.weight ?? null }));
      S.touch(); nav.refresh();
    } }));
}

async function planSetType(item, set) {
  const v = await choiceSheet({ title: 'Set type', options: SET_TYPES.map((t) => ({ label: t.label, sub: t.hint, value: t.id, selected: set.type === t.id })) });
  if (v) { set.type = v; S.touch(); nav.refresh(); }
}

async function itemMenu(workout, item, index) {
  const ex = S.exerciseById(item.exerciseId);
  const v = await choiceSheet({
    title: ex?.name || 'Exercise',
    options: [
      ...(canAddNote(item) ? [{ label: 'Add note', value: 'note', sub: 'Lifting cues or a general note' }] : []),
      { label: 'History in this workout', value: 'history' },
      { label: 'Replace exercise', value: 'replace' },
      { label: 'Move up', value: 'up', disabled: index === 0 },
      { label: 'Move down', value: 'down', disabled: index === workout.items.length - 1 },
      { label: 'Remove from workout', value: 'remove', danger: true },
    ],
  });
  if (v === 'note') await addNote(item, () => S.touch(), () => nav.refresh());
  else if (v === 'history') nav.push(movementHistoryView, { exerciseId: item.exerciseId, slotId: workout.slotId });
  else if (v === 'replace') {
    const id = await pickMovement({ title: 'Replace with' });
    if (id) { item.exerciseId = id; S.touch(); nav.refresh(); }
  } else if (v === 'up' || v === 'down') { S.moveInArray(workout.items, item, v === 'up' ? -1 : 1); nav.refresh(); }
  else if (v === 'remove') {
    workout.items = workout.items.filter((x) => x !== item);
    S.touch(); nav.refresh();
  }
}
