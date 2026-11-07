// The admin page previews items with the exact same engine as the app.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '..', '..', 'app', 'renderer'), to = join(here, '..', 'public');
mkdirSync(to, { recursive: true });
for (const f of ['schema.js', 'effects.js']) copyFileSync(join(from, f), join(to, f));
console.log('copied schema.js, effects.js');
