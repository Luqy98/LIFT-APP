// Exercise pictograms and group inference. Drawn with currentColor, so they are white on the dark theme
// and black on the light theme. Everything is vector and local: no images are downloaded.
import { h, s } from './ui.js';

const L = (x1, y1, x2, y2) => ['line', { x1, y1, x2, y2 }];
const P = (d) => ['path', { d }];
const C = (cx, cy, r = 3.4) => ['circle', { cx, cy, r, class: 'f' }];
const O = (cx, cy, r) => ['circle', { cx, cy, r }];
const R = (x, y, w, h) => ['rect', { x, y, width: w, height: h, rx: 1.2, class: 'f' }];
// barbell seen from the front: bar plus a plate at each end
const bar = (x1, x2, y) => [L(x1, y, x2, y), R(x1 - 2.6, y - 6, 3, 12), R(x2 - 0.4, y - 6, 3, 12)];

const GLYPHS = {
  bench: [L(5, 32, 37, 32), L(9, 32, 9, 42), L(33, 32, 33, 42), C(9, 26.5, 3), L(13, 28, 30, 28), P('M30 28l7 5v9'), L(20, 28, 20, 15), O(20, 10, 5.5), O(20, 10, 1.2)],
  incline: [L(7, 43, 22, 28), L(24, 29, 38, 29), L(12, 43, 12, 36), L(36, 29, 36, 43), C(18, 15.5, 3), L(20.5, 19, 28, 28), P('M28 28l8 2v13'), L(22, 21, 24, 11), O(24, 8, 5), O(24, 8, 1.2)],
  squat: [C(24, 8), ...bar(9, 39, 15), L(24, 15, 20, 27), P('M20 27l11 3-3 12'), L(20, 27, 15, 42)],
  deadlift: [C(22, 6.5, 3), L(22, 11, 22, 27), L(22, 27, 20, 43), L(22, 27, 25, 43), L(22, 13, 27, 29), O(27, 33, 7), O(27, 33, 1.4), L(8, 43, 42, 43)],
  ohp: [C(24, 13), L(24, 18, 24, 33), P('M24 20l-7-4V8'), P('M24 20l7-4V8'), L(24, 33, 19, 43), L(24, 33, 29, 43), ...bar(10, 38, 5)],
  row: [C(9, 18, 3), L(12, 21, 29, 27), L(29, 27, 31, 43), L(16, 23, 19, 35), O(19, 37, 5.5), O(19, 37, 1.2), L(6, 43, 42, 43)],
  pullup: [L(7, 5, 41, 5), L(14, 5, 20, 22), L(34, 5, 28, 22), C(24, 13, 3), L(24, 19, 24, 33), P('M24 33l-4 10'), P('M24 33l4 10')],
  pulldown: [L(24, 2, 24, 8), L(10, 8, 38, 8), L(10, 8, 20, 24), L(38, 8, 28, 24), C(24, 15, 3), L(24, 20, 24, 35), L(15, 36, 33, 36), P('M24 35h10v8')],
  curl: [C(18, 8), L(18, 13, 18, 30), L(18, 30, 15, 43), L(18, 30, 22, 43), P('M18 15l7 8 6-9'), L(28, 9, 34, 15), R(28, 11, 9, 4)],
  tricep: [L(30, 2, 30, 9), C(20, 11), L(20, 16, 20, 32), L(20, 32, 16, 43), L(20, 32, 25, 43), P('M20 18l5 8 6-1'), L(26, 9, 36, 9), L(30, 9, 30, 25)],
  lunge: [C(22, 8), L(22, 13, 22, 28), L(22, 28, 33, 30), L(33, 30, 33, 43), L(22, 28, 12, 36), L(12, 36, 8, 43), L(15, 15, 29, 15)],
  legpress: [L(6, 38, 22, 38), C(9, 17, 3), L(11, 20, 14, 33), L(14, 33, 28, 31), L(28, 31, 37, 18), L(32, 12, 43, 23), L(5, 43, 43, 43)],
  hipthrust: [C(10, 22), L(13, 25, 28, 30), P('M28 30l6 -4 4 16'), L(8, 28, 8, 43), L(4, 28, 14, 28), R(20, 24, 10, 3)],
  calf: [C(24, 7), L(24, 12, 24, 30), P('M24 14l-7 8'), P('M24 14l7 8'), L(24, 30, 21, 40), L(24, 30, 27, 40), L(18, 40, 30, 40), L(18, 44, 30, 44)],
  core: [C(9, 27), L(12, 29, 35, 33), L(35, 33, 40, 43), L(14, 30, 14, 43), L(4, 43, 44, 43)],
  dip: [L(8, 22, 18, 22), L(30, 22, 40, 22), L(8, 22, 8, 43), L(40, 22, 40, 43), C(24, 9), L(24, 14, 24, 30), P('M24 16l-6 6'), P('M24 16l6 6'), L(24, 30, 21, 40), L(24, 30, 27, 40)],
  fly: [C(24, 10), L(24, 15, 24, 31), L(24, 31, 20, 43), L(24, 31, 28, 43), L(24, 18, 8, 18), L(24, 18, 40, 18), R(4, 15, 5, 6), R(39, 15, 5, 6)],
  dumbbell: [L(14, 24, 34, 24), R(8, 14, 5, 20), R(35, 14, 5, 20), L(5, 19, 5, 29), L(43, 19, 43, 29)],
};

