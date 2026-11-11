// Theme preference is the one setting kept outside the encrypted store (it holds no personal data),
// so the lock screen can already use the right colours.
export function applyTheme(t = 'dark') {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('gymlog-theme', t); } catch { /* ignore */ }
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--hdr-bg').trim();
  if (bg) document.querySelector('meta[name=theme-color]')?.setAttribute('content', bg);
}
