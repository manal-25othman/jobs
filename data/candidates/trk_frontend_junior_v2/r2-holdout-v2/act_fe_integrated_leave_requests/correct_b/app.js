/*
 * طلبات الإجازة.
 * بدل علَمين منفصلين (isLoading وerror) يمكن أن يتناقضا، الحالة الآن حقل واحد status:
 *   'loading' | 'error' | 'ready'
 * التحميل الأول وإعادة المحاولة يستدعيان الدالة نفسها load()، فلا يوجد مسار ينسى إنهاء التحميل.
 */

const TYPE_AR = { annual: 'إجازة سنوية', sick: 'إجازة مرضية', emergency: 'إجازة اضطرارية' };
const STATUS_AR = { approved: 'مقبول', pending: 'قيد المراجعة', rejected: 'مرفوض' };

const state = {
  status: 'loading',
  requests: [],
  errorMessage: '',
};

const app = document.getElementById('app');
const template = document.getElementById('request-template');

function setState(patch) {
  Object.assign(state, patch);
  render();
}

function message(text, extraClass) {
  const p = document.createElement('p');
  p.className = 'state' + (extraClass ? ' ' + extraClass : '');
  p.textContent = text;
  return p;
}

function card(request) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector('.card__type').textContent = TYPE_AR[request.type] || request.type;
  node.querySelector('.f-period').textContent = `${request.startDate} — ${request.endDate}`;
  node.querySelector('.f-days').textContent = String(request.days);
  const status = node.querySelector('.f-status');
  status.textContent = STATUS_AR[request.status] || request.status;
  status.classList.add('st-' + request.status);
  node.querySelector('.f-submitted').textContent = request.submittedAt;
  return node;
}

function render() {
  app.replaceChildren();

  if (state.status === 'loading') {
    app.append(message('جارٍ تحميل الطلبات…'));
    app.setAttribute('aria-busy', 'true');
    return;
  }
  app.removeAttribute('aria-busy');

  if (state.status === 'error') {
    const box = document.createElement('div');
    box.className = 'state state--error';
    box.setAttribute('role', 'alert');
    const text = document.createElement('span');
    text.textContent = state.errorMessage;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'إعادة المحاولة';
    retry.addEventListener('click', load);
    box.append(text, retry);
    app.append(box);
    return;
  }

  if (state.requests.length === 0) {
    app.append(message('لا طلبات إجازة سابقة.'));
    return;
  }

  // newest submission first (the service sends them oldest first)
  const byNewest = [...state.requests].sort(
    (a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)
  );
  const list = document.createElement('ul');
  list.className = 'cards';
  byNewest.forEach((r) => list.append(card(r)));
  app.append(list);
}

async function load() {
  setState({ status: 'loading', errorMessage: '' });
  try {
    const requests = await window.mockApi.fetchLeaveRequests();
    setState({ status: 'ready', requests: Array.isArray(requests) ? requests : [] });
  } catch (err) {
    setState({ status: 'error', requests: [], errorMessage: 'لم نتمكّن من جلب طلباتك الآن.' });
  }
}

load();
