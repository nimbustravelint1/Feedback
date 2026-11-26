'use strict';

const $ = id => document.getElementById(id);
const mode = document.body.dataset.mode;
const query = new URLSearchParams(location.search);
const token = mode === 'google' ? document.body.dataset.token : query.get('guest');
const view = mode === 'google' ? document.body.dataset.view :
  token ? 'guest' : query.get('view') === 'ops' ? 'ops' : 'guide';
const base = document.body.dataset.base || location.href;
const languages = ['zh', 'en', 'ru', 'es'];
const fields = ['overall', 'guide', 'itinerary', 'attractions', 'hotel', 'restaurant'];
const dictionaries = {
  zh: {
    title: '本站旅游体验评价', intro: '请评价本页所示城市的服务。5 分为最高分。',
    meta: ['团号', '城市', '导游'], scores: ['总体满意度', '导游服务', '行程安排', '景点', '酒店', '餐厅'],
    skip: '未体验', comments: '意见与建议（选填）', submit: '提交评价', success: '评价已收到，谢谢您的反馈。',
    missing: '这个评价链接无效，请向导游索取本站二维码。', invalid: '请选择总评分，并检查填写内容。',
    retry: '暂时无法连接。请稍后重试。', loading: '正在加载本站信息…', refresh: '重新加载',
  },
  en: {
    title: 'Rate your experience', intro: 'Please rate the services at the stop shown below. 5 is the highest score.',
    meta: ['Group code', 'City', 'Guide'], scores: ['Overall', 'Guide', 'Itinerary', 'Attractions', 'Hotel', 'Restaurants'],
    skip: 'Not used', comments: 'Comments (optional)', submit: 'Send feedback', success: 'Your feedback has been received. Thank you.',
    missing: 'This link is invalid. Please ask your guide for the QR code for this stop.', invalid: 'Please choose an overall rating and check your answers.',
    retry: 'Could not connect. Please try again.', loading: 'Loading stop details…', refresh: 'Reload',
  },
  ru: {
    title: 'Оцените поездку в этом городе', intro: 'Пожалуйста, оцените услуги в указанном ниже городе. 5 — высшая оценка.',
    meta: ['Номер группы', 'Город', 'Гид'], scores: ['Общая оценка', 'Работа гида', 'Программа тура', 'Достопримечательности', 'Отель', 'Рестораны'],
    skip: 'Без оценки', comments: 'Комментарии и пожелания (необязательно)', submit: 'Отправить отзыв', success: 'Ваш отзыв получен. Спасибо!',
    missing: 'Ссылка недействительна. Попросите гида прислать QR-код для этого города.', invalid: 'Выберите общую оценку и проверьте ответы.',
    retry: 'Не удалось подключиться. Попробуйте ещё раз.', loading: 'Загружаем информацию…', refresh: 'Обновить',
  },
  es: {
    title: 'Valora tu experiencia', intro: 'Valora los servicios en la ciudad que aparece abajo. 5 es la puntuación más alta.',
    meta: ['Código del grupo', 'Ciudad', 'Guía'], scores: ['Valoración general', 'Guía', 'Itinerario', 'Atracciones', 'Hotel', 'Restaurantes'],
    skip: 'Sin valorar', comments: 'Comentarios (opcional)', submit: 'Enviar valoración', success: 'Hemos recibido tu valoración. Gracias.',
    missing: 'El enlace no es válido. Pide al guía el código QR de esta ciudad.', invalid: 'Elige una valoración general y revisa tus respuestas.',
    retry: 'No se pudo establecer la conexión. Inténtalo de nuevo.', loading: 'Cargando los datos…', refresh: 'Recargar',
  },
};

function pageUrl(parameters = {}) {
  const url = new URL(base);
  url.search = new URLSearchParams(parameters).toString();
  url.hash = '';
  return url.href;
}

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function status(id, text, type = '') {
  const element = $(id);
  element.textContent = text;
  element.className = 'status' + (type ? ' ' + type : '');
}

async function rpc(action, payload) {
  if (mode === 'demo') return pilotDemoRequest(action, payload);
  const response = mode === 'google' ? await new Promise((resolve, reject) =>
    google.script.run.withSuccessHandler(resolve).withFailureHandler(() => reject(new Error('unavailable')))
      .pilotRequest(action, payload)
  ) : await fetch('/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  }).then(result => result.json());
  if (!response.ok) throw new Error(response.error);
  return response.result;
}

function renderQr(canvas, url, download) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const modules = qr.getModuleCount();
  const padding = 4;
  const pixel = 7;
  const size = (modules + padding * 2) * pixel;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.fillStyle = '#000000';
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (qr.isDark(row, col)) context.fillRect((col + padding) * pixel, (row + padding) * pixel, pixel, pixel);
    }
  }
  download.href = canvas.toDataURL('image/png');
}

