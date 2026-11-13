// Small dependency-free SVG charts (no third-party code, so nothing can phone home).
// Colours come from CSS classes / variables so light and dark themes both work.

import { h, s } from './ui.js';
import { fmtDate } from './calc.js';

const W = 340, PAD = { l: 40, r: 14, t: 14, b: 26 };

function niceScale(min, max, count = 4, integer = false) {
  if (min === max) { const pad = Math.abs(min) * 0.05 || 1; min -= pad; max += pad; }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  let step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  if (integer) step = Math.max(1, Math.ceil(step));
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6));
  return { ticks, lo: ticks[0], hi: ticks[ticks.length - 1] };
}
const tickLabel = (v) => (Math.abs(v) >= 10000 ? `${+(v / 1000).toFixed(1)}k` : String(+v.toFixed(2)));

/**
 * points: [{ t: ms, y: number, title: 'value', detail: 'date · note' }] ascending by t.
 * Returns a card body: tooltip line + svg. Tap/drag anywhere to read a point.
 */
export function lineChart({ points, height = 190, unit = '', zeroBase = false, label = 'Chart', target = null, targetNote = '' }) {
  const H = height;
  const wrap = h('div', { class: 'chart' });
  const tip = h('div', { class: 'chart-tip' });
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': label });
  wrap.append(tip, svg);
  if (!points.length) { wrap.append(h('div', { class: 'chart-empty', text: 'No data in this range yet.' })); return wrap; }

  const ys = points.map((p) => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (target != null) { hi = Math.max(hi, target); lo = Math.min(lo, target); }
  if (zeroBase) lo = Math.min(0, lo);
  const { ticks, lo: y0, hi: y1 } = niceScale(lo, hi);
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const X = (t) => (t1 === t0 ? PAD.l + iw / 2 : PAD.l + ((t - t0) / (t1 - t0)) * iw);
  const Y = (v) => PAD.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;

  for (const tk of ticks) {
    svg.append(s('line', { class: 'grid', x1: PAD.l, x2: W - PAD.r, y1: Y(tk), y2: Y(tk) }));
    svg.append(s('text', { class: 'axis-text', x: PAD.l - 6, y: Y(tk) + 3.5, 'text-anchor': 'end' }, tickLabel(tk)));
  }
  svg.append(s('line', { class: 'baseline', x1: PAD.l, x2: W - PAD.r, y1: PAD.t + ih, y2: PAD.t + ih }));

  // x labels: first, middle, last (by time)
  const xl = points.length === 1 ? [points[0]] : [points[0], { t: (t0 + t1) / 2, mid: true }, points[points.length - 1]];
  xl.forEach((p, i) => {
    if (p.mid && points.length < 4) return;
    const anchor = i === 0 ? 'start' : i === xl.length - 1 ? 'end' : 'middle';
    svg.append(s('text', { class: 'axis-text', x: points.length === 1 ? X(p.t) : anchor === 'start' ? PAD.l : anchor === 'end' ? W - PAD.r : X(p.t), y: H - 7, 'text-anchor': points.length === 1 ? 'middle' : anchor }, fmtDate(new Date(p.t).toISOString())));
  });

  if (target != null) {
    const ty = Y(target);
    svg.append(s('line', { class: 'target-line', x1: PAD.l, x2: W - PAD.r, y1: ty, y2: ty }));
    svg.append(s('text', { class: 'target-label', x: PAD.l + 4, y: ty - 5 }, `Target ${+target.toFixed(1)}${unit}${targetNote}`));
  }
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  if (points.length > 1) {
    svg.append(s('path', { class: 'area', d: `${d} L${X(t1).toFixed(1)},${PAD.t + ih} L${X(t0).toFixed(1)},${PAD.t + ih} Z` }));
    svg.append(s('path', { class: 'line', d }));
  }
  const dense = points.length > 40;
  const bestIdx = ys.indexOf(Math.max(...ys));
  points.forEach((p, i) => {
    if (dense && i !== points.length - 1 && i !== bestIdx) return;
    svg.append(s('circle', { class: 'dot' + (i === points.length - 1 ? ' dot-last' : ''), cx: X(p.t), cy: Y(p.y), r: i === points.length - 1 ? 5 : dense ? 3 : 4 }));
  });

  // direct label on the latest value only
  const last = points[points.length - 1];
  const lx = X(last.t);
  const nearTop = Y(last.y) - 10 < PAD.t + 4; // no room above the point: put the label to its left instead
  svg.append(s('text', {
    class: 'value-label',
    x: nearTop ? lx - 9 : Math.min(lx, W - PAD.r - 2),
    y: nearTop ? Y(last.y) + 4 : Y(last.y) - 10,
    'text-anchor': nearTop || lx > W - 50 ? 'end' : 'middle',
  }, `${+last.y.toFixed(1)}${unit}`));

  const marker = s('line', { class: 'marker', y1: PAD.t, y2: PAD.t + ih, x1: 0, x2: 0, visibility: 'hidden' });
  const ring = s('circle', { class: 'dot-ring', r: 8, cx: 0, cy: 0, visibility: 'hidden' });
  svg.append(marker, ring);

  const show = (i) => {
    const p = points[i];
    tip.replaceChildren(h('b', { text: p.title }), h('span', { text: p.detail || '' }));
    marker.setAttribute('x1', X(p.t)); marker.setAttribute('x2', X(p.t)); marker.setAttribute('visibility', 'visible');
    ring.setAttribute('cx', X(p.t)); ring.setAttribute('cy', Y(p.y)); ring.setAttribute('visibility', 'visible');
  };
  const nearest = (clientX) => {
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    let bi = 0, bd = Infinity;
    points.forEach((p, i) => { const dd = Math.abs(X(p.t) - x); if (dd < bd) { bd = dd; bi = i; } });
    return bi;
  };
  let down = false;
  svg.addEventListener('pointerdown', (e) => { down = true; show(nearest(e.clientX)); });
  svg.addEventListener('pointermove', (e) => { if (down || e.pointerType === 'mouse') show(nearest(e.clientX)); });
  svg.addEventListener('pointerup', () => { down = false; });
  svg.addEventListener('pointerleave', () => { down = false; });
  show(points.length - 1);
  return wrap;
}

/** points: [{ label, y, title, detail }] in display order (oldest first). */
export function barChart({ points, height = 170, label = 'Chart', integer = false }) {
  const H = height;
  const wrap = h('div', { class: 'chart' });
  const tip = h('div', { class: 'chart-tip' });
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': label });
  wrap.append(tip, svg);
  if (!points.length) { wrap.append(h('div', { class: 'chart-empty', text: 'No data in this range yet.' })); return wrap; }

  const shown = points.slice(-40);
  const { ticks, hi: y1 } = niceScale(0, Math.max(...shown.map((p) => p.y), 1), 4, integer);
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const slot = iw / shown.length;
  const bw = Math.min(24, Math.max(3, slot - 2));
  const Y = (v) => PAD.t + ih - (v / (y1 || 1)) * ih;
  const base = PAD.t + ih;

  for (const tk of ticks) {
    svg.append(s('line', { class: 'grid', x1: PAD.l, x2: W - PAD.r, y1: Y(tk), y2: Y(tk) }));
    svg.append(s('text', { class: 'axis-text', x: PAD.l - 6, y: Y(tk) + 3.5, 'text-anchor': 'end' }, tickLabel(tk)));
  }
  svg.append(s('line', { class: 'baseline', x1: PAD.l, x2: W - PAD.r, y1: base, y2: base }));
  svg.append(s('text', { class: 'axis-text', x: PAD.l, y: H - 7, 'text-anchor': 'start' }, shown[0].label));
  if (shown.length > 1) svg.append(s('text', { class: 'axis-text', x: W - PAD.r, y: H - 7, 'text-anchor': 'end' }, shown[shown.length - 1].label));

  const bars = shown.map((p, i) => {
    const x = PAD.l + slot * i + (slot - bw) / 2;
    const y = Y(p.y);
    const r = Math.min(4, bw / 2, base - y);
    const top = (cls, y0, y1, round) => {
      const rr = round ? Math.min(4, bw / 2, y1 - y0) : 0;
      const el = s('path', { class: 'bar ' + cls, d: `M${x},${y1} L${x},${y0 + rr} Q${x},${y0} ${x + rr},${y0} L${x + bw - rr},${y0} Q${x + bw},${y0} ${x + bw},${y0 + rr} L${x + bw},${y1} Z` });
      svg.append(el);
      return el;
    };
    const d = Math.min(p.deload || 0, p.y);
    if (d <= 0) return [top('', y, base, true)];
    if (d >= p.y) return [top('bar-deload', y, base, true)];
    const ySplit = Y(p.y - d);
    // normal workouts at the bottom, the deload workout(s) stacked on top with a hairline gap
    return [top('', ySplit + 1, base, false), top('bar-deload', y, ySplit - 1, true)];
  });
  const show = (i) => {
    bars.forEach((grp, j) => grp.forEach((b) => b.classList.toggle('is-sel', i === j)));
    const p = shown[i];
    tip.replaceChildren(h('b', { text: p.title }), h('span', { text: p.detail || '' }));
  };
  const nearest = (clientX) => {
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(shown.length - 1, Math.floor((x - PAD.l) / slot)));
  };
  let down = false;
  svg.addEventListener('pointerdown', (e) => { down = true; show(nearest(e.clientX)); });
  svg.addEventListener('pointermove', (e) => { if (down || e.pointerType === 'mouse') show(nearest(e.clientX)); });
  svg.addEventListener('pointerup', () => { down = false; });
  svg.addEventListener('pointerleave', () => { down = false; });
  show(shown.length - 1);
  return wrap;
}

/** Accessible text alternative for a chart. rows: [[date, value], ...] */
export function dataTable(head, rows) {
  return h('details', { class: 'data-table' },
    h('summary', { text: 'View as table' }),
    h('table', {}, h('thead', {}, h('tr', {}, head.map((c) => h('th', { text: c })))),
      h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', { text: c })))))));
}
