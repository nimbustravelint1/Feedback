function pilotDemoRequest(action, payload) {
  const key = 'nimbus-feedback-pilot-v1';
  const data = JSON.parse(localStorage.getItem(key) || '{"segments":[],"reviews":[]}');
  const save = (collection, value) => {
    data[collection].push(value);
    localStorage.setItem(key, JSON.stringify(data));
  };
  return pilotRequestCore_(action, payload, {
    uuid: randomId,
    authorized: () => true,
    segments: () => data.segments,
    reviews: () => data.reviews,
    addSegment: value => save('segments', value),
    addReview: value => save('reviews', value),
  });
}