const guideURL = pageUrl();
const opsURL = pageUrl({ view: 'ops' });
$('brand').href = view === 'guest' ? pageUrl({ guest: token }) : guideURL;
$('brand').target = '_top';
$('guide-link').href = guideURL;
$('ops-link').href = opsURL;
$('guide-link').target = '_top';
$('ops-link').target = '_top';
$('staff-nav').hidden = view === 'guest';
const notice = $('mode-note');
notice.hidden = !['demo', 'shared'].includes(mode) || view === 'guest';
if (mode === 'shared') notice.textContent = '多人测试版。请使用模拟团号和模拟评价。';
$(view).hidden = false;

function setupGuide() {
  $('guide-link').setAttribute('aria-current', 'page');
  const form = $('guide-form');
  let pending = null;
  if (mode === 'shared') {
    $('guide-code-field').hidden = false;
    $('guide-code').required = true;
    $('guide-code').value = sessionStorage.getItem('nimbus-pilot-guide-code') || '';
  }
  $('fill-example').hidden = mode === 'google';
  $('fill-example').addEventListener('click', () => {
    $('group').value = 'NIMBUS-TEST-001';
    $('city').focus();
  });
  $('guide-qr').parentElement.addEventListener('toggle', event => {
    if (event.currentTarget.open) renderQr($('guide-qr'), guideURL, $('download-guide-qr'));
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(form);
    const payload = { group: values.get('group'), city: values.get('city'), guide: values.get('guide') };
    if (mode === 'shared') payload.guideCode = values.get('guideCode');
    const signature = JSON.stringify(payload);
    if (!pending || pending.signature !== signature) pending = { signature, requestId: randomId() };
    const button = event.submitter;
    button.disabled = true;
    $('qr-result').hidden = true;
    $('qr-empty').hidden = false;
    status('guide-status', '正在生成…');
    try {
      const segment = await rpc('create', { ...payload, requestId: pending.requestId });
      const url = pageUrl({ guest: segment.token });
      renderQr($('guest-qr'), url, $('download-qr'));
      $('qr-meta').textContent = [segment.group, segment.city, segment.guide].join(' · ');
      $('open-guest').href = url;
      $('guest-link-text').value = url;
      $('guest-link-text').hidden = true;
      $('qr-empty').hidden = true;
      $('qr-result').hidden = false;
      if (mode === 'shared') sessionStorage.setItem('nimbus-pilot-guide-code', payload.guideCode);
      pending = null;
      status('guide-status', '已生成，可以发给本站游客。', 'success');
    } catch (error) {
      const messages = { invalid_input: '请检查姓名、团号和城市。', unauthorized: '同事测试码不正确。' };
      const message = messages[error.message] || '暂时无法生成，请重试。';
      status('guide-status', message, 'error');
    } finally {
      button.disabled = false;
    }
  });
  $('copy-guest').addEventListener('click', async () => {
    const input = $('guest-link-text');
    try {
      await navigator.clipboard.writeText(input.value);
      status('guide-status', '已复制游客链接。', 'success');
    } catch {
      input.hidden = false;
      input.focus();
      input.select();
      status('guide-status', '请复制下方已选中的链接。');
    }
  });
}

