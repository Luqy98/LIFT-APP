// Boxing-bell sound, synthesised with WebAudio (no audio files, works offline).
// The bell is scheduled on the audio clock ahead of time, so it still rings if the page's timers are throttled.
let ctx = null;

function context() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch { ctx = null; }
  return ctx;
}

/** Call from any tap so the browser allows sound later. */
export function unlockAudio() {
  const c = context();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}
for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlockAudio, { passive: true });

// Inharmonic partials give the metallic "ding" of a ring bell.
const PARTIALS = [[1, 1], [2.01, 0.55], [2.76, 0.45], [5.4, 0.22], [8.93, 0.12]];

function strike(c, out, when, base) {
  const nodes = [];
  for (const [mult, amp] of PARTIALS) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = base * mult;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(amp, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.5 / Math.sqrt(mult));
    o.connect(g); g.connect(out);
    o.start(when); o.stop(when + 1.7);
    nodes.push(o);
  }
  return nodes;
}

/**
 * Schedule the round-start bell `delayMs` from now (0 = now). Returns { cancel() } or null if audio isn't available.
 * Three quick strikes, like the bell that opens a round.
 */
export function scheduleBell(delayMs = 0) {
  const c = context();
  if (!c) return null;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const master = c.createGain();
  master.gain.value = 0.32;
  master.connect(c.destination);
  const t0 = c.currentTime + Math.max(0, delayMs) / 1000;
  const all = [];
  [0, 0.3, 0.6].forEach((dt) => all.push(...strike(c, master, t0 + dt, 880)));
  return {
    cancel() {
      for (const o of all) { try { o.stop(); } catch { /* already stopped */ } }
      try { master.disconnect(); } catch { /* ignore */ }
    },
  };
}

/** Vibrate in the same rhythm as the bell: three pulses. Uses the app's native haptics when available. */
export function buzz() {
  try {
    const H = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.Haptics;
    if (H?.vibrate) {
      H.vibrate({ duration: 300 });
      setTimeout(() => H.vibrate({ duration: 300 }), 600);
      setTimeout(() => H.vibrate({ duration: 300 }), 1200);
      return;
    }
    navigator.vibrate?.([300, 300, 300, 300, 300]);
  } catch { /* vibration is optional */ }
}
