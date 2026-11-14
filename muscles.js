// Which muscles each exercise trains: primary (main movers) and secondary (assisting). Matched on the exercise name, first rule wins.
// Muscle names are the ones the body map will use.
export const MUSCLES = [
  'Upper Chest', 'Mid Chest', 'Lower Chest',
  'Front Delts', 'Side Delts', 'Rear Delts', 'Rotator Cuff',
  'Biceps Long Head', 'Biceps Short Head', 'Brachialis', 'Triceps Long Head', 'Triceps Lateral Head', 'Triceps Medial Head',
  'Wrist Flexors', 'Wrist Extensors', 'Brachioradialis',
  'Upper Traps', 'Lats', 'Mid Back', 'Lower Back',
  'Upper Abs', 'Lower Abs', 'Obliques', 'Hip Flexors',
  'Rectus Femoris', 'Vastus Lateralis', 'Vastus Medialis', 'Outer Hamstrings', 'Inner Hamstrings',
  'Glutes', 'Glute Medius', 'Adductors', 'Gastrocnemius', 'Soleus', 'Tibialis',
];
// Rules below use short keys for whole muscles; detail() turns them into the specific parts above (heads, upper/lower, etc.).
const m = (s) => s.split(' ').filter(Boolean);
const SIMPLE = {
  uc: 'Upper Chest', c: 'Mid Chest', lc: 'Lower Chest', fd: 'Front Delts', sd: 'Side Delts', rd: 'Rear Delts', rc: 'Rotator Cuff',
  tr: 'Upper Traps', la: 'Lats', mb: 'Mid Back', lb: 'Lower Back', ob: 'Obliques', hf: 'Hip Flexors',
  gl: 'Glutes', abd: 'Glute Medius', ad: 'Adductors', ti: 'Tibialis',
};
// Old (2.13.0) names saved by the user's own choices -> the new, more specific names.
const LEGACY = {
  Chest: ['Mid Chest'], Biceps: ['Biceps Long Head', 'Biceps Short Head'], Triceps: ['Triceps Long Head', 'Triceps Lateral Head', 'Triceps Medial Head'],
  Forearms: ['Wrist Flexors'], Traps: ['Upper Traps'], Abs: ['Upper Abs', 'Lower Abs'], Quads: ['Rectus Femoris', 'Vastus Lateralis', 'Vastus Medialis'],
  Hamstrings: ['Outer Hamstrings', 'Inner Hamstrings'], Calves: ['Gastrocnemius'], Abductors: ['Glute Medius'],
};

