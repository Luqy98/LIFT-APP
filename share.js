// Sharing with Claude (or any AI assistant) and exporting programmes.
// Everything here only READS your data and builds text; nothing leaves the phone until you pick where to share it.
import * as S from './store.js';
import { setStats, weekStart, fmt, SET_TYPES, typeInfo, WORKOUT_COLORS } from './calc.js';
import { musclesOf } from './muscles.js';
import { VERSION } from './version.js';

// ---- Programme <-> file ----------------------------------------------------------------------

/** A programme as a `lift-programme` file: the plan only (no logs, no settings). Same format Import programme reads. */
export function programmeToFile(routine) {
  const slotKeys = new Map();                              // keep workouts linked across weeks after a re-import
  const keyFor = (slotId) => { if (!slotKeys.has(slotId)) slotKeys.set(slotId, 's' + (slotKeys.size + 1)); return slotKeys.get(slotId); };
  return {
    app: 'lift-programme', v: 1,
    name: routine.name,
    ...(routine.goal ? { goal: routine.goal } : {}),
    weeks: routine.weeks.map((wk) => ({
      name: wk.name,
      ...(wk.note ? { note: wk.note } : {}),
      workouts: wk.workouts.map((w) => ({
        name: w.name, slot: keyFor(w.slotId), color: w.color ?? 0,
        ...(w.deload ? { deload: true } : {}),
        ...(w.note ? { note: w.note } : {}),
        ...(w.equipment ? { equipment: w.equipment } : {}),
        items: w.items.map((it) => ({
          exercise: S.exerciseName(it.exerciseId),
          ...(it.notes && (it.notes.cues || it.notes.general) ? { notes: { ...(it.notes.cues ? { cues: it.notes.cues } : {}), ...(it.notes.general ? { general: it.notes.general } : {}) } } : {}),
          sets: it.sets.map((s) => ({
            ...(s.type && s.type !== 'normal' ? { type: s.type } : {}),
            reps: s.reps ?? '',
            ...(s.weight != null ? { weight: s.weight } : {}),
            ...(s.rir ? { rir: s.rir } : {}),
          })),
        })),
      })),
    })),
  };
}

export const programmeFileName = (routine) =>
  (routine.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'Programme') + '.lift.json';

// ---- Claude share file ----------------------------------------------------------------------

const DAY = 864e5;

// Body-map muscles rolled up into names a coach would use.
function coarse(m) {
  if (/Chest/.test(m)) return 'Chest';
  if (/Biceps|Brachialis/.test(m)) return 'Biceps';
  if (/Triceps/.test(m)) return 'Triceps';
  if (/Flexor|Palmaris|Wrist|Brachioradialis/.test(m)) return 'Forearms';
  if (/Rectus Femoris|Vastus/.test(m)) return 'Quads';
  if (/Hamstrings/.test(m)) return 'Hamstrings';
  if (/Gastrocnemius|Soleus/.test(m)) return 'Calves';
  if (/Abs/.test(m)) return 'Abs';
  if (m === 'Upper Traps') return 'Traps';
  return m; // Front/Side/Rear Delts, Rotator Cuff, Lats, Mid Back, Lower Back, Obliques, Hip Flexors, Glutes, Glute Medius, Adductors, Tibialis
}
const COARSE_ORDER = ['Chest', 'Front Delts', 'Side Delts', 'Rear Delts', 'Lats', 'Mid Back', 'Traps', 'Lower Back', 'Biceps', 'Triceps', 'Forearms',
  'Quads', 'Hamstrings', 'Glutes', 'Glute Medius', 'Adductors', 'Calves', 'Abs', 'Obliques'];

/** { coarseMuscle: 1 | 0.5 } for one exercise: primary counts 1 set, secondary half a set. */
function creditFor(exerciseId) {
  const ex = S.exerciseById(exerciseId);
  const mu = ex ? musclesOf(ex) : { primary: [], secondary: [] };
  const out = {};
  for (const m of mu.secondary) out[coarse(m)] = Math.max(out[coarse(m)] || 0, 0.5);
  for (const m of mu.primary) out[coarse(m)] = 1;
  return out;
}

const dKey = (iso) => iso.slice(0, 10);
const wKey = (d) => { const w = weekStart(d); return `${w.getFullYear()}-${String(w.getMonth() + 1).padStart(2, '0')}-${String(w.getDate()).padStart(2, '0')}`; };
const kg = (n) => (n == null ? '–' : fmt(n, 2) + ' kg');

