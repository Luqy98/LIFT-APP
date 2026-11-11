// Data model, encrypted persistence and queries.
//
// data      = { settings, exercises[], routines[ { weeks[ { workouts[ { items[ { sets[] } ] } ] } ] } ], activeSessionId }
// sessions  = one record per logged workout (kept separate so saving a set only re-encrypts that one workout)
//
// A workout has a stable `slotId`. Copying a week keeps the slotIds, so "Workout A" in week 1 and
// "Workout A" in week 2 share a slot. History and "previous values" are looked up by slot, which is how a
// bench press on a rep day never mixes with a bench press on a heavy-single day.

import * as C from './crypto.js';
import { setStats, e1rm, weekStart, WORKOUT_COLORS } from './calc.js';

export const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

const STARTER = [
  'Back Squat', 'Front Squat', 'Bench Press', 'Incline Bench Press', 'Incline DB Press', 'Overhead Press',
  'Deadlift', 'Romanian Deadlift', 'Barbell Row', 'Pull-up', 'Lat Pulldown', 'Seated Cable Row',
  'Dumbbell Curl', 'Hammer Curl', 'Triceps Pushdown', 'Skull Crusher', 'Dip', 'Lateral Raise', 'Face Pull',
  'Chest Fly', 'Leg Press', 'Leg Curl', 'Leg Extension', 'Hip Thrust', 'Calf Raise',
];

const DEFAULT_SETTINGS = { theme: 'dark', formula: 'blend', maxReps: 10, restSec: 120, autoLockMin: 5, lastBackup: null };

// Lock-out after repeated wrong passcodes: [failures, seconds]
const THROTTLE = [[5, 30], [6, 60], [7, 300], [8, 900], [9, 3600]];

export let data = null;
let sessionMap = new Map();
let db = null, key = null, vault = null;
const dirty = new Set();
let saveTimer = null;
let chain = Promise.resolve();
let errorHandler = () => {};
export const onSaveError = (fn) => { errorHandler = fn; };

// ---- Lifecycle -------------------------------------------------------------
export async function init(database) {
  db = database;
  vault = (await db.get('vault', 'lock')) || null;
}
export const isSetup = () => !!vault;
export const isUnlocked = () => !!key && !!data;
export const vaultInfo = () => (vault ? { numeric: !!vault.numeric, lockedUntil: vault.lockedUntil || 0, bio: !!vault.bio } : null);

function newData() {
  return {
    v: 1,
    settings: { ...DEFAULT_SETTINGS },
    exercises: STARTER.map((name) => ({ id: uid(), name, archived: false })),
    routines: [],
    activeSessionId: null,
  };
}

export async function setup(secret) {
  const created = await C.createVault(secret);
  vault = { wrapped: created.wrapped, numeric: /^\d+$/.test(secret), fails: 0, lockedUntil: 0 };
  await db.batch('vault', [['lock', vault]]);
  key = created.key;
  data = newData();
  sessionMap = new Map();
  dirty.add('meta');
  await flush();
}

/** -> { ok:true } | { ok:false, wait:seconds } */
export async function unlock(secret) {
  const wait = (vault.lockedUntil || 0) - Date.now();
  if (wait > 0) return { ok: false, wait: Math.ceil(wait / 1000) };
  const k = await C.unlockVault(vault.wrapped, secret);
  if (!k) {
    vault.fails = (vault.fails || 0) + 1;
    const rule = THROTTLE.filter(([n]) => vault.fails >= n).pop();
    vault.lockedUntil = rule ? Date.now() + rule[1] * 1000 : 0;
    await db.batch('vault', [['lock', vault]]);
    return { ok: false, wait: rule ? rule[1] : 0 };
  }
  key = k;
  vault.fails = 0;
  vault.lockedUntil = 0;
  await db.batch('vault', [['lock', vault]]);
  try { await load(); } catch (e) { key = null; throw e; }
  return { ok: true };
}