function setupGuest() {
  let language = navigator.language.toLowerCase().split('-')[0];
  if (!languages.includes(language)) language = 'en';
  $('lang').value = language;
  const form = $('guest-form');
  const ratings = $('ratings');
  const submissionId = randomId();
  let segment;
  let submitted = false;
  let errorCode = '';
  let loading = true;
  let retry;

  function phrase() {
    return dictionaries[language];
  }

  function refreshText() {
    const words = phrase();
    document.documentElement.lang = language;
    $('guest-title').textContent = words.title;
    $('guest-intro').textContent = words.intro;
    $('comment-label').textContent = words.comments;
    $('guest-submit').textContent = words.submit;
    Array.from(ratings.querySelectorAll('legend')).forEach((element, index) => { element.textContent = words.scores[index]; });
    ratings.querySelectorAll('.skip span').forEach(element => { element.textContent = words.skip; });
    if (segment) {
      $('guest-meta').replaceChildren(...['group', 'city', 'guide'].map((key, index) => {
        const item = node('div');
        item.append(node('span', words.meta[index]), node('strong', segment[key]));
        return item;
      }));
    }
    if (submitted) status('guest-status', words.success, 'success');
    else if (loading) status('guest-status', words.loading);
    else if (errorCode) {
      const message = errorCode === 'missing_segment' ? words.missing :
        errorCode === 'invalid_rating' ? words.invalid : words.retry;
      status('guest-status', message, 'error');
      if (retry) {
        retry.textContent = words.refresh;
        $('guest-status').append(' ', retry);
      }
    } else status('guest-status', '');
  }

  for (const field of fields) {
    const fieldset = node('fieldset');
    fieldset.append(node('legend'));
    const row = node('div', undefined, 'rating-row');
    const values = field === 'overall' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, null];
    for (const value of values) {
      const label = node('label', undefined, value === null ? 'skip' : '');
      const input = node('input');
      input.type = 'radio';
      input.name = field;
      input.value = value ?? '';
      input.required = field === 'overall';
      label.append(input, node('span', value ?? ''));
      row.append(label);
    }
    fieldset.append(row);
    ratings.append(fieldset);
  }
  async function load() {
    loading = true;
    retry = null;
    refreshText();
    try {
      segment = await rpc('get', { token });
      errorCode = '';
      form.hidden = false;
      $('guest-meta').hidden = false;
    } catch (error) {
      errorCode = error.message === 'invalid_input' ? 'missing_segment' : error.message;
      if (errorCode !== 'missing_segment') {
        retry = node('button', undefined, 'plain');
        retry.addEventListener('click', load);
      }
    } finally {
      loading = false;
      refreshText();
    }
  }

  $('lang').addEventListener('change', event => { language = event.target.value; refreshText(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const values = new FormData(form);
    const scores = Object.fromEntries(fields.map(field => [field, values.get(field) ? Number(values.get(field)) : null]));
    $('guest-submit').disabled = true;
    try {
      await rpc('submit', { token, submissionId, language, ratings: scores, comment: values.get('comment') });
      submitted = true;
      form.hidden = true;
    } catch (error) {
      errorCode = error.message;
    } finally {
      $('guest-submit').disabled = false;
      refreshText();
    }
  });
  load();
}

function setupOps() {
  $('ops-link').setAttribute('aria-current', 'page');
  if (mode === 'demo') {
    $('pin-field').hidden = true;
    $('pin').required = false;
  }
  $('ops-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.submitter;
    const report = $('report');
    report.replaceChildren();
    button.disabled = true;
    status('ops-status', '正在查询…');
    try {
      const summary = await rpc('summary', { group: form.get('group'), pin: form.get('pin') });
      status('ops-status', summary.segments.length ? '' : '此团号还没有生成评价二维码。');
      if (summary.segments.length) renderSummary(report, summary);
    } catch (error) {
      const messages = { unauthorized: '运营访问码不正确。', invalid_input: '请填写有效的团号。' };
      status('ops-status', messages[error.message] || '查询暂时失败，请重试。', 'error');
    } finally {
      button.disabled = false;
    }
  });
}

function renderSummary(report, summary) {
  const overall = summary.averages.overall;
  const headline = node('div', undefined, 'card report-overview');
  const groupText = [summary.segments.length + ' 个服务段', summary.count + ' 条评价', summary.low + ' 条低分'];
  if (overall.count) groupText.push('总评 ' + overall.value.toFixed(2) + ' / 5');
  headline.append(node('h2', summary.group), node('p', groupText.join(' · ')));
  report.append(headline);
  for (const segment of summary.segments) {
    const card = node('article', undefined, 'card segment-card');
    card.append(node('h3', segment.city + ' · ' + segment.guide));
    const counts = segment.count + ' 条评价 · ' + segment.low + ' 条低分';
    card.append(node('p', counts, segment.low ? 'low' : ''));
    const scores = node('div', undefined, 'scores');
    fields.forEach((field, index) => {
      const item = segment.averages[field];
      scores.append(node('span', dictionaries.zh.scores[index] + ' ' + (item.count ? item.value.toFixed(2) + ' (' + item.count + ')' : '未评分')));
    });
    card.append(scores);
    if (segment.reviews.length) {
      const details = node('details', undefined, 'reviews');
      details.append(node('summary', '查看评价明细'));
      const list = node('ul');
      segment.reviews.forEach(review => {
        const label = review.overall + ' / 5' + (review.comment ? ' · ' + review.comment : '');
        list.append(node('li', label, review.low ? 'low' : ''));
      });
      details.append(list);
      card.append(details);
    }
    report.append(card);
  }
}

if (view === 'guide') setupGuide();
else if (view === 'guest') setupGuest();
else setupOps();
