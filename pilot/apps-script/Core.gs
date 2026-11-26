const PILOT_SCORE_FIELDS = ['overall', 'guide', 'itinerary', 'attractions', 'hotel', 'restaurant'];
const PILOT_LANGUAGES = ['zh', 'en', 'ru', 'es'];
const PILOT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pilotText_(value, max, required) {
  if (typeof value !== 'string') {
    if (required) throw new Error('invalid_input');
    return '';
  }
  const text = value.trim();
  if (text.length > max || (required && !text)) throw new Error('invalid_input');
  return text;
}

function pilotGroup_(value) {
  return pilotText_(value, 64, true).normalize('NFKC').trim().toUpperCase();
}

function pilotName_(value) {
  return pilotText_(value, 64, true).normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function pilotId_(value) {
  if (typeof value !== 'string' || !PILOT_UUID.test(value)) throw new Error('invalid_input');
  return value.toLowerCase();
}

function pilotSegment_(segment) {
  return { token: segment.token, group: segment.group, city: segment.city, guide: segment.guide };
}

function pilotRatings_(ratings) {
  if (!ratings || !Number.isInteger(ratings.overall)) throw new Error('invalid_rating');
  return Object.fromEntries(PILOT_SCORE_FIELDS.map(field => {
    const rating = ratings[field] ?? null;
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      throw new Error('invalid_rating');
    }
    return [field, rating];
  }));
}

function pilotLow_(ratings) {
  return ratings.overall <= 3 || PILOT_SCORE_FIELDS.some(field => ratings[field] !== null && ratings[field] <= 2);
}

function pilotSummarize_(reviews) {
  const averages = Object.fromEntries(PILOT_SCORE_FIELDS.map(field => {
    const values = reviews.map(review => review.ratings[field]).filter(Number.isInteger);
    const value = values.length ? values.reduce((total, score) => total + score, 0) / values.length : null;
    return [field, { value, count: values.length }];
  }));
  return { count: reviews.length, low: reviews.filter(review => pilotLow_(review.ratings)).length, averages };
}

function pilotRequestCore_(action, payload, store) {
  if (!payload || typeof payload !== 'object') throw new Error('invalid_input');
  if (action === 'create') {
    const group = pilotGroup_(payload.group);
    const city = pilotName_(payload.city);
    const guide = pilotName_(payload.guide);
    const requestId = pilotId_(payload.requestId);
    const segments = store.segments();
    const replay = segments.find(segment => segment.requestId === requestId);
    if (replay) return pilotSegment_(replay);

    const existing = segments.find(segment => segment.group === group &&
      segment.city.toLowerCase() === city.toLowerCase() &&
      segment.guide.toLowerCase() === guide.toLowerCase());
    if (existing && payload.newSegment !== true) return pilotSegment_(existing);

    const segment = { token: store.uuid().toLowerCase(), requestId, group, city, guide, createdAt: new Date().toISOString() };
    store.addSegment(segment);
    return pilotSegment_(segment);
  }

  if (action === 'get' || action === 'submit') {
    const token = pilotId_(payload.token);
    const segment = store.segments().find(item => item.token === token);
    if (!segment) throw new Error('missing_segment');
    if (action === 'get') return pilotSegment_(segment);

    const submissionId = pilotId_(payload.submissionId);
    if (store.reviews().some(review => review.token === token && review.submissionId === submissionId)) {
      return { received: true };
    }
    if (!PILOT_LANGUAGES.includes(payload.language)) throw new Error('invalid_input');

    const ratings = pilotRatings_(payload.ratings);
    const comment = pilotText_(payload.comment, 2000, false);
    store.addReview({ token, submissionId, language: payload.language, ratings, comment, receivedAt: new Date().toISOString() });
    return { received: true };
  }

  if (action === 'summary') {
    if (!store.authorized(payload.pin)) throw new Error('unauthorized');
    const group = pilotGroup_(payload.group);
    const segments = store.segments().filter(segment => segment.group === group);
    const byToken = new Map(segments.map(segment => [segment.token, []]));
    const reviews = store.reviews().filter(review => byToken.has(review.token));
    reviews.forEach(review => byToken.get(review.token).push(review));

    return {
      group,
      ...pilotSummarize_(reviews),
      segments: segments.map(segment => {
        const entries = byToken.get(segment.token);
        return {
          ...pilotSegment_(segment),
          ...pilotSummarize_(entries),
          reviews: entries.slice().reverse().map(review => ({
            overall: review.ratings.overall,
            low: pilotLow_(review.ratings),
            comment: review.comment,
          })),
        };
      }),
    };
  }

  throw new Error('invalid_action');
}