async function load() {
  const entries = await db.all('records');
  let meta = null;
  const map = new Map();
  await Promise.all(entries.map(async ([k, rec]) => {
    if (k === 'meta') meta = await C.open(key, rec, 'meta');
    else if (typeof k === 'string' && k.startsWith('session:')) {
      const s = await C.open(key, rec, k);
      map.set(s.id, s);
    }
  }));
  data = meta || newData();
  data.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  sessionMap = map;
  if (data.activeSessionId && !sessionMap.has(data.activeSessionId)) data.activeSessionId = null;
  migrate();
}

/** Brings data saved by older versions up to date (workout colours, per-log notes). */
function migrate() {
  let planChanged = false;
  for (const r of data.routines) {
    const bySlot = new Map();
    for (const wk of r.weeks) for (const w of wk.workouts) if (w.color != null && !bySlot.has(w.slotId)) bySlot.set(w.slotId, w.color);
    for (const wk of r.weeks) {
      for (const w of wk.workouts) {
        if (w.color != null) continue;
        let c = bySlot.get(w.slotId);
        if (c == null) { c = freeColor(wk); bySlot.set(w.slotId, c); }
        w.color = c;
        planChanged = true;
      }
    }
  }
  // Notes live on exercises. Move any workout-level or log-level notes from earlier versions onto the first exercise.
  const moveNotes = (from, items) => {
    const text = { ...(from.notes || {}) };
    if (from.note) { text.general = text.general || from.note; }
    delete from.note;
    if (!Object.keys(text).length) { delete from.notes; return false; }
    const first = items[0];
    if (!first) return false;   // nothing to attach to yet; keep it where it is
    first.notes = { ...text, ...(first.notes || {}) };
    delete from.notes;
    return true;
  };
  for (const r of data.routines) for (const wk of r.weeks) for (const w of wk.workouts) if (w.notes && moveNotes(w, w.items)) planChanged = true;
  if (planChanged) touch();
  for (const s of sessionMap.values()) {
    let changed = false;
    if ((s.notes || s.note) && moveNotes(s, s.entries)) changed = true;
    if (s.color == null) { s.color = colorForSlot(s.slotId) ?? 0; changed = true; }
    if (changed) touchSession(s);
  }
}

export async function lock() {
  try { await flush(); } catch { /* ignore */ }
  key = null; data = null; sessionMap = new Map(); dirty.clear();
}

export async function verifyPasscode(secret) {
  return !!(await C.unlockVault(vault.wrapped, secret));
}

export async function changePasscode(oldSecret, newSecret) {
  const wrapped = await C.changeSecret(vault.wrapped, oldSecret, newSecret);
  if (!wrapped) return false;
  vault = { ...vault, wrapped, numeric: /^\d+$/.test(newSecret), fails: 0, lockedUntil: 0 };
  await db.batch('vault', [['lock', vault]]);
  return true;
}

// ---- Fingerprint slot ---------------------------------------------------------
/** Stores a second copy of the data key protected by fingerprint-derived bytes. False if the PIN is wrong. */
export async function enableBio(secret, { credId, salt, bytes }) {
  const slot = await C.addBioSlot(vault.wrapped, secret, bytes);
  if (!slot) return false;
  vault = { ...vault, bio: { credId, salt, ...slot } };
  await db.batch('vault', [['lock', vault]]);
  return true;
}
export async function disableBio() {
  const { bio, ...rest } = vault;
  vault = rest;
  await db.batch('vault', [['lock', vault]]);
}
export const bioParams = () => (vault && vault.bio ? { credId: vault.bio.credId, salt: vault.bio.salt } : null);
/** Unlock using bytes returned by the fingerprint. -> { ok } */
export async function unlockBio(bytes) {
  if (!vault.bio) return { ok: false };
  const k = await C.unlockWithBytes(vault.bio, bytes);
  if (!k) return { ok: false };
  key = k;
  try { await load(); } catch (e) { key = null; throw e; }
  return { ok: true };
}

export async function wipeAll() {
  await db.clearAll();
  key = null; data = null; vault = null; sessionMap = new Map(); dirty.clear();
}

