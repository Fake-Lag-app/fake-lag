// Pages output: the static admin files plus a _worker.js that wraps the API Worker.
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'dist-pages');
rmSync(out, { recursive: true, force: true });
cpSync(join(here, '..', 'public'), out, { recursive: true });
rmSync(join(out, '_headers'), { force: true });
writeFileSync(join(out, '_worker.js'), "export { default } from '../src/pages.js';\n");
console.log('built dist-pages');
