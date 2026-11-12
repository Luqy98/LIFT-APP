// Pure maths + formatting. No DOM, no storage.

/** A deload session suggests this fraction of your best estimated 1RM. */
export const DELOAD_PCT = 0.6;

export const SET_TYPES = [
  { id: 'normal',  label: 'Normal',   short: '',    hint: 'A standard working set' },
  { id: 'warmup',  label: 'Warm-up',  short: 'W',   hint: 'Not counted in volume or 1RM' },
  { id: '1rm',     label: '1RM',      short: '1RM', hint: 'A max single' },
  { id: 'amrap',   label: 'AMRAP',    short: 'AM',  hint: 'As many reps as possible' },
  { id: 'drop',    label: 'Drop set', short: 'D',   hint: 'Lighter weight straight after a set' },
  { id: 'failure', label: 'Failure',  short: 'F',   hint: 'Taken to failure' },
  { id: 'backoff', label: 'Back-off', short: 'B',   hint: 'Lighter set after the top work' },
  { id: 'hold',    label: 'Static hold', short: 'H', hint: 'Timed hold. Reps = seconds. Not used for 1RM' },
];
export const typeInfo = (id) => SET_TYPES.find((t) => t.id === id) || SET_TYPES[0];

// ---- Estimated 1RM ---------------------------------------------------------
const epley = (w, r) => w * (1 + r / 30);
const brzycki = (w, r) => (w * 36) / (37 - r);
const lombardi = (w, r) => w * Math.pow(r, 0.10);
const wathan = (w, r) => (100 * w) / (48.8 + 53.8 * Math.exp(-0.075 * r));
const mayhew = (w, r) => (100 * w) / (52.2 + 41.9 * Math.exp(-0.055 * r));

export const FORMULAS = {
  blend:    { label: 'Blend (Epley + Brzycki + Lombardi)', fn: (w, r) => (epley(w, r) + brzycki(w, r) + lombardi(w, r)) / 3 },
  epley:    { label: 'Epley', fn: epley },
  brzycki:  { label: 'Brzycki', fn: brzycki },
  lombardi: { label: 'Lombardi', fn: lombardi },
  wathan:   { label: 'Wathan', fn: wathan },
  mayhew:   { label: 'Mayhew', fn: mayhew },
};

export const DEFAULT_MAX_REPS = 10;

/** Estimated 1RM for one set, or null if the set can't give a trustworthy estimate. */
export function e1rm(weight, reps, { formula = 'blend', maxReps = DEFAULT_MAX_REPS } = {}) {
  if (!(weight > 0) || !(reps >= 1) || reps > maxReps) return null;
  if (reps === 1) return weight;
  const f = FORMULAS[formula] || FORMULAS.blend;
  return f.fn(weight, reps);
}

export function parseNum(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Summary of one exercise's sets within one session.
 * Only ticked sets count; warm-ups are ignored; drop sets count for volume but not for 1RM.
 */
export function setStats(sets, opts) {
  let best = null, bestSet = null, top = null, volume = 0, reps = 0, n = 0;
  for (const s of sets) {
    const r = parseNum(s.reps);
    const w = parseNum(s.weight) ?? 0;
    if (!s.done || s.type === 'warmup' || !(r > 0)) continue;
    if (s.type === 'hold') { n++; continue; } // timed holds count as a set only: no volume, top set or 1RM
    n++; volume += w * r; reps += r;
    if (!top || w > top.weight || (w === top.weight && r > top.reps)) top = { weight: w, reps: r };
    if (s.type !== 'drop') {
      const e = e1rm(w, r, opts);
      if (e != null && (best == null || e > best)) { best = e; bestSet = { weight: w, reps: r }; }
    }
  }
  return { e1rm: best, bestSet, top, volume, reps, sets: n };
}

/** Best weight lifted for each rep count, across a list of {date, sets}. */
export function repRecords(history) {
  const map = new Map();
  for (const h of history) {
    for (const s of h.sets) {
      const r = parseNum(s.reps), w = parseNum(s.weight);
      if (!s.done || s.type === 'warmup' || s.type === 'hold' || !(r > 0) || !(w > 0)) continue;
      const cur = map.get(r);
      if (!cur || w > cur.weight) map.set(r, { reps: r, weight: w, date: h.date });
    }
  }
  return [...map.values()].sort((a, b) => a.reps - b.reps);
}

// ---- Formatting ------------------------------------------------------------
export const fmt = (n, d = 1) => (n == null || !Number.isFinite(n) ? '–' : String(Math.round(n * 10 ** d) / 10 ** d));
export const fmtW = (n) => fmt(n, 2);
export const fmtSign = (n, d = 1) => (n == null ? '–' : (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n), d));

export function fmtVol(kg) {
  if (!kg) return '0 kg';
  return kg >= 10000 ? `${fmt(kg / 1000, 1)} t` : `${Math.round(kg).toLocaleString('en-GB')} kg`;
}

export function setLabel(s) {
  const w = parseNum(s.weight), r = parseNum(s.reps);
  if (r == null) return '–';
  if (s.type === 'hold') return w ? `${fmtW(w)}×${fmt(r, 0)}s` : `${fmt(r, 0)}s`;
  return w ? `${fmtW(w)}×${fmt(r, 0)}` : `BW×${fmt(r, 0)}`;
}

const sameYear = (d) => d.getFullYear() === new Date().getFullYear();
export function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', sameYear(d) ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: '2-digit' });
}
export const fmtDateLong = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const fmtMonth = (iso) => new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** ISO string -> value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---- Workout colours and weeks ----------------------------------------------
export const WORKOUT_COLORS = ['Blue', 'Violet', 'Pink', 'Orange', 'Green', 'Sky'];

/** Local midnight on the Monday that starts the week containing `d`. */
export function weekStart(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