// ---- Saving ----------------------------------------------------------------
export function touch(id = 'meta') {
  dirty.add(id);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { flush(); }, 350);
}
export const touchSession = (s) => touch('session:' + (typeof s === 'string' ? s : s.id));

export function flush() {
  clearTimeout(saveTimer);
  chain = chain.then(doSave).catch((err) => { console.error(err); errorHandler(err); });
  return chain;
}

async function doSave() {
  if (!key || !db || !dirty.size) return;
  const ids = [...dirty];
  dirty.clear();
  const put = [], del = [];
  for (const id of ids) {
    if (id === 'meta') { if (data) put.push([id, await C.seal(key, data, id)]); }
    else {
      const s = sessionMap.get(id.slice(8));
      if (s) put.push([id, await C.seal(key, s, id)]);
      else del.push(id);
    }
  }
  if (put.length || del.length) await db.batch('records', put, del);
}

// ---- Exercise library ------------------------------------------------------
export const exerciseById = (id) => data.exercises.find((e) => e.id === id);
export const exerciseName = (id, fallback = 'Deleted exercise') => exerciseById(id)?.name ?? fallback;
export const findExerciseByName = (name, exceptId) => {
  const n = norm(name).toLowerCase();
  return data.exercises.find((e) => e.id !== exceptId && e.name.toLowerCase() === n);
};
export function addExercise(name) {
  name = norm(name);
  if (!name) return null;
  const existing = findExerciseByName(name);
  if (existing) { existing.archived = false; touch(); return existing; }
  const e = { id: uid(), name, archived: false };
  data.exercises.push(e);
  touch();
  return e;
}
/** -> 'ok' | 'empty' | 'duplicate' */
export function renameExercise(id, name) {
  name = norm(name);
  if (!name) return 'empty';
  if (findExerciseByName(name, id)) return 'duplicate';
  exerciseById(id).name = name;
  touch();
  return 'ok';
}
export function exerciseUsage(id) {
  let plan = 0, logs = 0;
  for (const r of data.routines) for (const w of r.weeks) for (const wo of w.workouts) {
    plan += wo.items.filter((i) => i.exerciseId === id).length;
  }
  for (const s of sessionMap.values()) logs += s.entries.filter((e) => e.exerciseId === id).length;
  return { plan, logs };
}
/** Deletes an unused exercise; archives one that has history so past logs stay intact. -> 'deleted' | 'archived' */
export function removeExercise(id) {
  const u = exerciseUsage(id);
  if (u.plan || u.logs) { exerciseById(id).archived = true; touch(); return 'archived'; }
  data.exercises = data.exercises.filter((e) => e.id !== id);
  touch();
  return 'deleted';
}
export function restoreExercise(id) { exerciseById(id).archived = false; touch(); }

// ---- Plan: routines, weeks, workouts, exercises, sets ----------------------
export const mkSet = (o = {}) => ({ id: uid(), type: 'normal', reps: '', weight: null, ...o });
export const mkItem = (exerciseId) => ({ id: uid(), exerciseId, sets: [mkSet({ reps: '10' }), mkSet({ reps: '10' }), mkSet({ reps: '10' })] });
const mkWorkout = (name, color = 0, slotId = uid()) => ({ id: uid(), slotId, name, color, items: [] });
const mkWeek = (name) => ({ id: uid(), name, workouts: [] });

const cloneWorkout = (w, keepSlot) => ({
  id: uid(), slotId: keepSlot ? w.slotId : uid(), name: w.name, color: w.color ?? 0,
  items: w.items.map((it) => ({ id: uid(), exerciseId: it.exerciseId, ...(it.notes ? { notes: { ...it.notes } } : {}), sets: it.sets.map((s) => ({ ...s, id: uid() })) })),
});
const cloneWeek = (wk, name, keepSlots) => ({ id: uid(), name, workouts: wk.workouts.map((w) => cloneWorkout(w, keepSlots)) });

export const routineById = (id) => data.routines.find((r) => r.id === id);
export const weekById = (routineId, weekId) => routineById(routineId)?.weeks.find((w) => w.id === weekId);