function fmtSet(x) {
  const t = x.type && x.type !== 'normal' ? typeInfo(x.type).label + ' ' : '';
  if (x.type === 'hold') return `${t}${x.weight ? fmt(x.weight, 2) + ' kg ' : ''}${x.reps ?? '?'} s`;
  return `${t}${x.weight != null ? fmt(x.weight, 2) : 'BW'}×${x.reps ?? '?'}`;
}
/** Runs of identical strings collapsed: ['a','a','b'] -> '2×a, b' (or 'a ×2' style via fn). */
function runs(list, fn) {
  const out = [];
  for (const x of list) { const last = out[out.length - 1]; if (last && last.v === x) last.n++; else out.push({ v: x, n: 1 }); }
  return out.map(fn).join(', ');
}
function fmtPlan(sets) {
  const parts = sets.map((x) => (x.tr || x.tw != null || x.trir) ? `${x.tw != null ? fmt(x.tw, 2) + 'kg ' : ''}${x.tr || '?'}${x.trir ? ' @RIR ' + x.trir : ''}` : null).filter(Boolean);
  return runs(parts, (r) => (r.n > 1 ? `${r.n}×${r.v}` : r.v));
}

/** The whole file as Markdown. detailWeeks = how many weeks get every set (null = everything). */
export function buildClaudeFile({ detailWeeks = 12 } = {}) {
  const data = S.data, opts = S.calcOpts();
  const nowD = new Date();
  const cutoff = detailWeeks == null ? 0 : weekStart(new Date(nowD.getTime() - (detailWeeks - 1) * 7 * DAY)).getTime();
  const done = S.sessionsDesc((x) => x.finishedAt);
  const recent = done.filter((s) => new Date(s.startedAt).getTime() >= cutoff);
  const older = done.filter((s) => new Date(s.startedAt).getTime() < cutoff);
  const L = [];
  const p = (...x) => L.push(...x);

  // 1. Instructions
  p(`# LIFT training data for Claude`, '',
    `Exported ${nowD.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} from LIFT ${VERSION}, a private workout-tracking app. All weights are in kg. ` +
    `${done.length} logged workouts in total${done.length ? `, from ${dKey(done[done.length - 1].startedAt)} to ${dKey(done[0].startedAt)}` : ''}.`, '',
    `## Instructions for Claude`, '',
    `You are acting as this lifter's strength and hypertrophy coach. This file contains everything you need: how LIFT works, the exercise library, their programmes and their training history. Read it before answering.`, '',
    `**When asked to analyse performance:**`,
    `- Look at estimated 1RM trends and rep progress per exercise, especially the key compound lifts. Note what is improving, flat (no progress for 3+ sessions of the same workout) or going backwards.`,
    `- Compare logged sets with the plan (plan targets are shown in brackets): missed reps, weights not increasing, or sets skipped.`,
    `- Check weekly sets per muscle (section "Weekly sets per muscle"). Roughly 10–20 hard sets a week is the usual range for growth; flag muscles well below or above that.`,
    `- Look for signs of under-recovery: several lifts stalling in the same weeks, sessions missed, or performance dropping late in a block. Deload sessions are marked and should not count as regressions.`,
    `- Be specific and honest. Tie every claim to the data, say when there isn't enough data, and don't invent numbers.`, '',
    `**When asked to change or build a programme:** deliver it as a LIFT programme file (format below), as a downloadable file named something like \`My-Programme.lift.json\`. The lifter imports it in LIFT under Workouts → Programmes → Import programme, sees a preview, and it is added as a new programme. Nothing they already have is changed. Explain the reasoning in your reply, and put guidance the lifter needs while training (how to progress, rest times, technique cues) into the notes fields so it shows inside the app.`, '',
    `**Ask before building** if you don't know the lifter's goals, days available, session length, injuries or recovery, unless they are clear from this file or the conversation.`, '');

  // 2. Format
  p(`## LIFT programme file format`, '',
    `A JSON object. Fields marked ? are optional.`, '',
    '```json',
    JSON.stringify({
      app: 'lift-programme', v: 1, name: 'Programme name', 'goal?': 'One sentence, max 240 characters',
      weeks: [{
        name: 'Week 1', 'note?': 'Shown at the top of the week: what this week is for, how hard to push',
        workouts: [{
          name: 'Monday – Upper A', 'slot?': 'mon', 'color?': 0, 'deload?': false,
          'note?': 'Shown at the top of the workout and while logging: warm-up, order, rest times',
          'equipment?': 'Short equipment list, max 240 characters',
          items: [{
            exercise: 'Exact name from the exercise library below',
            'notes?': { 'cues?': 'Lifting cues (technique)', 'general?': 'How to progress, rest time, anything else' },
            sets: [{ 'type?': 'warmup', reps: '5' }, { reps: '8-10', 'weight?': 60, 'rir?': '2' }],
          }],
        }],
      }],
    }, null, 1),
    '```', '',
    `Rules:`,
    `- **exercise**: use the exact name from the library below so it links to the lifter's history and picture. A name that isn't in the library is added as a new custom exercise (plain icon, no history).`,
    `- **sets**: one object per set. **type** is one of: ${SET_TYPES.map((t) => `\`${t.id}\` (${t.hint.toLowerCase()})`).join(', ')}. Omit type for normal sets.`,
    `- **reps**: text. A single number (\`"5"\`) or a range (\`"8-10"\`, the app pre-fills the lower number). For \`hold\` sets reps are seconds.`,
    `- **weight**: optional kg target. Usually leave it out: the app shows last time's numbers for the same workout.`,
    `- **rir**: optional target reps in reserve as text, max 3 characters (\`"2"\`, \`"1-2"\`, \`"0"\`).`,
    `- **slot**: workouts with the same slot (or, if no slot, the same name) in different weeks are the same workout repeated, so the app compares them week to week. Use the same slot for "Monday" in every week.`,
    `- **color**: 0–${WORKOUT_COLORS.length - 1} (${WORKOUT_COLORS.join(', ')}).`,
    `- **deload**: true marks a deload workout. The app suggests ${Math.round(0.6 * 100)}% of best estimated 1RM and leaves it out of 1RM charts and records.`,
    `- Weeks are done in order; for a rotating plan (e.g. Week A / Week B), say in the week notes how to cycle them.`, '');

  // 3. Settings and targets
  p(`## Settings`, '',
    `- Estimated 1RM formula: ${opts.formula}. Sets above ${opts.maxReps} reps are not used for 1RM. Warm-up and drop sets never count; hold sets count as sets only.`);
  if ((data.targets || []).length) {
    p(`- Strength targets set in the app:`);
    for (const t of data.targets) p(`  - ${S.exerciseName(t.exerciseId)}: ${kg(t.kg)}${t.date ? ` by ${t.date}` : ''}${t.reachedAt ? ` (reached ${dKey(t.reachedAt)})` : ''}`);
  }
  p('');

  // 4. Exercise library
  const lib = data.exercises.filter((e) => !e.archived).sort((a, b) => a.name.localeCompare(b.name));
  p(`## Exercise library (${lib.length})`, '', `Name — primary muscles; secondary muscles.`, '');
  for (const e of lib) {
    const mu = musclesOf(e);
    const pr = [...new Set(mu.primary.map(coarse))], se = [...new Set(mu.secondary.map(coarse))].filter((x) => !pr.includes(x));
    p(`- ${e.name}${pr.length ? ` — ${pr.join(', ')}` : ''}${se.length ? `; ${se.join(', ')}` : ''}`);
  }
  p('');

  // 5. Programmes
  const lastUsed = done[0]?.routineId;
  // The programme in use is included in full (as an importable file). Others are listed, so the file stays a sensible size.
  p(`## Programmes (${data.routines.length})`, '');
  const full = lastUsed && S.routineById(lastUsed) ? [S.routineById(lastUsed)] : data.routines.slice(0, 2);
  for (const r of full) {
    p(`### ${r.name}${r.id === lastUsed ? ' (currently in use)' : ''}`, '', `The full plan in LIFT programme format. To change it, edit this and hand back a new file.`, '', '```json', JSON.stringify(programmeToFile(r)), '```', '');
  }
  const rest = data.routines.filter((r) => !full.includes(r));
  if (rest.length) {
    p(`Other programmes on the phone (not included in full; the lifter can send one with ⋮ → Export programme on that programme):`);
    for (const r of rest) p(`- ${r.name}: ${r.weeks.length} week${r.weeks.length === 1 ? '' : 's'}, workouts ${[...new Set(r.weeks.flatMap((w) => w.workouts.map((x) => x.name)))].join(', ')}`);
    p('');
  }

  // 6. Records
  const recs = new Map();
  for (const s of done) {
    if (s.deload) continue;
    for (const e of s.entries) {
      const st = setStats(e.sets, opts);
      if (!st.sets) continue;
      const r = recs.get(e.exerciseId) || { e1rm: null, e1Date: null, top: null, topDate: null };
      if (st.e1rm != null && (r.e1rm == null || st.e1rm > r.e1rm)) { r.e1rm = st.e1rm; r.e1Date = dKey(s.startedAt); }
      if (st.top && (!r.top || st.top.weight > r.top.weight)) { r.top = st.top; r.topDate = dKey(s.startedAt); }
      recs.set(e.exerciseId, r);
    }
  }
  p(`## All-time records`, '', `Best estimated 1RM and heaviest set per exercise (deloads excluded).`, '', `| Exercise | Best e1RM | Date | Heaviest set | Date |`, `|---|---|---|---|---|`);
  for (const [id, r] of [...recs].sort((a, b) => S.exerciseName(a[0]).localeCompare(S.exerciseName(b[0])))) {
    p(`| ${S.exerciseName(id)} | ${r.e1rm != null ? kg(r.e1rm) : '–'} | ${r.e1Date || '–'} | ${r.top ? `${fmt(r.top.weight, 2)} kg × ${r.top.reps}` : '–'} | ${r.topDate || '–'} |`);
  }
  p('');

  // 7. Weekly sets per muscle (the detailed period)
  const weeks = new Map();
  for (const s of recent) {
    if (s.deload) continue;
    const wk = wKey(s.startedAt);
    const row = weeks.get(wk) || {};
    for (const e of s.entries) {
      const n = setStats(e.sets, opts).sets;
      if (!n) continue;
      for (const [m, c] of Object.entries(creditFor(e.exerciseId))) row[m] = (row[m] || 0) + n * c;
    }
    weeks.set(wk, row);
  }
  if (weeks.size) {
    const cols = COARSE_ORDER.filter((m) => [...weeks.values()].some((r) => r[m]));
    p(`## Weekly sets per muscle`, '', `Working sets per week (week starting Monday). A primary muscle counts 1 per set, a secondary muscle 0.5. Deload weeks excluded.`, '',
      `| Week | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
    for (const [wk, r] of [...weeks].sort()) p(`| ${wk} | ${cols.map((m) => (r[m] ? fmt(r[m], 1) : '0')).join(' | ')} |`);
    p('');
  }

  // 8. Recent sessions in full
  p(`## Recent workouts, every set (${detailWeeks == null ? 'all history' : `last ${detailWeeks} weeks`}: ${recent.length})`, '',
    `Format: weight×reps per working set. W = warm-up. Plan targets in brackets.`, '');
  for (const s of [...recent].reverse()) {
    const mins = s.finishedAt ? Math.round((new Date(s.finishedAt) - new Date(s.startedAt)) / 60000) : null;
    p(`### ${dKey(s.startedAt)} — ${S.workoutName(s)} (${S.routineName(s)} · ${S.weekName(s)})${s.deload ? ' — DELOAD' : ''}${mins ? ` — ${mins} min` : ''}`);
    if (s.workoutNote) p(`Note: ${s.workoutNote.replace(/\s+/g, ' ')}`);
    for (const e of s.entries) {
      const did = e.sets.filter((x) => x.done);
      const plan = fmtPlan(e.sets.filter((x) => x.type !== 'warmup'));
      const skipped = e.sets.length - did.length;
      p(`- ${S.exerciseName(e.exerciseId, e.exerciseName)}: ${did.length ? runs(did.map((x) => (x.type === 'warmup' ? 'W ' : '') + fmtSet({ ...x, type: x.type === 'warmup' ? 'normal' : x.type })), (r) => (r.n > 1 ? `${r.v} (×${r.n})` : r.v)) : 'not done'}${skipped && did.length ? ` (${skipped} planned set${skipped > 1 ? 's' : ''} not done)` : ''}${plan ? ` [plan: ${plan}]` : ''}`);
    }
    p('');
  }

  // 9. Older history, monthly per exercise (keeps years of history to a few KB per year)
  if (older.length) {
    const byEx = new Map();
    for (const s of older) {
      if (s.deload) continue;
      const wk = s.startedAt.slice(0, 7);
      for (const e of s.entries) {
        const st = setStats(e.sets, opts);
        if (!st.sets) continue;
        const m = byEx.get(e.exerciseId) || new Map();
        const w = m.get(wk) || { sessions: 0, sets: 0, e1rm: null, top: null };
        w.sessions++; w.sets += st.sets;
        if (st.e1rm != null && (w.e1rm == null || st.e1rm > w.e1rm)) w.e1rm = st.e1rm;
        if (st.top && (!w.top || st.top.weight > w.top.weight)) w.top = st.top;
        m.set(wk, w);
        byEx.set(e.exerciseId, m);
      }
    }
    p(`## Older history, monthly summary per exercise (${older.length} workouts before the detailed period)`, '',
      `Per month: best estimated 1RM · heaviest set · working sets · workouts. Deloads excluded.`, '');
    for (const [id, m] of [...byEx].sort((a, b) => S.exerciseName(a[0]).localeCompare(S.exerciseName(b[0])))) {
      p(`### ${S.exerciseName(id)}`);
      p([...m].sort().map(([wk, w]) => `${wk}: ${w.e1rm != null ? fmt(w.e1rm, 1) : '–'} · ${w.top ? `${fmt(w.top.weight, 2)}×${w.top.reps}` : '–'} · ${w.sets} sets · ${w.sessions}×`).join('; '));
      p('');
    }
  }
  return L.join('\n');
}

export const claudeFileName = () => `LIFT-for-Claude-${new Date().toISOString().slice(0, 10)}.md`;
