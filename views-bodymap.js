// Body map: which muscles your programme trains, on a front/back model. Tap a muscle (or a table row) for the sets, reps and exercises.
import { h, card, pickerField, sheet } from './ui.js';
import * as S from './store.js';
import * as nav from './nav.js';
import { parseNum, fmt } from './calc.js';
import { musclesOf, MUSCLES, MUSCLES_BY_GROUP, MUSCLE_HINTS } from './muscles.js';

// Painted regions of each view, in the order they are numbered in img/map/<view>-map.png (1, 2, 3, ...).
const REGIONS = {
  front: ['Upper Traps', 'Side Delts', 'Front Delts', 'Upper Chest', 'Mid Chest', 'Lower Chest', 'Obliques', 'Upper Abs', 'Lower Abs', 'Biceps Long Head', 'Biceps Short Head', 'Brachialis', 'Triceps Lateral Head', 'Brachioradialis', 'Flexor Carpi Radialis', 'Flexor Carpi Ulnaris', 'Palmaris Longus', 'Flexor Digitorum Superficialis', 'Hip Flexors', 'Vastus Lateralis', 'Rectus Femoris', 'Vastus Medialis', 'Adductors', 'Tibialis', 'Gastrocnemius'],
  back: ['Upper Traps', 'Mid Back', 'Rear Delts', 'Side Delts', 'Lats', 'Lower Back', 'Triceps Long Head', 'Triceps Lateral Head', 'Triceps Medial Head', 'Wrist Extensors', 'Brachioradialis', 'Glutes', 'Glute Medius', 'Adductors', 'Outer Hamstrings', 'Inner Hamstrings', 'Gastrocnemius Medial', 'Gastrocnemius Lateral', 'Soleus'],
};
// Painted areas that stand for a muscle with another name (the two calf heads are the same muscle).
const AREA = { 'Gastrocnemius Medial': ['Gastrocnemius'], 'Gastrocnemius Lateral': ['Gastrocnemius'] };
const musclesIn = (region) => AREA[region] || [region];
const PICK = [250, 204, 21];
// Every muscle has its own colour; how strong it is shows how much work it gets (primary sets count in full, secondary sets count half).
const HEX = {
  'Upper Chest': 'ff6b8a', 'Mid Chest': 'e8346b', 'Lower Chest': 'c2185b',
  'Front Delts': 'ff9f43', 'Side Delts': 'ffc83d', 'Rear Delts': 'ff7043',
  'Upper Traps': '8b6cff', 'Mid Back': '4f7cff', 'Lats': '29b6f6', 'Lower Back': '1fc8b4',
  'Biceps Long Head': '7bd957', 'Biceps Short Head': '3fbf6a', 'Brachialis': 'b2e05a', 'Brachioradialis': 'd4e157',
  'Triceps Lateral Head': 'b36bff', 'Triceps Long Head': '9a4fe8', 'Triceps Medial Head': 'd2a6ff',
  'Flexor Carpi Radialis': '26c6da', 'Flexor Carpi Ulnaris': '0aa5b5', 'Palmaris Longus': '57d9e6', 'Flexor Digitorum Superficialis': '8fe3ee', 'Wrist Extensors': '00b894',
  'Upper Abs': 'ffd166', 'Lower Abs': 'f4a261', 'Obliques': 'e76f51',
  'Hip Flexors': 'd36ae0', 'Adductors': 'ff6fb5',
  'Vastus Lateralis': '4361ee', 'Rectus Femoris': '4a90f0', 'Vastus Medialis': '4cc9f0',
  'Outer Hamstrings': '06c996', 'Inner Hamstrings': '1b8f9f', 'Glutes': 'ef476f', 'Glute Medius': 'ff8fa3',
  'Gastrocnemius': 'ffb300', 'Soleus': 'fb8500', 'Tibialis': '90caf9'
};
const rgbOf = (name) => { const hx = HEX[musclesIn(name)[0]] || HEX[name] || '8b6cff'; return [parseInt(hx.slice(0, 2), 16), parseInt(hx.slice(2, 4), 16), parseInt(hx.slice(4, 6), 16)]; };
const workOf = (x) => x.p.sets + 0.5 * x.s.sets;

const st = { routineId: 'all', weekId: 'all', view: 'front', mode: 'map', pick: null };
const maps = {};   // view -> { w, h, labels } (loaded once)