/** Find a workout anywhere. -> { routine, week, workout } | null */
export function locateWorkout(workoutId) {
  for (const routine of data.routines) for (const week of routine.weeks) for (const workout of week.workouts) {
    if (workout.id === workoutId) return { routine, week, workout };
  }
  return null;
}

export function moveInArray(arr, item, dir) {
  const i = arr.indexOf(item), j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  touch();
  return true;
}

export function addRoutine(name, { weeks = 0, perWeek = 0 } = {}) {
  const r = { id: uid(), name: norm(name) || 'New routine', createdAt: now(), weeks: [] };
  const slots = Array.from({ length: perWeek }, () => uid());
  for (let w = 1; w <= weeks; w++) {
    const wk = mkWeek('Week ' + w);
    slots.forEach((sid, i) => wk.workouts.push(mkWorkout('Workout ' + (i + 1), i % WORKOUT_COLORS.length, sid)));
    r.weeks.push(wk);
  }
  data.routines.push(r);
  touch();
  return r;
}
export function renameRoutine(id, name) { const r = routineById(id); r.name = norm(name) || r.name; touch(); }
export function deleteRoutine(id) { data.routines = data.routines.filter((r) => r.id !== id); touch(); }
export function duplicateRoutine(id) {
  const r = routineById(id);
  const slotMap = new Map();
  const copy = {
    id: uid(), name: r.name + ' (copy)', createdAt: now(),
    weeks: r.weeks.map((wk) => ({
      id: uid(), name: wk.name,
      workouts: wk.workouts.map((w) => {
        if (!slotMap.has(w.slotId)) slotMap.set(w.slotId, uid());
        const c = cloneWorkout(w, false);
        c.slotId = slotMap.get(w.slotId);
        return c;
      }),
    })),
  };
  data.routines.splice(data.routines.indexOf(r) + 1, 0, copy);
  touch();
  return copy;
}

export function addWeek(routineId, { copyFromWeekId = null, name } = {}) {
  const r = routineById(routineId);
  const nm = norm(name) || 'Week ' + (r.weeks.length + 1);
  const src = copyFromWeekId ? r.weeks.find((w) => w.id === copyFromWeekId) : null;
  const wk = src ? cloneWeek(src, nm, true) : mkWeek(nm);
  r.weeks.push(wk);
  touch();
  return wk;
}
export function renameWeek(routineId, weekId, name) { const w = weekById(routineId, weekId); w.name = norm(name) || w.name; touch(); }
export function deleteWeek(routineId, weekId) { const r = routineById(routineId); r.weeks = r.weeks.filter((w) => w.id !== weekId); touch(); }
export function duplicateWeek(routineId, weekId) {
  const r = routineById(routineId);
  const src = r.weeks.find((w) => w.id === weekId);
  const copy = cloneWeek(src, src.name + ' (copy)', true);
  r.weeks.splice(r.weeks.indexOf(src) + 1, 0, copy);
  touch();
  return copy;
}

