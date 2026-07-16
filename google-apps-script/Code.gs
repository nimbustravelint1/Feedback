/**
 * Nimbus Travel Feedback Collector
 * 1. Bind this script to the Google Sheet used by the current feedback system.
 * 2. Fill DRIVE_FOLDER_ID and ALERT_EMAILS below.
 * 3. Deploy as Web App: execute as yourself, access = Anyone.
 * 4. When updating an existing deployment, use Manage deployments > Edit > New version.
 */
const SETTINGS = {
  SHEET_NAME: 'Feedback',
  DRIVE_FOLDER_ID: '',
  ALERT_EMAILS: '',
  LOW_OVERALL_THRESHOLD: 3,
  LOW_ITEM_THRESHOLD: 2,
  CSV_FILENAME: 'nimbus_feedback_latest.csv'
};

const HEADERS = [
  'submissionId','submittedAt','receivedAt','language','formVersion',
  'groupCode','name','ciudades','itinerario','puntosEscenicos',
  'hotelDesayuno','hotelInstalacion','hotelServicio','restCalidad',
  'restServicio','guiaActitud','satisfaccionGeneral','comentarios','sourceUrl',
  'isLowScore','lowScoreReason'
];

const RATING_FIELDS = ['hotelDesayuno','hotelInstalacion','hotelServicio','restCalidad','restServicio','guiaActitud','satisfaccionGeneral'];
const RATING_LABELS = {
  hotelDesayuno:'Hotel breakfast / 酒店早餐', hotelInstalacion:'Hotel facilities / 酒店设施',
  hotelServicio:'Hotel service / 酒店服务', restCalidad:'Restaurant quality / 餐厅菜品',
  restServicio:'Restaurant service / 餐厅服务', guiaActitud:'Guide service / 导游服务',
  satisfaccionGeneral:'Overall satisfaction / 总体满意度'
};

function doGet() {
  return output_({ok:true, service:'nimbus-feedback-collector', time:new Date().toISOString()});
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    validate_(data);
    const sheet = getSheet_();
    ensureHeader_(sheet);
    if (isDuplicate_(sheet, data.submissionId)) return output_({ok:true, duplicate:true, submissionId:data.submissionId});

    const receivedAt = new Date().toISOString();
    const low = lowScore_(data);
    const record = Object.assign({}, data, {
      receivedAt,
      isLowScore: low.triggered ? 'YES' : '',
      lowScoreReason: low.reasons.join('; ')
    });
    sheet.appendRow(HEADERS.map(h => record[h] === undefined ? '' : record[h]));
    formatLatestRow_(sheet, low.triggered);
    if (SETTINGS.DRIVE_FOLDER_ID) exportCsv_(sheet);
    if (low.triggered && SETTINGS.ALERT_EMAILS) sendAlert_(record, low.reasons);
    return output_({ok:true, submissionId:data.submissionId, lowScore:low.triggered});
  } catch (err) {
    return output_({ok:false, message:String(err && err.message || err)});
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function getSheet_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  return book.getSheetByName(SETTINGS.SHEET_NAME) || book.insertSheet(SETTINGS.SHEET_NAME);
}
function ensureHeader_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,HEADERS.length).setFontWeight('bold').setBackground('#8f1d2c').setFontColor('#ffffff');
  }
}
function isDuplicate_(sheet, id) {
  const n = sheet.getLastRow()-1;
  if (n <= 0) return false;
  return sheet.getRange(2,1,n,1).createTextFinder(String(id)).matchEntireCell(true).findNext() !== null;
}
function validate_(data) {
  ['submissionId','submittedAt','language','groupCode','name','ciudades','itinerario'].forEach(k => {
    if (!String(data[k] || '').trim()) throw new Error('Missing required field: '+k);
  });
  RATING_FIELDS.forEach(k => {
    const value = Number(data[k]);
    if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error('Invalid rating: '+k);
  });
}
function lowScore_(data) {
  const reasons = [];
  RATING_FIELDS.forEach(k => {
    const v = Number(data[k]);
    if (k === 'satisfaccionGeneral') {
      if (v <= SETTINGS.LOW_OVERALL_THRESHOLD) reasons.push(RATING_LABELS[k]+': '+v+'/5');
    } else if (v <= SETTINGS.LOW_ITEM_THRESHOLD) reasons.push(RATING_LABELS[k]+': '+v+'/5');
  });
  return {triggered:reasons.length>0,reasons};
}
function formatLatestRow_(sheet, low) {
  const row = sheet.getLastRow();
  sheet.getRange(row,1,1,HEADERS.length).setWrap(true).setVerticalAlignment('top');
  if (low) sheet.getRange(row,1,1,HEADERS.length).setBackground('#ffe4e1');
}
function exportCsv_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  const csv = '\uFEFF' + values.map(row => row.map(csvCell_).join(',')).join('\r\n');
  const folder = DriveApp.getFolderById(SETTINGS.DRIVE_FOLDER_ID);
  const files = folder.getFilesByName(SETTINGS.CSV_FILENAME);
  if (files.hasNext()) {
    const file = files.next();
    file.setContent(csv);
    while (files.hasNext()) files.next().setTrashed(true);
  } else {
    folder.createFile(SETTINGS.CSV_FILENAME, csv, MimeType.CSV);
  }
}
function csvCell_(value) { return '"'+String(value === undefined ? '' : value).replace(/"/g,'""')+'"'; }
function sendAlert_(record, reasons) {
  const subject = '[Nimbus Feedback Alert] Low score · '+record.groupCode+' · '+record.name;
  const lines = [
    'A low tourist feedback score has been received.', '',
    'Group: '+record.groupCode, 'Name: '+record.name, 'Cities: '+record.ciudades,
    'Itinerary: '+record.itinerario, 'Language: '+record.language,
    'Overall: '+record.satisfaccionGeneral+'/5', '',
    'Alert reason:', reasons.join('\n'), '',
    'Comments:', record.comentarios || '(none)', '',
    'Submission ID: '+record.submissionId, 'Received: '+record.receivedAt
  ];
  MailApp.sendEmail({to:SETTINGS.ALERT_EMAILS,subject,body:lines.join('\n'),name:'Nimbus Travel Feedback'});
}
function output_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
