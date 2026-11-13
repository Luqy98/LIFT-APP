// Offline app shell. Cache-first for the app's own files; never touches the network for anything else.
const CACHE = 'gymlog-v2.3.0';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'app.js', 'art.js', 'live.js', 'sound.js', 'calc.js', 'charts.js', 'backup.js', 'notes.js', 'crypto.js', 'db.js', 'nav.js', 'picker.js', 'store.js',
  'theme.js', 'theme-boot.js', 'ui.js', 'version.js', 'webauthn.js',
  'views-dash.js', 'views-calendar.js', 'views-targets.js', 'views-bulletin.js', 'views-lock.js', 'views-library.js', 'views-session.js', 'views-settings.js', 'views-workouts.js',
  'fonts/inter-400.woff', 'fonts/inter-500.woff', 'fonts/inter-600.woff', 'fonts/inter-700.woff', 'fonts/inter-display-600.woff', 'fonts/inter-display-700.woff',
  'img/mascot-light.png', 'img/mascot-dark.png',
  ...['back-squat','front-squat','deadlift','romanian-deadlift','barbell-row','bench-press','incline-bench-press','dumbbell-press','incline-dumbbell-press','overhead-press','chest-press-machine','pec-deck','chest-flyes-high-low','chest-flyes-low-high','chest-flyes-mid','chest-dip','jm-press-bench','jm-press-machine','skull-crusher','triceps-pushdown','pull-up','lat-pulldown','face-pull','seated-cable-row','dumbbell-curl','hammer-curl','lateral-raise','leg-press','leg-extension','leg-curl','calf-raise','hip-thrust'].flatMap((s) => [`img/ex-${s}.png`, `img/ex-${s}-eyes.png`]),
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit ||
      fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