export function addWorkout(routineId, weekId, name) {
  const wk = weekById(routineId, weekId);
  const w = mkWorkout(norm(name) || 'Workout ' + (wk.workouts.length + 1), freeColor(wk));
  wk.workouts.push(w);
  touch();
  return w;
}
/** First palette colour not yet used by a workout in this week (cycles when all are used). */
function freeColor(wk) {
  const used = wk.workouts.map((w) => w.color);
  for (let i = 0; i < WORKOUT_COLORS.length; i++) if (!used.includes(i)) return i;
  return wk.workouts.length % WORKOUT_COLORS.length;
}
/** Colour of a workout slot, the same in every week. */
export function colorForSlot(slotId) {
  for (const r of data.routines) for (const wk of r.weeks) for (const w of wk.workouts) if (w.slotId === slotId && w.color != null) return w.color;
  return null;
}
/** Colour index for a logged session (follows the plan, falls back to the colour it had when logged). */
export const sessionColor = (s) => locateWorkout(s.workoutId)?.workout.color ?? colorForSlot(s.slotId) ?? s.color ?? 0;
export function setWorkoutColor(routineId, workoutId, color) {
  const r = routineById(routineId);
  const target = locateWorkout(workoutId).workout;
  for (const wk of r.weeks) for (const w of wk.workouts) if (w.id === workoutId || w.slotId === target.slotId) w.color = color;
  touch();
}
export function renameWorkout(routineId, workoutId, name, applyToAllWeeks) {
  name = norm(name);
  if (!name) return;
  const r = routineById(routineId);
  const target = locateWorkout(workoutId).workout;
  for (const wk of r.weeks) for (const w of wk.workouts) {
    if (w.id === workoutId || (applyToAllWeeks && w.slotId === target.slotId)) w.name = name;
  }
  touch();
}
export function deleteWorkout(routineId, weekId, workoutId) {
  const wk = weekById(routineId, weekId);
  wk.workouts = wk.workouts.filter((w) => w.id !== workoutId);
  touch();
}
export function duplicateWorkout(routineId, weekId, workoutId) {
  const wk = weekById(routineId, weekId);
  const src = wk.workouts.find((w) => w.id === workoutId);
  const copy = cloneWorkout(src, false);
  copy.name = src.name + ' (copy)';
  wk.workouts.splice(wk.workouts.indexOf(src) + 1, 0, copy);
  touch();
  return copy;
}
/** Make a workout share history with another one (same slot). Existing logs of it move to the new slot. */
export function linkWorkoutSlot(workoutId, slotId) {
  const { workout } = locateWorkout(workoutId);
  workout.slotId = slotId;
  const c = colorForSlot(slotId);
  if (c != null) workout.color = c;
  for (const s of sessionMap.values()) if (s.workoutId === workoutId) { s.slotId = slotId; touchSession(s); }
  touch();
}
/** Other workouts in the same routine that this one could be linked to (one per distinct slot). */
export function linkCandidates(workoutId) {
  const { routine, workout } = locateWorkout(workoutId);
  const seen = new Map();
  for (const wk of routine.weeks) for (const w of wk.workouts) {
    if (w.slotId !== workout.slotId && !seen.has(w.slotId)) seen.set(w.slotId, { slotId: w.slotId, name: w.name, week: wk.name });
  }
  return [...seen.values()];
}

export const statusOfWorkout = (workoutId) => {
  const list = [...sessionMap.values()].filter((s) => s.workoutId === workoutId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const active = list.find((s) => !s.finishedAt);
  const done = list.find((s) => s.finishedAt);
  return { active, done, latest: active || done || null };
};

// ---- Sessions (the log) ----------------------------------------------------
export const allSessions = () => [...sessionMap.values()];
export const sessionById = (id) => sessionMap.get(id);
export const activeSession = () => (data?.activeSessionId ? sessionMap.get(data.activeSessionId) || null : null);
export const sessionsDesc = (filter = () => true) =>
  allSessions().filter(filter).sort((a, b) => b.startedAt.localeCompare(a.startedAt));

export function startSession(workoutId) {
  const loc = locateWorkout(workoutId);
  if (!loc) return null;
  const { routine, week, workout } = loc;
  const s = {
    id: uid(), routineId: routine.id, weekId: week.id, workoutId: workout.id, slotId: workout.slotId,
    routineName: routine.name, weekName: week.name, workoutName: workout.name,
    startedAt: now(), finishedAt: null, color: workout.color ?? 0,
    entries: workout.items.map((it) => ({
      id: uid(), exerciseId: it.exerciseId, exerciseName: exerciseName(it.exerciseId), notes: it.notes ? { ...it.notes } : {},
      sets: it.sets.map((p) => ({ id: uid(), type: p.type, weight: null, reps: null, done: false, tw: p.weight ?? null, tr: p.reps ?? '' })),
    })),
  };
  sessionMap.set(s.id, s);
  data.activeSessionId = s.id;
  touch();
  touchSession(s);
  return s;
}

export function addEntry(s, exerciseId) {
  const e = {
    id: uid(), exerciseId, exerciseName: exerciseName(exerciseId),
    sets: [{ id: uid(), type: 'normal', weight: null, reps: null, done: false, tw: null, tr: '' }],
  };
  s.entries.push(e);
  touchSession(s);
  return e;
}
export function addSessionSet(s, entry) {
  const last = entry.sets[entry.sets.length - 1];
  const set = { id: uid(), type: last?.type || 'normal', weight: null, reps: null, done: false, tw: last?.tw ?? null, tr: last?.tr ?? '' };
  entry.sets.push(set);
  touchSession(s);
  return set;
}

export const filledButUndone = (s) => s.entries.flatMap((e) => e.sets).filter((x) => !x.done && (x.reps != null || x.weight != null));
export const doneSetCount = (s) => s.entries.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);