// ---- Numbers ----------------------------------------------------------------
const blank = () => ({ sets: 0, reps: 0, workouts: new Set(), ex: new Map() });
function compute(routineId, weekId) {
  const by = new Map(MUSCLES.map((m) => [m, { p: blank(), s: blank() }]));
  let weeks = 0;
  for (const r of S.data.routines) {
    if (routineId !== 'all' && r.id !== routineId) continue;
    for (const wk of r.weeks) {
      if (weekId !== 'all' && wk.id !== weekId) continue;
      weeks++;
      for (const w of wk.workouts) for (const it of w.items) {
        const ex = S.exerciseById(it.exerciseId);
        if (!ex) continue;
        const mu = musclesOf(ex);
        let sets = 0, reps = 0;
        for (const s of it.sets) { if (s.type === 'warmup') continue; sets++; if (s.type !== 'hold') reps += parseNum(s.reps) || 0; }
        if (!sets) continue;
        const put = (name, role) => {
          const b = by.get(name)?.[role];
          if (!b) return;
          b.sets += sets; b.reps += reps; b.workouts.add(w.id);
          const e = b.ex.get(ex.id) || { name: ex.name, sets: 0, reps: 0 };
          e.sets += sets; e.reps += reps; b.ex.set(ex.id, e);
        };
        mu.primary.forEach((m) => put(m, 'p'));
        mu.secondary.forEach((m) => put(m, 's'));
      }
    }
  }
  return { by, weeks };
}
/** Stats for one painted area: an exercise counts once even if it trains several of the area's muscles. */
function areaStats(by, region) {
  const list = musclesIn(region);
  if (list.length === 1) return by.get(list[0]);
  const out = { p: blank(), s: blank() };
  for (const role of ['p', 's']) {
    for (const m of list) {
      const src = by.get(m)[role];
      src.workouts.forEach((x) => out[role].workouts.add(x));
      for (const [id, e] of src.ex) {
        if (role === 's' && out.p.ex.has(id)) continue;
        const cur = out[role].ex.get(id);
        if (!cur) out[role].ex.set(id, { ...e }); else { cur.sets = Math.max(cur.sets, e.sets); cur.reps = Math.max(cur.reps, e.reps); }
      }
    }
    for (const e of out[role].ex.values()) { out[role].sets += e.sets; out[role].reps += e.reps; }
  }
  return out;
}

// ---- Detail sheet -----------------------------------------------------------
function roleBlock(label, b, weeks) {
  const kids = [h('h3', { class: 'bm-h', text: label })];
  if (!b.sets) { kids.push(h('p', { class: 'hint', text: `No ${label.toLowerCase()} work in this selection.` })); return h('div', { class: 'bm-role' }, ...kids); }
  const wo = b.workouts.size;
  kids.push(h('p', { class: 'bm-sum' }, h('strong', { text: `${b.sets} ${b.sets === 1 ? 'set' : 'sets'}` }), h('span', { text: ` · ${fmt(b.reps, 0)} reps · ${wo} ${wo === 1 ? 'workout' : 'workouts'}` })));
  kids.push(h('ul', { class: 'bm-ex' }, [...b.ex.values()].sort((a, c) => c.sets - a.sets || a.name.localeCompare(c.name)).map((e) =>
    h('li', {}, h('span', { text: e.name }), h('span', { class: 'bm-n', text: `${e.sets} ${e.sets === 1 ? 'set' : 'sets'} · ${fmt(e.reps, 0)} reps` })))));
  return h('div', { class: 'bm-role' }, ...kids);
}
function showDetail(title, s, weeks, note) {
  sheet(h('div', { class: 'bm-detail' },
    note ? h('p', { class: 'sheet-msg', text: note }) : null,
    roleBlock('Primary', s.p, weeks), roleBlock('Secondary', s.s, weeks)), { title });
}

// ---- Map --------------------------------------------------------------------
function loadMap(view) {
  if (maps[view]) return maps[view];
  maps[view] = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const labels = new Uint8Array(c.width * c.height);
      for (let i = 0; i < labels.length; i++) labels[i] = d[i * 4];
      resolve({ w: c.width, h: c.height, labels });
    };
    img.onerror = reject;
    img.src = `img/map/${view}-map.png`;
  });
  return maps[view];
}

const lumas = {};   // "view-theme" -> Uint8Array of the model's brightness, so muscle shading still shows through the colour
function loadLuma(view, dark) {
  const key = view + (dark ? 'w' : 'b');
  if (lumas[key]) return lumas[key];
  lumas[key] = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const out = new Uint8Array(c.width * c.height);
      for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
      resolve(out);
    };
    img.onerror = () => resolve(null);
    img.src = `img/map/${view}-${dark ? 'white' : 'black'}.webp`;
  });
  return lumas[key];
}