function detail(n, pk, sk) {
  const out = { primary: [], secondary: [] };
  const put = (role, ...names) => { for (const x of names) if (!out.primary.includes(x) && !out.secondary.includes(x)) out[role].push(x); };
  const is = (re) => re.test(n);
  const expand = (k, role) => {
    const prim = role === 'primary';
    if (SIMPLE[k]) return put(role, SIMPLE[k]);
    if (k === 'bi') {
      if (is(/hammer|crossbody|cross-body|zottman|reverse curl/)) { put(role, 'Brachialis'); return put('secondary', 'Biceps Long Head', 'Biceps Short Head'); }
      if (is(/incline|drag|bayesian/)) { put(role, 'Biceps Long Head'); return put('secondary', 'Biceps Short Head', 'Brachialis'); }
      if (is(/preacher|spider|concentration/)) { put(role, 'Biceps Short Head'); return put('secondary', 'Biceps Long Head', 'Brachialis'); }
      put(role, 'Biceps Long Head', 'Biceps Short Head');
      return prim ? put('secondary', 'Brachialis') : undefined;
    }
    if (k === 'tri') {
      if (!prim) return put(role, 'Triceps Long Head', 'Triceps Lateral Head', 'Triceps Medial Head');
      if (is(/overhead|skull|lying|french/)) { put(role, 'Triceps Long Head'); return put('secondary', 'Triceps Lateral Head', 'Triceps Medial Head'); }
      if (is(/kickback/)) { put(role, 'Triceps Lateral Head', 'Triceps Long Head'); return put('secondary', 'Triceps Medial Head'); }
      if (is(/pushdown|push down|neutral grip|extension \(machine|press \(machine/)) { put(role, 'Triceps Lateral Head', 'Triceps Medial Head'); return put('secondary', 'Triceps Long Head'); }
      return put(role, 'Triceps Long Head', 'Triceps Lateral Head', 'Triceps Medial Head');
    }
    if (k === 'fa') {
      if (is(/reverse wrist/)) return put(role, 'Wrist Extensors');
      if (is(/forearm roller/)) return put(role, 'Wrist Flexors', 'Wrist Extensors');
      if (is(/wrist curl/)) return put(role, 'Wrist Flexors');
      if (is(/reverse curl/)) return put(role, 'Brachioradialis', 'Wrist Extensors');
      if (is(/hammer|zottman/)) return put(role, 'Brachioradialis');
      put(role, 'Wrist Flexors');
      return prim ? put('secondary', 'Wrist Extensors') : undefined;
    }
    if (k === 'ab') {
      const lower = is(/leg raise|knee raise|knee tuck|toes to bar|reverse crunch|l-sit|v-up|jackknife|scissor|flutter|lying leg|hanging|captains|dead bug/);
      const upper = is(/crunch|sit-up|situp/) && !lower;
      if (lower) { put(role, 'Lower Abs'); return put('secondary', 'Upper Abs'); }
      if (upper) { put(role, 'Upper Abs'); return put('secondary', 'Lower Abs'); }
      return put(role, 'Upper Abs', 'Lower Abs');
    }
    if (k === 'q') {
      if (is(/leg extension|sissy|wall sit|sled push|sled sprint|sled drag/)) return put(role, 'Rectus Femoris', 'Vastus Lateralis', 'Vastus Medialis');
      put(role, 'Vastus Lateralis', 'Vastus Medialis');
      return put('secondary', 'Rectus Femoris');
    }
    if (k === 'ham') return put(role, 'Outer Hamstrings', 'Inner Hamstrings');
    if (k === 'ca') {
      if (is(/seated calf|soleus/)) { put(role, 'Soleus'); return put('secondary', 'Gastrocnemius'); }
      put(role, 'Gastrocnemius');
      return prim ? put('secondary', 'Soleus') : undefined;
    }
    throw new Error('unknown muscle key ' + k);
  };
  pk.forEach((k) => expand(k, 'primary'));
  sk.forEach((k) => expand(k, 'secondary'));
  return out;
}

// [pattern, primary, secondary]. First match wins, so specific variants sit above general ones.
const RULES = [
  // --- hamstring isolation ---
  [/leg curl|hamstring curl|nordic|glute-ham|ghr/, 'ham', 'gl ca'],
  // --- rear delts / upper back isolation ---
  [/face pull/, 'rd rc', 'mb tr sd'],
  [/rear delt|reverse fly|reverse pec deck|pec deck \(reverse\)|bent-over reverse|bent-over lateral|prone w|w raise|incline reverse/, 'rd', 'mb tr rc'],
  // --- olympic lifts ---
  [/split jerk|jerk/, 'fd q gl', 'tri tr ab sd'],
  [/clean and press/, 'q gl ham tr fd', 'lb tri mb fa sd'],
  [/snatch|^clean(?! and)|power clean/, 'q gl ham tr', 'lb fd tri mb fa'],
  [/thruster/, 'q gl fd', 'tri ab sd'],
  // --- pressing overhead before push-ups (handstand/pike are shoulder lifts) ---
  [/pike push|handstand push/, 'fd', 'tri sd tr uc'],
  [/landmine (shoulder )?press/, 'fd uc', 'tri sd ab'],
  [/push press/, 'fd', 'tri sd q tr'],
  [/arnold/, 'fd sd', 'tri tr'],
  [/z-press|seated dumbbell press|overhead press|shoulder press|military/, 'fd', 'tri sd tr uc'],
  // --- chest ---
  [/chest fly high to low/, 'lc', 'c fd'],
  [/chest fly low to high/, 'uc', 'c fd'],
  [/incline.*(fly|flye)|(fly|flye).*incline/, 'uc', 'c fd'],
  [/decline.*(fly|flye)|(fly|flye).*decline|cable fly \(high to low\)|crossover.*(high-low|high to low)/, 'lc', 'c fd'],
  [/cable fly \(low to high\)|crossover.*(low-high|low to high)/, 'uc', 'c fd'],
  [/chest fly|chest flye|cable fly|pec deck|crossover|standing cable fly|chest squeeze|fly \(machine\)/, 'c', 'fd'],
  [/incline.*(press|bench)|(press|bench).*incline/, 'uc c', 'fd tri'],
  [/decline.*(press|bench)|(press|bench).*decline/, 'lc c', 'tri fd'],
  [/close-grip bench|jm press|tate press|diamond push|close-grip push/, 'tri', 'c fd'],
  [/push-up \(decline\)|decline push/, 'uc c', 'fd tri ab'],
  [/push-up \(incline\)|incline push/, 'lc c', 'fd tri ab'],
  [/dips \(chest\)|chest dip/, 'lc c tri', 'fd'],
  [/bench dip|triceps dip|dip \(machine\)|^dips?$|(^| )dips?( |$)/, 'tri', 'lc c fd'],
  [/^dumbbell press$|^db press$|bench press|chest press|machine press|push-up|push up|pushup|squeeze press|svend|floor press|chest-press/, 'c', 'fd tri'],
  // --- shoulders ---
  [/cuban/, 'rc sd', 'rd fd tr'],
  [/lateral raise|side raise/, 'sd', 'tr rc'],
  [/front raise|plate front/, 'fd', 'uc sd tr'],
  [/external rotation|internal rotation/, 'rc', 'rd'],
  [/upright row/, 'sd tr', 'fd bi fa'],
  [/shrug/, 'tr', 'fa'],
  // --- back ---
  [/pull-over|pullover|pull over|straight-arm/, 'la', 'tri c'],
  [/chin-up|chinup|underhand pull/, 'la bi', 'mb rd fa'],
  [/pull-up|pullup|pulldown|pull down|lat pull|lat row/, 'la', 'bi mb rd fa'],
  [/high pull/, 'tr sd', 'bi mb gl q lb fa'],
  [/rack pull/, 'tr lb mb la', 'gl ham fa'],
  [/chest-supported|seal row|machine row|low machine row|high machine row|iso-lateral row|rear delt row/, 'mb la', 'rd bi tr fa'],
  [/inverted row/, 'mb la', 'rd bi fa ab'],
  [/barbell row|pendlay|t-bar|meadows|landmine row|dumbbell row|db row|one-arm.*row|single-arm.*row|smith.*row/, 'la mb', 'rd bi tr lb fa'],
  [/cable row|seated.*row|row/, 'mb la', 'rd bi tr fa'],
  [/good morning/, 'lb ham gl', 'ab'],
  [/back extension|hyperextension|reverse hyper|superman/, 'lb', 'gl ham'],
  // --- arms ---
  [/skull|triceps|tricep|pushdown|push down|kickback \(dumbbell\)|single-arm kickback|overhead extension|overhead triceps|extension \(neutral|jm|rope overhead/, 'tri', ''],
  // --- forearms and carries ---
  [/wrist curl|forearm roller|plate pinch|dead hang/, 'fa', ''],
  [/suitcase/, 'ob fa', 'tr ab gl'],
  [/overhead carry/, 'fd tr', 'ab ob fa rc'],
  [/waiter/, 'rc fd', 'fa tr ab'],
  [/front rack carry/, 'ab tr', 'fd fa q'],
  [/sandbag carry/, 'tr ab', 'fa gl q lb'],
  [/yoke/, 'tr lb', 'ab q gl fa ob'],
  [/farmer|carry/, 'fa tr', 'ab ob gl q'],
  [/reverse curl/, 'fa bi', ''],
  [/hammer curl|crossbody|zottman|drag curl/, 'bi', 'fa'],
  [/curl/, 'bi', 'fa'],
  // --- legs ---
  [/leg extension/, 'q', ''],
  [/sissy/, 'q', 'hf ab'],
  [/single-leg romanian|b-stance romanian/, 'ham gl', 'lb ab abd fa'],
  [/kettlebell swing|hip hinge/, 'gl ham', 'lb q fa fd'],
  [/pull-through|pull through/, 'gl ham', 'lb fa'],
  [/romanian|stiff-leg|rdl/, 'ham gl lb', 'mb tr la fa'],
  [/sumo deadlift/, 'lb mb tr la gl ham', 'q ad fa'],
  [/deadlift|trap bar/, 'lb mb tr la gl ham', 'q fa ab'],
  [/hip thrust|glute bridge|frog pump|glute kickback|donkey kick|kickback \(cable\)|cable kickback|hip extension/, 'gl', 'ham ad'],
  [/fire hydrant|clamshell|hip abduction|abductor|cable abduction|lateral band/, 'abd', 'gl'],
  [/hip adduction|adduction|adductor|copenhagen/, 'ad', ''],
  [/calf/, 'ca', ''],
  [/tibialis/, 'ti', ''],
  [/lateral lunge|cossack/, 'q gl ad', 'ham abd'],
  [/curtsy/, 'gl q', 'ad abd ham'],
  [/skater|shrimp|pistol/, 'q gl', 'ham ad abd ca'],
  [/lateral step up/, 'q gl', 'abd ham'],
  [/lunge|split squat|step[- ]?up|step down|bulgarian/, 'q gl', 'ham ad ca'],
  [/front squat|landmine squat|sandbag front/, 'q', 'gl ad ab lb'],
  [/overhead squat/, 'q gl', 'fd tr ab lb rc'],
  [/zercher/, 'q gl', 'ab lb ad bi'],
  [/goblet/, 'q gl', 'ad ab'],
  [/sumo squat/, 'q gl ad', 'ab'],
  [/hack|v-squat|leg press|belt squat|pendulum|smith.*squat/, 'q gl', 'ad ham'],
  [/squat/, 'q gl', 'ad lb ham ab'],
  [/sled drag|sled pull/, 'q', 'gl ca ti'],
  [/sled|prowler/, 'q gl', 'ca ham'],
  [/wall sit/, 'q', 'gl ca ad'],
  // --- core ---
  [/side plank/, 'ob', 'ab abd'],
  [/oblique|russian|woodchop|side bend|windmill|medicine ball twist|landmine twist|pallof/, 'ob', 'ab'],
  [/spiderman/, 'ab ob', 'hf fd'],
  [/plank shoulder tap|plank reach|plank hip tap/, 'ab ob', 'fd rc gl'],
  [/mountain climber/, 'ab hf', 'fd q ob tri'],
  [/bear crawl/, 'fd ab', 'q tri ob'],
  [/ab wheel|rollout/, 'ab', 'la fd hf tri'],
  [/hanging|captains chair|toes to bar|knee tuck/, 'ab hf', 'fa ob'],
  [/leg raise|knee raise|l-sit|v-up|jackknife|scissor|flutter|lying leg/, 'ab hf', 'ob'],
  [/reverse crunch|dead bug|hollow/, 'ab', 'hf ob'],
  [/bicycle/, 'ab ob', 'hf'],
  [/sit-up|situp/, 'ab', 'hf ob'],
  [/plank|crunch|climber/, 'ab', 'ob hf'],
  [/battle rope slam|medicine ball slam|slam/, 'la ab', 'fd tri q'],
  [/battle rope/, 'fd', 'ab la tr fa q'],
  [/tire flip/, 'q gl', 'lb tr fd fa'],
  [/burpee|jump/, 'q gl', 'fd ab ca'],
];
export function musclesFor(name) {
  const n = String(name || '').toLowerCase();
  for (const [re, p, s] of RULES) if (re.test(n)) return detail(n, m(p), m(s));
  return null;
}
/** Muscles for an exercise record: the user's own choice if they set one, otherwise the built-in guess. */
export function musclesOf(ex) {
  if (ex && ex.muscles && Array.isArray(ex.muscles.primary)) {
    const ok = (a) => [...new Set((Array.isArray(a) ? a : []).flatMap((x) => LEGACY[x] || [x]).filter((x) => MUSCLES.includes(x)))];
    return { primary: ok(ex.muscles.primary), secondary: ok(ex.muscles.secondary), custom: true };
  }
  const r = musclesFor(ex && ex.name);
  return r ? { ...r, custom: false } : { primary: [], secondary: [], custom: false };
}

// High-level groups for filtering. A group is decided by the first primary muscle.
export const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'];
const GROUP_OF = {
  'Upper Chest': 'Chest', 'Mid Chest': 'Chest', 'Lower Chest': 'Chest',
  'Front Delts': 'Shoulders', 'Side Delts': 'Shoulders', 'Rear Delts': 'Shoulders', 'Rotator Cuff': 'Shoulders',
  'Biceps Long Head': 'Arms', 'Biceps Short Head': 'Arms', Brachialis: 'Arms', 'Triceps Long Head': 'Arms', 'Triceps Lateral Head': 'Arms', 'Triceps Medial Head': 'Arms',
  'Wrist Flexors': 'Arms', 'Wrist Extensors': 'Arms', Brachioradialis: 'Arms',
  'Upper Traps': 'Back', Lats: 'Back', 'Mid Back': 'Back', 'Lower Back': 'Back',
  'Upper Abs': 'Core', 'Lower Abs': 'Core', Obliques: 'Core', 'Hip Flexors': 'Core',
  'Rectus Femoris': 'Legs', 'Vastus Lateralis': 'Legs', 'Vastus Medialis': 'Legs', 'Outer Hamstrings': 'Legs', 'Inner Hamstrings': 'Legs',
  Glutes: 'Legs', 'Glute Medius': 'Legs', Adductors: 'Legs', Gastrocnemius: 'Legs', Soleus: 'Legs', Tibialis: 'Legs',
};
export function groupFor(nameOrExercise) {
  const mm = typeof nameOrExercise === 'string' ? musclesFor(nameOrExercise) : musclesOf(nameOrExercise);
  return (mm && GROUP_OF[mm.primary[0]]) || 'Other';
}
/** The muscles of each group, in display order (for the muscle editor). */
export const MUSCLES_BY_GROUP = MUSCLE_GROUPS.map((g) => [g, MUSCLES.filter((x) => GROUP_OF[x] === g)]);