/** mode: 'count' = tick sets that have values; 'drop' = discard them. Empty sets are always removed. */
export function finishSession(s, mode = 'drop') {
  for (const e of s.entries) {
    for (const x of e.sets) if (!x.done && x.reps != null && mode === 'count') { x.done = true; if (x.weight == null) x.weight = 0; }
    e.sets = e.sets.filter((x) => x.done);
  }
  s.entries = s.entries.filter((e) => e.sets.length);
  s.finishedAt = now();
  if (data.activeSessionId === s.id) data.activeSessionId = null;
  touch();
  touchSession(s);
}
export function deleteSession(s) {
  sessionMap.delete(s.id);
  if (data.activeSessionId === s.id) data.activeSessionId = null;
  touch();
  touchSession(s);
}
export function setSessionDate(s, iso) {
  const dur = s.finishedAt ? new Date(s.finishedAt) - new Date(s.startedAt) : 0;
  s.startedAt = iso;
  if (s.finishedAt) s.finishedAt = new Date(new Date(iso).getTime() + dur).toISOString();
  touchSession(s);
}

// ---- Names that follow renames, with fallbacks for deleted plans ------------
export const workoutName = (s) => locateWorkout(s.workoutId)?.workout.name ?? s.workoutName;
export const weekName = (s) => locateWorkout(s.workoutId)?.week.name ?? s.weekName;
export const routineName = (s) => routineById(s.routineId)?.name ?? s.routineName;
export function slotName(slotId) {
  for (const r of data.routines) for (const wk of r.weeks) for (const w of wk.workouts) if (w.slotId === slotId) return w.name;
  const s = sessionsDesc((x) => x.slotId === slotId)[0];
  return s ? s.workoutName : 'Workout';
}

// ---- Queries ---------------------------------------------------------------
export const calcOpts = () => ({ formula: data.settings.formula, maxReps: data.settings.maxReps });

/** Finished workouts per week, oldest first, ending with the current week. Weeks start on Monday. */
export function weeklyCounts(n = 12) {
  const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const cur = weekStart(new Date());
  const buckets = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(cur); d.setDate(d.getDate() - 7 * i); buckets.push({ start: d, count: 0 }); }
  const byKey = new Map(buckets.map((b) => [key(b.start), b]));
  for (const s of allSessions()) {
    if (!s.finishedAt) continue;
    const b = byKey.get(key(weekStart(s.startedAt)));
    if (b) b.count++;
  }
  return buckets;
}

/** Finished logs containing this exercise, newest first. slotId = null means every workout. */
export function historyFor(exerciseId, slotId = null) {
  const out = [];
  for (const s of sessionsDesc((x) => x.finishedAt && (!slotId || x.slotId === slotId))) {
    const sets = s.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets.filter((x) => x.done));
    if (!sets.length) continue;
    out.push({ session: s, date: s.startedAt, sets, stats: setStats(sets, calcOpts()) });
  }
  return out;
}

/** For a log being filled in or viewed: entryId -> the same exercise's sets from the previous log of the SAME workout slot. */
export function previousFor(session) {
  const prev = sessionsDesc((x) => x.finishedAt && x.slotId === session.slotId && x.id !== session.id && x.startedAt < session.startedAt)[0];
  const res = new Map();
  if (!prev) return res;
  const used = new Map();
  for (const e of session.entries) {
    const n = used.get(e.exerciseId) || 0;
    used.set(e.exerciseId, n + 1);
    const matches = prev.entries.filter((x) => x.exerciseId === e.exerciseId);
    const m = matches[n] || matches[0];
    if (m) res.set(e.id, { sets: m.sets.filter((x) => x.done), session: prev });
  }
  return res;
}

