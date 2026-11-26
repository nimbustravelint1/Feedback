const PILOT_SEGMENT_COLUMNS = ['token', 'requestId', 'group', 'city', 'guide', 'createdAt'];
const PILOT_REVIEW_COLUMNS = ['token', 'submissionId', 'language', 'overall', 'guide', 'itinerary', 'attractions', 'hotel', 'restaurant', 'comment', 'receivedAt'];

function doGet(e) {
  const parameters = e && e.parameter || {};
  const template = HtmlService.createTemplateFromFile('Index');
  template.mode = 'google';
  template.base = ScriptApp.getService().getUrl();
  template.token = String(parameters.guest || '').slice(0, 64);
  template.view = parameters.guest ? 'guest' : parameters.view === 'ops' ? 'ops' : 'guide';
  return template.evaluate()
    .setTitle('Nimbus Travel | 游客评价')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function pilotRequest(action, payload) {
  const lock = LockService.getScriptLock();
  let acquired = false;
  try {
    lock.waitLock(15000);
    acquired = true;
    const result = pilotRequestCore_(action, payload, pilotSpreadsheet_());
    if (action === 'create' || action === 'submit') SpreadsheetApp.flush();
    return { ok: true, result };
  } catch (error) {
    const known = ['invalid_input', 'invalid_rating', 'invalid_action', 'missing_segment', 'unauthorized'];
    const code = known.includes(error.message) ? error.message : 'unavailable';
    if (code === 'unavailable') console.error(error);
    return { ok: false, error: code };
  } finally {
    if (acquired) lock.releaseLock();
  }
}

function pilotSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty('PILOT_SHEET_ID');
  const pin = properties.getProperty('PILOT_OPS_PIN');
  if (!spreadsheetId || !pin || pin.length < 12) throw new Error('pilot_config_missing');

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  return {
    uuid: () => Utilities.getUuid(),
    authorized: value => typeof value === 'string' && pilotSameSecret_(value, pin),
    segments: () => pilotReadRows_(pilotSheet_(spreadsheet, 'PilotSegments', PILOT_SEGMENT_COLUMNS), PILOT_SEGMENT_COLUMNS),
    reviews: () => pilotReadRows_(pilotSheet_(spreadsheet, 'PilotReviews', PILOT_REVIEW_COLUMNS), PILOT_REVIEW_COLUMNS)
      .map(({ token, submissionId, language, comment, receivedAt, ...scores }) => ({
        token, submissionId, language, comment, receivedAt,
        ratings: Object.fromEntries(PILOT_SCORE_FIELDS.map(field => [field, scores[field] === '' ? null : Number(scores[field])])),
      })),
    addSegment: segment => pilotAppend_(pilotSheet_(spreadsheet, 'PilotSegments', PILOT_SEGMENT_COLUMNS),
      PILOT_SEGMENT_COLUMNS.map(column => segment[column])),
    addReview: review => {
      const row = { ...review, ...review.ratings };
      pilotAppend_(pilotSheet_(spreadsheet, 'PilotReviews', PILOT_REVIEW_COLUMNS),
        PILOT_REVIEW_COLUMNS.map(column => row[column]));
    },
  };
}

function pilotSameSecret_(value, expected) {
  if (value.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) difference |= value.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

function pilotSheet_(spreadsheet, name, columns) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function pilotReadRows_(sheet, columns) {
  const size = sheet.getLastRow() - 1;
  if (size < 1) return [];
  return sheet.getRange(2, 1, size, columns.length).getValues().filter(row => row[0])
    .map(row => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
}

function pilotAppend_(sheet, values) {
  const row = sheet.getLastRow() + 1;
  const range = sheet.getRange(row, 1, 1, values.length);
  range.setNumberFormats([values.map(value => typeof value === 'string' ? '@' : '0')]);
  range.setValues([values.map(value => typeof value === 'string' && /^\s*[=+@-]/.test(value) ? "'" + value : value ?? '')]);
}