function paint(canvas, map, view, by, pick, luma, dark) {
  if (canvas.width !== map.w) { canvas.width = map.w; canvas.height = map.h; }
  const g = canvas.getContext('2d');
  const names = REGIONS[view];
  const stats = names.map((n) => areaStats(by, n));
  let top = 0;
  for (const m of by.values()) top = Math.max(top, workOf(m));
  const col = new Uint8ClampedArray((names.length + 1) * 4);
  stats.forEach((x, i) => {
    const w = workOf(x);
    if (!w) return;
    col.set([...rgbOf(names[i]), Math.round(255 * (0.32 + 0.63 * Math.min(1, w / (top || 1))))], (i + 1) * 4);
  });
  const pickIdx = pick ? names.indexOf(pick) + 1 : 0;
  const { w, h: hh, labels } = map;
  const img = g.createImageData(w, hh); const d = img.data;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, l = labels[i];
    if (!l) continue;
    const o = l * 4;
    if (pickIdx && l === pickIdx) {
      const edge = labels[i - 3] !== l || labels[i + 3] !== l || labels[i - 3 * w] !== l || labels[i + 3 * w] !== l;
      if (edge) { d.set([...PICK, 255], i * 4); continue; }
    }
    if (col[o + 3]) {
      const v = luma ? luma[i] / 255 : 0.6;
      const k = dark ? 0.55 + 0.75 * v : 0.8 + 1.6 * v;   // keep the muscle shading visible under the colour
      d[i * 4] = Math.min(255, col[o] * k); d[i * 4 + 1] = Math.min(255, col[o + 1] * k); d[i * 4 + 2] = Math.min(255, col[o + 2] * k); d[i * 4 + 3] = col[o + 3];
    }
  }
  g.putImageData(img, 0, 0);
}