// First matching rule wins. [pattern, glyph, group]
const RULES = [
  [/incline.*(press|bench|fly)|(press|bench).*incline/, 'incline', 'Push'],
  [/bench|chest press|push[- ]?up|press ?up/, 'bench', 'Push'],
  [/dip\b|dips/, 'dip', 'Push'],
  [/fly|flye|pec ?deck|cable cross/, 'fly', 'Push'],
  [/lateral raise|side raise|front raise/, 'fly', 'Push'],
  [/overhead|shoulder press|military|ohp|arnold|push press/, 'ohp', 'Push'],
  [/skull|tricep|triceps|pushdown|push down|extension.*(overhead|cable)|kickback/, 'tricep', 'Push'],
  [/pull[- ]?up|chin[- ]?up/, 'pullup', 'Pull'],
  [/pulldown|pull down|lat /, 'pulldown', 'Pull'],
  [/face pull|rear delt|reverse fly/, 'pulldown', 'Pull'],
  [/row|shrug/, 'row', 'Pull'],
  [/curl\b(?!.*leg)|bicep|biceps|hammer/, 'curl', 'Pull'],
  [/leg curl|hamstring curl|leg extension|quad extension/, 'legpress', 'Legs'],
  [/romanian|rdl|stiff|deadlift|good ?morning|rack pull/, 'deadlift', 'Pull'],
  [/squat|hack|front squat|goblet|split squat|bulgarian/, 'squat', 'Legs'],
  [/lunge|step[- ]?up/, 'lunge', 'Legs'],
  [/leg press/, 'legpress', 'Legs'],
  [/hip thrust|glute bridge|bridge|glute/, 'hipthrust', 'Legs'],
  [/calf|calves/, 'calf', 'Legs'],
  [/plank|crunch|sit[- ]?up|\babs?\b|core|leg raise|hanging|russian|wheel|dead bug/, 'core', 'Core'],
  [/press/, 'bench', 'Push'],
];

export function exerciseKind(name) {
  const n = String(name || '').toLowerCase();
  for (const [re, glyph, group] of RULES) if (re.test(n)) return { glyph, group };
  return { glyph: 'dumbbell', group: 'Other' };
}
const flat = (a) => a.flatMap((x) => (Array.isArray(x[0]) ? flat(x) : [x]));
export const GROUPS = ['Push', 'Pull', 'Legs', 'Core'];

// Mascot illustrations: one white-body mask plus an optional eyes mask per icon (img/ex/<slug>.webp, <slug>-e.webp), drawn as
// theme-following masks (white/black body, black/red eyes). Names are matched loosely; anything else keeps its pictogram.
import { iconFor, imageSlug } from './icon-match.js';
export { iconFor, imageSlug };

/** Pictogram (or mascot illustration) for an exercise. */
export function exerciseArt(name, size = 44) {
  const ic = iconFor(name);
  if (ic) {
    const el = h('span', { class: ic.eyes ? 'art-img' : 'art-img noeye', 'aria-hidden': 'true' });
    el.style.setProperty('--m', `url(img/ex/${ic.slug}.webp)`);
    if (ic.eyes) el.style.setProperty('--e', `url(img/ex/${ic.slug}-e.webp)`);
    return el;
  }
  const { glyph } = exerciseKind(name);
  const svg = s('svg', { class: 'art-svg', viewBox: '0 0 48 48', width: size, height: size, 'aria-hidden': 'true' });
  for (const [tag, attrs] of flat(GLYPHS[glyph])) svg.append(s(tag, attrs));
  return svg;
}

