// The build prepends the existing form renderer and Apps Script validation helpers.
const knownErrors = new Set(['invalid_input', 'invalid_rating', 'invalid_action', 'missing_segment', 'unauthorized']);
const pagesOrigin = 'https://nimbustravelint1.github.io';
const headers = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};

async function matchesSecret(provided, secret) {
  if (typeof provided !== 'string' || provided.length > 128 || typeof secret !== 'string' || secret.length < 16) return false;
  const encoder = new TextEncoder();
  const hash = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  const [a, b] = await Promise.all([hash(provided), hash(secret)]);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function parseBody(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json' || !request.body) {
    throw new Error('invalid_input');
  }
  const reader = request.body.getReader();
  const buffer = new Uint8Array(12288);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.length > buffer.length) {
        await reader.cancel();
        throw new Error('invalid_input');
      }
      buffer.set(value, length);
      length += value.length;
    }
    return JSON.parse(new TextDecoder().decode(buffer.subarray(0, length)));
  } catch {
    throw new Error('invalid_input');
  } finally {
    reader.releaseLock();
  }
}

async function createSegment(db, payload) {
  const group = pilotGroup_(payload.group);
  const city = pilotName_(payload.city);
  const guide = pilotName_(payload.guide);
  const token = crypto.randomUUID();
  const cityKey = city.toLowerCase();
  const guideKey = guide.toLowerCase();
  const [, groupMatch] = await db.batch([
    db.prepare('INSERT INTO pilot_segments (token, group_code, city, city_key, guide, guide_key) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (group_code, city_key, guide_key) DO NOTHING')
      .bind(token, group, city, cityKey, guide, guideKey),
    db.prepare('SELECT token, group_code AS "group", city, guide FROM pilot_segments WHERE group_code = ? AND city_key = ? AND guide_key = ?')
      .bind(group, cityKey, guideKey),
  ]);
  return groupMatch.results[0];
}

async function guestRequest(action, db, payload) {
  const token = pilotId_(payload.token);
  const segment = await db.prepare('SELECT token, group_code AS "group", city, guide FROM pilot_segments WHERE token = ?').bind(token).first();
  if (!segment) throw new Error('missing_segment');
  if (action === 'get') return segment;

  const submissionId = pilotId_(payload.submissionId);
  if (!PILOT_LANGUAGES.includes(payload.language)) throw new Error('invalid_input');
  const ratings = pilotRatings_(payload.ratings);
  const comment = pilotText_(payload.comment, 2000, false);
  await db.prepare('INSERT INTO pilot_reviews (token, submission_id, language, ratings_json, comment) VALUES (?, ?, ?, ?, ?) ON CONFLICT (token, submission_id) DO NOTHING')
    .bind(token, submissionId, payload.language, JSON.stringify(ratings), comment).run();
  return { received: true };
}

async function groupSummary(db, payload) {
  const group = pilotGroup_(payload.group);
  const [segments, reviews] = await db.batch([
    db.prepare('SELECT token, group_code AS "group", city, guide FROM pilot_segments WHERE group_code = ? ORDER BY id').bind(group),
    db.prepare('SELECT r.token, r.ratings_json, r.comment FROM pilot_reviews r JOIN pilot_segments s ON r.token = s.token WHERE s.group_code = ? ORDER BY r.id').bind(group),
  ]);
  const entries = reviews.results.map(row => ({
    token: row.token,
    ratings: JSON.parse(row.ratings_json),
    comment: row.comment,
  }));
  return pilotGroupSummary_(group, segments.results, entries);
}

async function dispatch(action, payload, env) {
  if (!payload || typeof payload !== 'object') throw new Error('invalid_input');
  if (action === 'create') {
    if (!await matchesSecret(payload.guideCode, env.PILOT_GUIDE_CODE)) throw new Error('unauthorized');
    return createSegment(env.DB, payload);
  }
  if (action === 'get' || action === 'submit') return guestRequest(action, env.DB, payload);
  if (action === 'summary') {
    if (!await matchesSecret(payload.pin, env.PILOT_OPS_PIN)) throw new Error('unauthorized');
    return groupSummary(env.DB, payload);
  }
  throw new Error('invalid_action');
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === 'GET' && pathname === '/') {
      return new Response(PILOT_HTML, { headers: { ...headers, 'Content-Type': 'text/html; charset=UTF-8' } });
    }
    const origin = request.headers.get('Origin');
    const apiHeaders = { ...headers, Vary: 'Origin' };
    if (origin === pagesOrigin) apiHeaders['Access-Control-Allow-Origin'] = pagesOrigin;
    if (request.method === 'OPTIONS' && pathname === '/api') {
      if (origin !== pagesOrigin) return new Response(null, { headers: apiHeaders, status: 403 });
      apiHeaders['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      apiHeaders['Access-Control-Allow-Headers'] = 'Content-Type';
      apiHeaders['Access-Control-Max-Age'] = '600';
      return new Response(null, { headers: apiHeaders, status: 204 });
    }
    if (request.method !== 'POST' || pathname !== '/api') return new Response(null, { headers, status: 404 });
    try {
      const { action, payload } = await parseBody(request) || {};
      const result = await dispatch(action, payload, env);
      return Response.json({ ok: true, result }, { headers: apiHeaders });
    } catch (error) {
      const code = knownErrors.has(error.message) ? error.message : 'unavailable';
      if (code === 'unavailable') console.error(error);
      return Response.json({ ok: false, error: code }, { headers: apiHeaders });
    }
  },
};