function mapPanel(by, weeks) {
  const dark = document.documentElement.dataset.theme !== 'light';
  const base = h('img', { class: 'bm-base', alt: '', draggable: 'false' });
  const canvas = h('canvas', { class: 'bm-hl', role: 'img', 'aria-label': 'Muscle map. Tap a muscle for its sets and exercises, or use the table view.' });
  const fig = h('div', { class: 'bm-fig' }, base, canvas);
  const stage = h('div', { class: 'bm-stage' }, fig);
  const status = h('p', { class: 'hint bm-status', 'aria-live': 'polite' });
  let busy = false;
  const show = async (view) => {
    base.src = `img/map/${view}-${dark ? 'white' : 'black'}.webp`;
    try { await base.decode(); } catch (e) { /* shown as soon as it loads */ }
    const map = await loadMap(view);
    const luma = await loadLuma(view, dark);
    paint(canvas, map, view, by, st.pick && REGIONS[view].includes(st.pick) ? st.pick : null, luma, dark);
    const missing = MUSCLES.filter((m) => (by.get(m).p.sets || by.get(m).s.sets) && !REGIONS.front.concat(REGIONS.back).some((r) => musclesIn(r).includes(m)));
    status.textContent = '';
  };
  // The model turns like a turntable: the current side swings away into soft focus while the other swings in and settles.
  const turn = async (view) => {
    if (busy || view === st.view) return;
    busy = true; st.view = view; st.pick = null;
    segBtns.forEach((b, i) => { const on = ['front', 'back'][i] === view; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
    const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dir = view === 'back' ? 1 : -1;
    let ghost = null;
    if (!calm && fig.animate) {
      ghost = h('div', { class: 'bm-fig bm-ghost' }, base.cloneNode(false));
      const gc = h('canvas', { class: 'bm-hl' }); gc.width = canvas.width; gc.height = canvas.height; gc.getContext('2d').drawImage(canvas, 0, 0);
      ghost.append(gc); stage.append(ghost);
      ghost.animate([
        { transform: 'translateX(0) rotateY(0deg) scale(1)', opacity: 1, filter: 'blur(0px)' },
        { transform: `translateX(${-dir * 16}%) rotateY(${dir * 34}deg) scale(0.92)`, opacity: 0, filter: 'blur(7px)' }],
      { duration: 420, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' }).onfinish = () => ghost.remove();
    }
    await show(view);
    if (!calm && fig.animate) {
      fig.animate([
        { transform: `translateX(${dir * 16}%) rotateY(${-dir * 34}deg) scale(0.92)`, opacity: 0, filter: 'blur(7px)' },
        { transform: 'translateX(0) rotateY(0deg) scale(1)', opacity: 1, filter: 'blur(0px)' }],
      { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }
    setTimeout(() => { busy = false; }, calm ? 0 : 420);
  };
  const segBtns = ['front', 'back'].map((v) => h('button', { type: 'button', class: 'bm-side-btn' + (st.view === v ? ' is-on' : ''), 'aria-pressed': String(st.view === v), text: v === 'front' ? 'Front' : 'Back', onclick: () => turn(v) }));

  let down = null;
  stage.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  stage.addEventListener('pointerup', async (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y; down = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { turn(st.view === 'front' ? 'back' : 'front'); return; }
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return;
    const map = await loadMap(st.view);
    const r = canvas.getBoundingClientRect();
    const px = Math.floor((e.clientX - r.left) / r.width * map.w), py = Math.floor((e.clientY - r.top) / r.height * map.h);
    const l = map.labels[py * map.w + px];
    const luma = await loadLuma(st.view, dark);
    if (!l) { st.pick = null; paint(canvas, map, st.view, by, null, luma, dark); return; }
    const region = REGIONS[st.view][l - 1];
    st.pick = region; paint(canvas, map, st.view, by, region, luma, dark);
    const note = musclesIn(region).length > 1 ? `Covers: ${musclesIn(region).join(', ')}` : MUSCLE_HINTS[region] || '';
    showDetail(musclesIn(region)[0], areaStats(by, region), weeks, note);
  });
  show(st.view);
  return h('div', { class: 'bm-wrap' },
    h('div', { class: 'bm-side', role: 'group', 'aria-label': 'Side' }, ...segBtns),
    stage, status,
    h('div', { class: 'bm-legend' },
      h('span', { class: 'bm-ramp' }), h('span', { text: 'More work = stronger colour' })));
}

// ---- Table ------------------------------------------------------------------
function tablePanel(by, weeks) {
  const rows = [];
  for (const [group, list] of MUSCLES_BY_GROUP) {
    rows.push(h('tr', { class: 'bm-grp' }, h('th', { colspan: '5', text: group })));
    for (const m of list) {
      const x = by.get(m);
      const dim = !x.p.sets && !x.s.sets;
      rows.push(h('tr', { class: 'bm-row' + (dim ? ' is-dim' : ''), tabindex: '0', role: 'button', 'aria-label': `${m}, details`,
        onclick: () => showDetail(m, x, weeks, MUSCLE_HINTS[m] || ''),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetail(m, x, weeks, MUSCLE_HINTS[m] || ''); } } },
      h('td', { text: m }),
      h('td', { class: 'bm-c', text: x.p.sets ? String(x.p.sets) : '–' }), h('td', { class: 'bm-c', text: x.p.sets ? fmt(x.p.reps, 0) : '–' }),
      h('td', { class: 'bm-c', text: x.s.sets ? String(x.s.sets) : '–' }), h('td', { class: 'bm-c', text: x.s.sets ? fmt(x.s.reps, 0) : '–' })));
    }
  }
  return h('div', { class: 'bm-table-wrap' }, h('table', { class: 'tbl bm-table' },
    h('thead', {},
      h('tr', {}, h('th', { rowspan: '2', text: 'Muscle' }), h('th', { class: 'bm-c bm-span', colspan: '2', text: 'Primary' }), h('th', { class: 'bm-c bm-span', colspan: '2', text: 'Secondary' })),
      h('tr', {}, ['Sets', 'Reps', 'Sets', 'Reps'].map((t) => h('th', { class: 'bm-c', text: t })))),
    h('tbody', {}, rows)));
}

export function bodyMapView() {
  const routines = S.data.routines;
  if (st.routineId !== 'all' && !routines.some((r) => r.id === st.routineId)) { st.routineId = 'all'; st.weekId = 'all'; }
  const routine = routines.find((r) => r.id === st.routineId);
  if (st.weekId !== 'all' && !(routine && routine.weeks.some((w) => w.id === st.weekId))) st.weekId = 'all';
  const { by, weeks } = compute(st.routineId, st.weekId);
  const any = [...by.values()].some((x) => x.p.sets || x.s.sets);

  const controls = h('div', { class: 'controls' },
    pickerField('Programme', [['all', 'All programmes'], ...routines.map((r) => [r.id, r.name])], st.routineId, (v) => { st.routineId = v; st.weekId = 'all'; st.pick = null; nav.refresh(); }),
    routine ? pickerField('Week', [['all', 'All weeks'], ...routine.weeks.map((w) => [w.id, w.name])], st.weekId, (v) => { st.weekId = v; st.pick = null; nav.refresh(); }) : null,
    h('div', { class: 'seg', role: 'group', 'aria-label': 'View' }, [['map', 'Map'], ['table', 'Table']].map(([id, label]) =>
      h('button', { type: 'button', class: 'seg-btn' + (st.mode === id ? ' is-on' : ''), 'aria-pressed': String(st.mode === id), text: label, onclick: () => { st.mode = id; nav.refresh(); } }))));
  const scope = `${routine ? routine.name : 'All programmes'} · ${st.weekId === 'all' ? 'all weeks' : routine.weeks.find((w) => w.id === st.weekId).name}`;
  const content = h('div', { class: 'page' }, controls,
    h('p', { class: 'card-note', text: any ? `Planned sets in ${scope}. Warm-up sets aren’t counted.` : `Nothing planned in ${scope} yet.` }),
    any ? (st.mode === 'map' ? mapPanel(by, weeks) : tablePanel(by, weeks))
      : card('No muscles to show', h('p', { class: 'hint', text: 'Add exercises to a programme’s workouts and the muscles they train show up here.' })));
  return { title: 'Body Map', content };
}
