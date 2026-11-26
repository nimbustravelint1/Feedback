import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { coreSource, render } from './render.mjs';

const request = runInNewContext(coreSource + '\npilotRequestCore_;');
const port = Number(process.env.PILOT_PORT || 8787);
const host = process.env.PILOT_HOST || '127.0.0.1';
const filename = process.env.PILOT_DATA
  ? resolve(process.env.PILOT_DATA)
  : fileURLToPath(new URL('./nimbus-pilot-data.json', import.meta.url));
const pin = process.env.PILOT_OPS_PIN;
if (!pin || pin.length < 12) {
  throw new Error('Set PILOT_OPS_PIN to an operations access code with at least 12 characters.');
}

const html = render('local');

function database() {
  let data;
  try {
    data = JSON.parse(readFileSync(filename, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    data = { segments: [], reviews: [] };
  }
  const save = (collection, value) => {
    data[collection].push(value);
    const temporary = filename + '.tmp';
    writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 });
    renameSync(temporary, filename);
  };
  return {
    uuid: randomUUID,
    authorized: value => {
      if (typeof value !== 'string') return false;
      const supplied = Buffer.from(value);
      const expected = Buffer.from(pin);
      return supplied.length === expected.length && timingSafeEqual(supplied, expected);
    },
    segments: () => data.segments,
    reviews: () => data.reviews,
    addSegment: value => save('segments', value),
    addReview: value => save('reviews', value),
  };
}

const errors = new Set(['invalid_input', 'invalid_rating', 'invalid_action', 'missing_segment', 'unauthorized']);

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET' && path === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
    return;
  }
  if (req.method !== 'POST' || path !== '/api') {
    res.writeHead(404).end();
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    if (req.headers['content-type'] !== 'application/json') throw new Error('invalid_input');
    let bytes = 0;
    const chunks = [];
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes <= 32768) chunks.push(chunk);
    }
    if (bytes > 32768) throw new Error('invalid_input');
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new Error('invalid_input');
    }
    if (!body || typeof body !== 'object') throw new Error('invalid_input');
    const result = request(body.action, body.payload, database());
    res.end(JSON.stringify({ ok: true, result }));
  } catch (error) {
    const code = errors.has(error.message) ? error.message : 'unavailable';
    if (code === 'unavailable') console.error(error);
    res.end(JSON.stringify({ ok: false, error: code }));
  }
}).listen(port, host, () => console.log('Nimbus feedback pilot listening on http://' + host + ':' + port));
