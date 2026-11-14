// Matches an exercise name to a mascot icon (pure logic, no DOM). See art.js for how it is drawn.
import { ICONS } from './icons.js';

const ALIASES = {
  'bench press': 'Bench Press (Barbell)', bench: 'Bench Press (Barbell)', 'flat bench press': 'Bench Press (Barbell)',
  'incline bench press': 'Incline Bench Press (Barbell)', 'incline db press': 'Incline Bench Press (Dumbbell)',
  'incline dumbbell press': 'Incline Bench Press (Dumbbell)', 'dumbbell press': 'Bench Press (Dumbbell)', 'db press': 'Bench Press (Dumbbell)',
  'dumbbell bench press': 'Bench Press (Dumbbell)', 'overhead press': 'Overhead Press (Barbell)', ohp: 'Overhead Press (Barbell)',
  'military press': 'Overhead Press (Barbell)', 'shoulder press': 'Overhead Press (Dumbbell)', squat: 'Back Squat', 'barbell squat': 'Back Squat',
  deadlift: 'Deadlift (Conventional)', rdl: 'Romanian Deadlift', 'barbell row': 'Barbell Row (Overhand)', row: 'Barbell Row (Overhand)',
  'bent over row': 'Barbell Row (Overhand)', 'pull up': 'Pull-Up (Overhand)', pullup: 'Pull-Up (Overhand)', 'chin up': 'Chin-Up (Underhand)',
  'lat pulldown': 'Lat Pulldown (Wide)', pulldown: 'Lat Pulldown (Wide)', 'dumbbell curl': 'Dumbbell Curl (Standing)', curl: 'Dumbbell Curl (Standing)',
  'bicep curl': 'Dumbbell Curl (Standing)', 'biceps curl': 'Dumbbell Curl (Standing)', 'hammer curl': 'Hammer Curl (Standing)',
  'triceps pushdown': 'Triceps Pushdown (Rope)', 'tricep pushdown': 'Triceps Pushdown (Rope)', pushdown: 'Triceps Pushdown (Rope)',
  'skull crusher': 'Skull Crusher (EZ-Bar)', dip: 'Dips (Chest)', dips: 'Dips (Chest)', 'lateral raise': 'Lateral Raise (Dumbbell)',
  'side raise': 'Lateral Raise (Dumbbell)', 'face pull': 'Face Pull (Cable)', 'chest fly': 'Chest Fly (Dumbbell)', fly: 'Chest Fly (Dumbbell)',
  'chest press machine': 'Chest Press (Machine)', 'machine chest press': 'Chest Press (Machine)', 'pec deck': 'Pec Deck (Machine)',
  'chest fly high to low': 'Cable Crossover (High-Low)', 'chest fly low to high': 'Cable Crossover (Low-High)',
  'leg curl': 'Leg Curl (Seated)', 'hip thrust': 'Hip Thrust (Barbell)', 'calf raise': 'Calf Raise (Standing)', 'calves raise': 'Calf Raise (Standing)',
  'jm press': 'JM Press (Barbell)', 'jm press machine': 'JM Press (Barbell)',
};
const STOP = new Set(['the', 'a', 'with']);
const tokens = (str) => String(str || '').toLowerCase().replace(/\bdbs?\b/g, 'dumbbell').replace(/\bbbs?\b/g, 'barbell').replace(/\bez\b/g, 'ezbar')
  .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((t) => t && !STOP.has(t)).map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
const keyOf = (str) => tokens(str).join(' ');
const sortedKey = (str) => tokens(str).sort().join(' ');

let INDEX = null;
function buildIndex() {
  const byKey = new Map(); const bySorted = new Map(); const byBase = new Map(); const list = [];
  const seen = new Set();
  for (const [name, slug, eyes] of ICONS) {
    const ic = { name, slug, eyes: !!eyes, tok: new Set(tokens(name)) };
    list.push(ic);
    for (const [map, k] of [[byKey, keyOf(name)], [bySorted, sortedKey(name)], [byBase, keyOf(name.replace(/\(.*?\)/g, ''))]]) if (!map.has(k)) map.set(k, ic);
    seen.add(slug);
  }
  INDEX = { byKey, bySorted, byBase, list };
}

/** The mascot icon for an exercise name, or null when there is no good match. */
export function iconFor(name) {
  const raw = String(name || '').trim();
  if (!raw) return null;
  if (!INDEX) buildIndex();
  const { byKey, bySorted, byBase, list } = INDEX;
  const k = keyOf(raw);
  const alias = ALIASES[raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()];
  if (alias) return byKey.get(keyOf(alias)) || null;
  if (byKey.has(k)) return byKey.get(k);
  const sk = sortedKey(raw);
  if (bySorted.has(sk)) return bySorted.get(sk);
  if (byBase.has(k)) return byBase.get(k);
  const q = new Set(tokens(raw));
  if (q.size < 2) return null;
  let best = null;
  for (const ic of list) {                       // every word of the icon's name appears in the exercise name
    if (ic.tok.size < 2) continue;
    let all = true; for (const t of ic.tok) if (!q.has(t)) { all = false; break; }
    if (all && (!best || ic.tok.size > best.tok.size)) best = ic;
  }
  if (best) return best;
  for (const ic of list) {                       // every word of the exercise name appears in the icon's name
    let all = true; for (const t of q) if (!ic.tok.has(t)) { all = false; break; }
    if (all && (!best || ic.tok.size < best.tok.size)) best = ic;
  }
  return best;
}
export const imageSlug = (name) => iconFor(name)?.slug || null;

