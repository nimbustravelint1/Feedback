import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

export const coreSource = read('./apps-script/Core.gs');

const template = read('./Index.html')
  .replace('/* PILOT_STYLES */', () => read('./styles.css'))
  .replace('<!-- PILOT_LOGO -->', () => read('../assets/logo.svg'))
  .replace('/* PILOT_QR_LIBRARY */', () => '/*\n' + read('./vendor/LICENSE') + '*/\n' + read('./vendor/qrcode.js'))
  .replace('/* PILOT_CLIENT */', () => read('./client.js'));

export function render(mode) {
  const demo = mode === 'demo' ? coreSource + '\n' + read('./demo.js') : '';
  const markup = template.replace('/* PILOT_LOCAL_TRANSPORT */', () => demo);
  if (mode === 'google') return markup;
  const variables = { mode, base: '', view: '', token: '' };
  return markup.replace(/<\?= (mode|base|view|token) \?>/g, (_, key) => variables[key]);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const output = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('./build', import.meta.url));
  const google = resolve(output, 'Apps-Script');
  mkdirSync(google, { recursive: true });
  writeFileSync(resolve(output, 'Nimbus-Feedback-Pilot.html'), render('demo'));
  writeFileSync(resolve(google, 'Index.html'), render('google'));
  for (const file of ['Core.gs', 'Code.gs']) {
    copyFileSync(fileURLToPath(new URL('./apps-script/' + file, import.meta.url)), resolve(google, file));
  }
}
