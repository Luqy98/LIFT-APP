# Gym Log

A private workout planner and logbook for your phone. It is an installable web app (PWA): it runs full-screen on Android, works offline, and keeps everything encrypted on the phone. It makes **no network requests** and contains **no third-party code**.

## What it does

- **Plan:** Programme → Weeks → Workouts → Exercises → Sets. Rename, reorder, duplicate or delete at every level. Copy a week to start the next one. Each set has a type (Normal, Warm-up, 1RM, AMRAP, Drop, Failure, Back-off), target reps and optional target kg.
- **Log:** start a workout, tick sets off (empty boxes fill from your target or last time), rest timer, finish. Finished workouts are saved to history and can be amended any time.
- **Previous values:** the same workout in the next week shows last time's weights and reps beside each set.
- **History locked to the workout:** tap *History* on an exercise to see only that workout's sessions (history from your other workouts is never mixed in). A toggle widens it to all workouts.
- **Dashboard:** workouts per week (weeks start Monday), then per exercise: estimated 1RM trend, heaviest set, rep records, optionally filtered to one workout.
- **Colours:** every workout has its own colour (change it from the workout's ⋮ menu); it follows the workout through every week, history and the dashboard.
- **Notes (optional, per exercise):** from an exercise's ⋮ menu choose *Add note*, then *Lifting cues* and/or *General note*, in the plan or while logging. Nothing shows until you add one. Plan notes carry into each log and into copied weeks; notes you add while logging stay with that log.
- **Exercise library**, dark/light theme, encrypted backup and restore.

## Security model

- Your PIN/passcode runs through PBKDF2-SHA256 (600,000 iterations) to unwrap a random 256-bit key. Every record is encrypted with AES-256-GCM. A wrong code simply fails to decrypt; no PIN hash is stored.
- The key exists only in memory and is dropped when the app locks. The screen is covered in the app switcher, and the app locks when you leave it for the time you choose (Settings → Security).
- 5 wrong attempts triggers escalating lockouts (30 s up to 1 h).
- A strict Content-Security-Policy blocks all outside connections, so even a bug couldn't send data anywhere.
- **PIN length is your choice (4+ digits, or a passcode of 8+ characters).** A 4-digit PIN stops anyone using your phone, but it has only 10,000 combinations, so someone who could copy the phone's raw app storage could try them all offline. A longer PIN or passcode is much stronger.
- **Fingerprint (optional, Settings → Security).** Uses the phone's secure hardware (WebAuthn with the PRF extension) to release a second key that opens the same data. It needs Android Chrome and your phone's provider to support that feature; support varies and can only be confirmed on your phone. If it isn't supported, turning it on shows a message and nothing changes. There is no weaker fallback, and your PIN always keeps working.
- **There is no reset.** Forget the PIN and the data is unrecoverable. Use *Settings → Export encrypted backup* regularly and keep the file somewhere safe (it has its own passphrase).
- Data lives in this browser's storage for this web address. **Clearing Chrome's "Cookies and site data" deletes it** (Google's help page lists indexed databases among what that option removes; clearing only browsing history or cached files does not). Hosting the app at a different address later also starts you empty.
- **Backups are the safety net.** Settings → *Back up now* makes an encrypted file and opens the phone's share sheet (Google Drive, email…), or downloads it. The Dashboard reminds you when workouts aren't backed up. On a fresh or wiped install, the first screen has *Restore from a backup*. Back up before you clear Chrome's data.

## Put it on your phone (about 5 minutes)

Chrome only installs web apps over HTTPS, so the app files need a web address. They contain no personal data (your data never leaves the phone), so ordinary free hosting is fine. Pick one:

**Netlify Drop (easiest):** go to app.netlify.com/drop, drag the `gym-app` folder onto the page, and note the address it gives you. The included `_headers` file switches on the extra security headers. Optionally rename the site to something unguessable.

**Cloudflare Pages:** create a project → "Direct upload" → upload the folder. `_headers` is honoured too.

**GitHub Pages:** push the folder to a repo and enable Pages. (GitHub Pages ignores `_headers`, but the page's own CSP still applies.)

Then, on your Android phone:

1. Open the address in Chrome.
2. Choose a PIN and create your vault.
3. Chrome menu (⋮) → **Install app**. Open it from your home screen.

Pick your address once and keep it. Updating later just means uploading the changed files to the same site.

## Estimated 1RM

Default is a blend of Epley, Brzycki and Lombardi, using the best eligible set of each session. Sets up to 10 reps count (changeable); warm-ups and drop sets never do; a single counts as itself. No formula is best for everyone, and all lose accuracy as reps climb and when a set stops short of failure, so treat the line as a *trend*. You can switch formula and rep limit in Settings → Training.

## Tests

```
node tests/logic.test.mjs   # crypto, fingerprint key slot, e1RM maths, data model, history locking, backup/restore (Node 20+)
node tests/e2e.mjs          # drives the real app in headless Chrome at phone size (needs Google Chrome)
```

## Files

`index.html`, `styles.css`, `manifest.webmanifest`, `sw.js` (offline cache), `_headers` (security headers), `icons/`, `js/` (app code, no dependencies).

## 1.3.0
- Finishing a workout shows a "Workout logged" popup with an optional workout note, then "Back to Workouts" or "View summary".
- Home button in the header (on any inner screen) jumps straight back to the start of the current tab.
- Planning a workout (dashed, "Planning" banner) now looks different from logging (green "Logging" banner) and a logged workout.
- Exercise cards have a coloured edge in the workout's colour; header bar is shaded with a bolder title.
- Dashboard exercise/workout selectors are smaller. Fixed a stray "null" on finished logs.

## 1.4.0
- Visual overhaul: bundled Inter / Inter Display typeface (served from the app itself, still fully offline), graphite palette, fine grain texture, gradient surfaces with hairline borders, refined buttons/inputs/tabs/sheets, light and dark themes.

## 1.5.0
- Concept look: purple palette (dark and light), LIFT wordmark, greeting with weight plate and week streak, weekly-goal progress bar.
- Dashboard shows volume change vs last week, top estimated 1RM and a Lift progress list (how much each lift rose when its latest best was set).
- Exercise pictograms (white in dark mode, black in light) in the library, picker and workouts; Push / Pull / Legs / Core filter.
- New light app icon. Settings: your name and weekly workout goal. Fixed a rare double data load when PIN and fingerprint unlocked together.

## 1.6.0
- Workout-in-progress bar above the tabs on every screen while a workout is running (shows the rest countdown too); tap to jump back.
- Round-start boxing bell when the rest timer ends (Settings → Rest timer: on/off and a Test button). Keep the screen on to hear it.
- New set type: Static hold (reps = seconds). Counts as a set but is left out of 1RM, volume, heaviest set and rep records.
- Dashboard: choose which routine your lifts come from.
- Stat tiles resize so numbers always fit ("Best 1RM" shows which set it came from). 1RM for a workout is the single best set.

## 1.6.1
- Dashboard exercise charts are now chosen by routine (instead of by workout). The routine picker also filters Lift progress and Top 1RM.

## 1.7.0
- Deload workouts: mark a workout as a deload in its options, or switch a session to a deload mid-workout (Workout options → Make this a deload workout, and back again).
- Deload weights are suggested at 60% of your best estimated 1RM (nearest 2.5 kg) and prefilled on empty sets; each exercise shows the target.
- Deload sessions never count towards 1RM, records, previous values or the exercise charts. They are tagged "Deload" in history and exercise history.
- Workouts-per-week chart: weeks containing a deload workout are drawn in amber.

## 1.7.1
- Deload is shown as just its own slice: an amber segment stacked on the week's bar in Workouts per week, and an amber section of the This week progress bar (with a small key).

## 1.7.2
- This week bar shows the deload slice even when you're past your weekly goal (the full bar is split in proportion).
- Settings: smaller, consistent text; removed the helper text under Version and the bell, and the bell Test button.

## 1.7.3
- Slimmer set inputs, set-type and tick buttons, and large buttons (Start workout, Last log, Finish). Target kg placeholder shortened to "kg".
- "Lifting Cues", "General Note" and "Workout Note" are capitalised.

## 1.8.0
- This week card has a Calendar button: a month view where each day you trained is shaded (purple for normal, amber for deload, split when you did both) with the time spent. Tap a day to see its workouts, with duration and start time; step between months; month totals for workouts, time and average length.

## 1.8.1
- Deadlift now uses the mascot illustration (img/ex-deadlift.png), drawn as a one-colour mask so it is white in dark mode and black in light mode. Other movements keep their pictograms until their mascot images are added (art.js `IMAGES` + one css line each).

## 1.9.0
- Mascot illustrations for 32 exercises (white in dark mode, black in light mode, red eyes). Frames and stray text from the supplied sheet are removed; the body is a one-colour mask so it follows the theme. Matching is by exercise name (art.js `IMAGE_RULES`); anything else keeps its pictogram.
- Seven exercises added once to every library: Dumbbell Press, Chest Press Machine, Pec Deck, Chest Fly High to Low, Chest Fly Low to High, JM Press, JM Press Machine (a deleted one is not re-added).

## 1.9.1
- Exercise illustrations have black eyes in dark mode (red in light mode).

## 2.0.0
- Routine is now called Programme everywhere.
- Targets tab: set a 1RM target for any exercise; each shows a percentage and progress bar towards your best estimated 1RM, and a dotted target line appears on that exercise's Estimated 1RM chart. Change or remove from the card.
- Bulletin tab: add notes, pin them to keep them at the top, edit or remove them.
- Workout stopwatch: a Start / Pause / Reset timer on the workout screen, independent of the rest timer that starts when you complete a set. It also shows in the Workout in progress bar while running.

## 2.1.0
- The workout stopwatch now stays pinned to the top of the screen while you scroll the workout.
- Targets can have an optional date. The card shows days left (or days overdue) and the Estimated 1RM chart's dotted target line shows "· 23d left". Without a date nothing extra is shown.

## 2.2.0
- A small gap between the pinned stopwatch and the header line. The finish pop-up title is "Workout Logged", and choosing View summary or Back to Workouts shows a "Workout Logged Successfully" toast.
- Targets appear on the Dashboard calendar: a target icon on each target date, a trophy on the day a target was reached, with details when you tap the day.
- Celebration when a workout takes an exercise's estimated 1RM to its target: a confetti pop-up, then a green trophy and "Target reached · date" on its Targets card. Deload sessions never count. Raise the target and it becomes an active goal again.

## 2.3.0
- Once a target is reached its dotted line on the Estimated 1RM chart turns green and says "reached".
- Reached targets are saved permanently as achievements. Editing or removing the target no longer removes the trophy from the calendar, so you can always find it. Existing reached targets were carried over.
- Bottom tab bar has equal margins on the left and right.

## 2.3.1
- Groundwork for the Android app: inside it the Settings page hides the browser-only items (update check, install, storage protection, fingerprint for now), and backups open Android's share sheet.

## 2.4.0
- Dashboard backup reminder removed (data now lives in the Android app's own storage). Backup and Restore buttons sit side by side.
- Headings use Title Case (sentences and questions are left as written).
- Typing: while a text box is focused, pop-ups move to the top of the screen and the page scrolls the field into view, so the keyboard never hides what you type.
- Android app: native fingerprint unlock (secret held in the Android Keystore behind the fingerprint, PIN always works), see-through status and navigation bars (edge-to-edge, bar icons follow the theme), bell is paired with vibration, new logo.
- Android shell moved to Capacitor 8.
