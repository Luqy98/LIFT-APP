// Which muscles each exercise trains: primary (main movers) and secondary (assisting). Matched on the exercise name, first rule wins.
// Muscle names are the ones the body map will use.
export const MUSCLES = [
  'Upper Chest', 'Chest', 'Lower Chest', 'Front Delts', 'Side Delts', 'Rear Delts', 'Rotator Cuff', 'Biceps', 'Triceps', 'Forearms',
  'Traps', 'Lats', 'Mid Back', 'Lower Back', 'Abs', 'Obliques', 'Hip Flexors', 'Quads', 'Hamstrings', 'Glutes', 'Adductors', 'Abductors', 'Calves', 'Tibialis',
];
const M = {
  uc: 'Upper Chest', c: 'Chest', lc: 'Lower Chest', fd: 'Front Delts', sd: 'Side Delts', rd: 'Rear Delts', rc: 'Rotator Cuff', bi: 'Biceps', tri: 'Triceps', fa: 'Forearms',
  tr: 'Traps', la: 'Lats', mb: 'Mid Back', lb: 'Lower Back', ab: 'Abs', ob: 'Obliques', hf: 'Hip Flexors', q: 'Quads', ham: 'Hamstrings', gl: 'Glutes',
  ad: 'Adductors', abd: 'Abductors', ca: 'Calves', ti: 'Tibialis',
};
const m = (s) => s.split(' ').filter(Boolean).map((k) => M[k]);

// [pattern, primary, secondary]
const RULES = [
  [/leg curl|hamstring curl|nordic|glute-ham|ghr/, 'ham', 'gl ca'],
  [/rear delt|reverse fly|reverse pec deck|pec deck \(reverse\)|bent-over reverse|prone w|face pull|w raise|incline reverse/, 'rd', 'mb tr rc'],
  [/snatch|^clean(?! and)|power clean|jerk|clean and press/, 'q gl tr', 'fd ham lb tri'],
  [/thruster/, 'q gl fd', 'tri ab'],
  [/chest fly high to low/, 'lc', 'c fd'],
  [/chest fly low to high/, 'uc', 'c fd'],
  [/^dips?$/, 'lc tri', 'c fd'],
  [/chest dip|dips \(chest\)/, 'lc tri', 'c fd'],
  [/wall sit/, 'q', 'gl ca'],
  [/medicine ball twist/, 'ob', 'ab'],
  // --- chest ---
  [/incline.*(fly|flye)|(fly|flye).*incline/, 'uc', 'c fd'],
  [/decline.*(fly|flye)|(fly|flye).*decline|cable fly \(high to low\)|crossover.*(high-low|high to low)/, 'lc', 'c fd'],
  [/cable fly \(low to high\)|crossover.*(low-high|low to high)/, 'uc', 'c fd'],
  [/chest fly|chest flye|cable fly|pec deck(?! \(rear| \(reverse)(?!.*rear)|crossover|standing cable fly|chest squeeze|fly \(machine\)/, 'c', 'fd'],
  [/incline.*(press|bench)|(press|bench).*incline/, 'uc', 'c fd tri'],
  [/decline.*(press|bench)|(press|bench).*decline/, 'lc', 'c tri fd'],
  [/close-grip bench|jm press|tate press|diamond push|close-grip push/, 'tri', 'c fd'],
  [/^dumbbell press$|^db press$|bench press|chest press|machine press|push-up|push up|pushup|squeeze press|svend|floor press|chest-press/, 'c', 'fd tri'],
  [/(^| )dips?( |$)|dip \(|triceps dip|bench dip/, 'tri', 'lc c fd'],
  // --- shoulders ---
  [/pike push|handstand push|z-press|seated dumbbell press|overhead press|shoulder press|military|arnold|push press|landmine (shoulder )?press|thruster/, 'fd', 'tri sd tr'],
  [/lateral raise|side raise|cuban/, 'sd', 'fd tr'],
  [/front raise|plate front/, 'fd', 'sd uc'],
  [/external rotation|internal rotation/, 'rc', 'rd'],
  [/upright row/, 'sd', 'tr bi'],
  [/shrug/, 'tr', 'fa'],
  // --- back ---
  [/pull-over|pullover|pull over|straight-arm pull|straight-arm cable|straight-arm push/, 'la', 'tri c'],
  [/pull-up|pullup|chin-up|chinup|pulldown|pull down|lat pull|lat row/, 'la', 'bi mb rd'],
  [/high pull|rack pull/, 'tr', 'mb lb gl'],
  [/inverted row|seal row|chest-supported|t-bar|meadows|pendlay|barbell row|dumbbell row|db row|one-arm.*row|single-arm.*row|cable row|seated.*row|machine row|smith.*row|landmine row|iso-lateral row|high.*row|low.*row|\brow\b/, 'mb la', 'rd bi'],
  [/good morning|back extension|hyperextension|reverse hyper|superman/, 'lb', 'gl ham'],
  // --- arms ---
  [/skull|triceps|tricep|pushdown|push down|kickback \(dumbbell\)|single-arm kickback|overhead extension|overhead triceps|extension \(neutral|jm|rope overhead/, 'tri', ''],
  [/reverse wrist|wrist curl|forearm roller|farmer|suitcase|carry|dead hang|plate pinch|waiter|yoke/, 'fa tr', 'ab ob'],
  [/hammer curl|crossbody|zottman|reverse curl|drag curl/, 'bi', 'fa'],
  [/curl/, 'bi', 'fa'],
  // --- legs ---
  [/leg extension|sissy/, 'q', ''],
  [/romanian|stiff-leg|rdl|single-leg romanian|b-stance romanian|kettlebell swing|hip hinge|pull-through|pull through/, 'ham', 'gl lb'],
  [/deadlift|trap bar/, 'gl ham lb', 'q tr fa'],
  [/hip thrust|glute bridge|frog pump|glute kickback|donkey kick|kickback \(cable\)|cable kickback|hip extension/, 'gl', 'ham'],
  [/fire hydrant|clamshell|hip abduction|abductor|cable abduction|lateral band/, 'abd', 'gl'],
  [/hip adduction|adduction|adductor|copenhagen/, 'ad', ''],
  [/calf|calves/, 'ca', 'ti'],
  [/tibialis/, 'ti', ''],
  [/curtsy|cossack|lunge|split squat|step[- ]?up|step down|bulgarian|skater|shrimp|pistol/, 'q gl', 'ham ad'],
  [/hack|v-squat|leg press|belt squat|pendulum|smith.*squat|squat/, 'q gl', 'ad lb'],
  [/sled|prowler/, 'q', 'gl ca'],
  // --- core ---
  [/oblique|russian|woodchop|side bend|windmill|side plank|suitcase deadlift|landmine twist|pallof/, 'ob', 'ab'],
  [/leg raise|knee raise|knee tuck|toes to bar|reverse crunch|l-sit|hanging|captains chair|v-up|jackknife|scissor|flutter|lying leg/, 'ab', 'hf'],
  [/plank|dead bug|hollow|bear crawl|mountain climber|ab wheel|rollout|crunch|sit-up|situp|bicycle|spiderman|climber/, 'ab', 'ob hf'],
  [/battle rope|slam|tire flip|burpee|jump/, 'ab', 'fd la q'],
];
export function musclesFor(name) {
  const n = String(name || '').toLowerCase();
  for (const [re, p, s] of RULES) if (re.test(n)) return { primary: m(p), secondary: m(s) };
  return null;
}
