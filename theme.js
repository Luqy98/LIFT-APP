// Theme preference is the one setting kept outside the encrypted store (it holds no personal data),
// so the lock screen can already use the right colours.
export function applyTheme(t = 'dark') {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('gymlog-theme', t); } catch { /* ignore */ }
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--hdr-bg').trim();
  if (bg) document.querySelector('meta[name=theme-color]')?.setAttribute('content', bg);
  syncSystemBars(t);
}

/** In the Android app, make the status/navigation bar icons readable on the current theme. */
export function syncSystemBars(t = document.documentElement.dataset.theme) {
  try {
    const SB = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.SystemBars;
    if (!SB?.setStyle) return;
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    SB.setStyle({ style: dark ? 'DARK' : 'LIGHT' }); // DARK = light icons for a dark background
  } catch { /* optional */ }
}
if (typeof matchMedia === 'function') matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => syncSystemBars());
