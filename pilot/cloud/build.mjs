import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreSource, render } from '../render.mjs';

const output = resolve(process.argv[2] || 'dist/server/index.js');
const worker = readFileSync(new URL('./worker.mjs', import.meta.url), 'utf8');
mkdirSync(resolve(output, '..'), { recursive: true });
writeFileSync(output, 'const PILOT_HTML = ' + JSON.stringify(render('shared')) + ';\n' + coreSource + '\n' + worker);
