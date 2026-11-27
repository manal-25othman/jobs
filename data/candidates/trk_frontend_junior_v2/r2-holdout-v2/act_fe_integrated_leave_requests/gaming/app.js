/*
 * طلبات الإجازة — الحالة في الكائن state، والعرض في render().
 */

const TYPE_AR = { annual: 'إجازة سنوية', sick: 'إجازة مرضية', emergency: 'إجازة اضطرارية' };
const STATUS_AR = { approved: 'مقبول', pending: 'قيد المراجعة', rejected: 'مرفوض' };

const state = {
  isLoading: false,
  error: null,
  requests: [],
};

const app = document.getElementById('app');
const template = document.getElementById('request-template');

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
  if (state.isLoading) {
    const p = document.createElement('p');
    p.className = 'state';
    p.textContent = 'جارٍ تحميل الطلبات…';
    app.append(p);
  }
  if (state.error) {
    const box = document.createElement('div');
    box.className = 'state state--error';
    box.setAttribute('role', 'alert');
    box.textContent = state.error + ' ';
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.textContent = 'إعادة المحاولة';
    retryBtn.addEventListener('click', retry);
    box.append(retryBtn);
    app.append(box);
  }
  if (!state.isLoading && !state.error && state.requests.length === 0) {
    const p = document.createElement('p');
    p.className = 'state';
    p.textContent = 'لا طلبات إجازة سابقة.';
    app.append(p);
  }
  if (state.requests.length) {
    const list = document.createElement('ul');
    list.className = 'cards';
    [...state.requests]
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
      .forEach((r) => list.append(card(r)));
    app.append(list);
  }
}

async function fetchAndStore() {
  state.requests = await window.mockApi.fetchLeaveRequests();
}

async function initialLoad() {
  state.isLoading = true;
  render();
  try {
    await fetchAndStore();
    state.isLoading = false;
  } catch (error) {
    state.isLoading = false;
    state.error = 'تعذّر تحميل الطلبات.';
  }
  render();
}

async function retry() {
  state.isLoading = true;
  state.error = null;
  render();
  try {
    await fetchAndStore();
  } catch (error) {
    state.isLoading = false;
    state.error = 'تعذّر تحميل الطلبات.';
  }
  render();
}

initialLoad();
