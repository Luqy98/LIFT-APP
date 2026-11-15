// Matches an exercise name to a mascot icon (pure logic, no DOM). See art.js for how it is drawn.
import { ICONS } from './icons.js';

import { ICONS_V2, ICONS_LIGHT } from './icons-v2.js';
import { CATALOG_RENAMES } from './catalog.js';

// A picture is only used when the exercise name is exactly a name in the default library (any capitals); everything else gets the plain dumbbell.
const LIGHT = new Map(ICONS_LIGHT.map(([name, slug]) => [name.toLowerCase(), slug]));
const EXACT = new Map();
for (const [name, slug, eyes] of ICONS) {
  const ic = { name, slug, eyes: !!eyes };
  EXACT.set(name.toLowerCase(), ic);
  if (CATALOG_RENAMES[name]) EXACT.set(CATALOG_RENAMES[name].toLowerCase(), ic);
}
for (const [name, slug, eyes] of ICONS_V2) EXACT.set(name.toLowerCase(), { name, slug, eyes: !!eyes });
export function setIconAlias() { /* pictures no longer follow renames */ }

/** Drawing for an exercise name (plus `light`, the light-mode drawing, when there is one), or null. */
export function iconFor(name) {
  const key = String(name || '').trim().toLowerCase();
  const ic = EXACT.get(key);
  if (!ic) return null;
  const light = LIGHT.get(key);
  return light ? { ...ic, light } : ic;
}
export const imageSlug = (name) => iconFor(name)?.slug || null;