/** Barbell sleeve with a loaded rubber plate, drawn with shading so it reads as an object rather than an icon. */
export function plateArt() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = s('svg', { class: 'plate-svg', viewBox: '0 0 240 170', 'aria-hidden': 'true' });
  const stop = (o, c, op) => s('stop', { offset: o, 'stop-color': c, ...(op != null ? { 'stop-opacity': op } : {}) });
  const grad = (tag, id, attrs, stops) => { const g = s(tag, { id, ...attrs }); stops.forEach((x) => g.append(stop(...x))); return g; };
  const defs = s('defs', {});
  defs.append(
    grad('linearGradient', 'pl-steel', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, '#5b5b66'], [0.28, '#e4e4ec'], [0.5, '#9a9aa6'], [1, '#3a3a44']]),
    grad('radialGradient', 'pl-face', { cx: '38%', cy: '34%', r: '75%' }, [[0, '#4a4a56'], [0.55, '#25252d'], [1, '#101014']]),
    grad('linearGradient', 'pl-edge', { x1: 0, y1: 0, x2: 1, y2: 0 }, [[0, '#0b0b0e'], [0.5, '#2c2c34'], [1, '#08080a']]),
    grad('radialGradient', 'pl-hub', { cx: '38%', cy: '34%', r: '80%' }, [[0, '#d9d9e2'], [1, '#55555f']]),
    grad('radialGradient', 'pl-glow', { cx: '50%', cy: '50%', r: '50%' }, [[0, '#8b5cf6', 0.45], [1, '#8b5cf6', 0]]));
  svg.append(defs);
  const add = (tag, attrs) => svg.append(s(tag, attrs));
  add('ellipse', { cx: 150, cy: 88, rx: 86, ry: 78, fill: 'url(#pl-glow)' });
  // sleeve and collar
  add('rect', { x: 0, y: 77, width: 118, height: 19, rx: 4, fill: 'url(#pl-steel)' });
  for (let x = 14; x < 62; x += 4) add('line', { x1: x, y1: 79, x2: x, y2: 94, stroke: '#2a2a32', 'stroke-opacity': 0.45, 'stroke-width': 1 });
  add('rect', { x: 100, y: 68, width: 16, height: 37, rx: 4, fill: 'url(#pl-steel)' });
  // back plate peeking out
  add('ellipse', { cx: 146, cy: 87, rx: 32, ry: 60, fill: 'url(#pl-edge)' });
  add('ellipse', { cx: 140, cy: 87, rx: 32, ry: 60, fill: '#17171c', stroke: '#4a4a56', 'stroke-width': 1.5 });
  // main plate: thickness, then face
  add('ellipse', { cx: 188, cy: 87, rx: 44, ry: 78, fill: 'url(#pl-edge)' });
  add('rect', { x: 164, y: 9, width: 24, height: 156, fill: 'url(#pl-edge)' });
  add('ellipse', { cx: 164, cy: 87, rx: 44, ry: 78, fill: 'url(#pl-face)', stroke: '#7a7a88', 'stroke-width': 2 });
  add('ellipse', { cx: 164, cy: 87, rx: 35, ry: 62, fill: 'none', stroke: '#5a5a67', 'stroke-width': 1.6 });
  add('ellipse', { cx: 164, cy: 87, rx: 24, ry: 42, fill: 'none', stroke: '#3c3c46', 'stroke-width': 1.4 });
  add('path', { d: 'M138 40 A44 78 0 0 1 176 11', fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.4, 'stroke-width': 2.4, 'stroke-linecap': 'round' });
  add('path', { d: 'M129 62 A44 78 0 0 1 134 46', fill: 'none', stroke: '#ffffff', 'stroke-opacity': 0.25, 'stroke-width': 2, 'stroke-linecap': 'round' });
  add('ellipse', { cx: 164, cy: 87, rx: 13, ry: 22, fill: 'url(#pl-hub)', stroke: '#2a2a32', 'stroke-width': 1.5 });
  add('ellipse', { cx: 164, cy: 87, rx: 5.5, ry: 10, fill: '#07070a' });
  void NS;
  return svg;
}

/** Mascot for the dashboard: the white one on the light theme, the charcoal one on the dark theme (CSS picks which). */
export function mascotArt() {
  const wrap = h('span', { class: 'mascot' });
  for (const [mode, label] of [['light', 'Muscular white mascot with crossed arms'], ['dark', 'Muscular charcoal mascot with crossed arms']]) {
    const img = document.createElement('img');
    img.className = 'mascot-img mascot-' + mode;
    img.src = `img/mascot-${mode}.png`;
    img.alt = '';
    img.width = 240; img.height = 330;
    img.decoding = 'async';
    img.setAttribute('aria-hidden', 'true');
    wrap.append(img);
  }
  return wrap;
}