export function exercisesWithData() {
  const map = new Map();
  for (const s of sessionsDesc((x) => x.finishedAt)) {
    for (const e of s.entries) {
      if (!e.sets.some((x) => x.done)) continue;
      const cur = map.get(e.exerciseId) || { count: 0, last: s.startedAt };
      cur.count++;
      map.set(e.exerciseId, cur);
    }
  }
  return map;
}

export function slotsForExercise(exerciseId) {
  const seen = new Map();
  for (const h of historyFor(exerciseId)) if (!seen.has(h.session.slotId)) seen.set(h.session.slotId, slotName(h.session.slotId));
  return [...seen.entries()].map(([slotId, name]) => ({ slotId, name }));
}

/** New estimated-1RM records set in a finished log, compared with everything logged before it. */
export function prsForSession(s) {
  const prs = [];
  for (const e of s.entries) {
    const cur = setStats(e.sets, calcOpts()).e1rm;
    if (cur == null) continue;
    let prior = null;
    for (const h of historyFor(e.exerciseId)) {
      if (h.session.id === s.id || h.date >= s.startedAt) continue;
      if (h.stats.e1rm != null && (prior == null || h.stats.e1rm > prior)) prior = h.stats.e1rm;
    }
    if (prior != null && cur > prior + 0.05) prs.push({ exerciseId: e.exerciseId, e1rm: cur, gain: cur - prior });
  }
  return prs;
}

export function overview() {
  const day = 864e5, t = Date.now();
  let week = 0, month = 0, vol = 0;
  for (const s of allSessions()) {
    if (!s.finishedAt) continue;
    const age = t - new Date(s.startedAt).getTime();
    if (age <= 7 * day) week++;
    if (age <= 30 * day) {
      month++;
      for (const e of s.entries) vol += setStats(e.sets, calcOpts()).volume;
    }
  }
  return { week, month, volume: vol };
}

export { e1rm };

// ---- Backup / restore ------------------------------------------------------
export async function exportBackup(passphrase) {
  await flush();
  return C.sealBackup(passphrase, { app: 'gymlog', v: 1, exportedAt: now(), data, sessions: allSessions() });
}
/** Call once the backup file has actually been saved or shared. */
export function markBackedUp() {
  data.settings.lastBackup = now();
  data.settings.changesSinceBackup = 0;
  touch();
}
/** Finished workouts not yet in any backup. */
export function unbackedCount() {
  const lb = data.settings.lastBackup;
  return allSessions().filter((s) => s.finishedAt && (!lb || s.finishedAt > lb)).length;
}
/** Days since the last backup, or null if never. */
export function backupAgeDays() {
  const lb = data.settings.lastBackup;
  return lb ? Math.floor((Date.now() - new Date(lb).getTime()) / 864e5) : null;
}

export async function importBackup(passphrase, text) {
  return applyBackup(await C.openBackup(passphrase, text));
}

/** Decrypt only (no changes). */
export const readBackup = (passphrase, text) => C.openBackup(passphrase, text);

export async function applyBackup(p) {
  if (!p || p.app !== 'gymlog' || !p.data || !Array.isArray(p.data.exercises) || !Array.isArray(p.data.routines) || !Array.isArray(p.sessions)) {
    throw new Error('That backup is not in a format this app understands.');
  }
  const oldIds = [...sessionMap.keys()];
  data = p.data;
  data.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  sessionMap = new Map(p.sessions.map((s) => [s.id, s]));
  if (data.activeSessionId && !sessionMap.has(data.activeSessionId)) data.activeSessionId = null;
  migrate();
  dirty.add('meta');
  for (const id of [...oldIds, ...sessionMap.keys()]) dirty.add('session:' + id);
  await flush();
  return { sessions: sessionMap.size, routines: data.routines.length };
}
