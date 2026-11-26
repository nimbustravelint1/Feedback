import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { render } from '../render.mjs';

const [output, api] = process.argv.slice(2);
if (!output || !api) throw new Error('Usage: node pilot/cloud/build-pages.mjs OUTPUT HTTPS_API_URL');
const filename = resolve(output);
mkdirSync(dirname(filename), { recursive: true });
writeFileSync(filename, render('shared', api));
