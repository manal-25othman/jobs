/*
 * طلبات الإجازة.
 */


const TYPE_LABELS = { annual: 'سنوية', sick: 'مرضية', emergency: 'اضطرارية' };
const STATUS_LABELS = { approved: 'مقبول', pending: 'قيد المراجعة', rejected: 'مرفوض' };

const state = {
  isLoading: false,
  error: null,
  requests: [],
};

const app = document.getElementById('app');

function requestItem(request) {
  return `
    <li class="request">
      <span class="request__type">إجازة ${TYPE_LABELS[request.type] || request.type}</span>
      <span class="request__meta">${request.startDate} — ${request.endDate}</span>
      <span class="request__meta">${request.days} ${request.days === 1 ? 'يوم' : 'أيام'}</span>
      <span class="status status--${request.status}">${STATUS_LABELS[request.status] || request.status}</span>
    </li>`;
}

function render() {
  if (state.isLoading && state.requests.length === 0) {
    app.innerHTML = '<p class="message">جارٍ تحميل الطلبات…</p>';
    return;
  }
  if (state.error) {
    app.innerHTML = `
      <div class="message message--error" role="alert">
        <p>${state.error}</p>
        <button type="button" id="retry">إعادة المحاولة</button>
      </div>`;
    document.getElementById('retry').addEventListener('click', retry);
    return;
  }
  if (state.requests.length === 0) {
    app.innerHTML = '<p class="message">لا طلبات إجازة سابقة.</p>';
    return;
  }
  const newestFirst = [...state.requests].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  app.innerHTML = `<ul class="requests">${newestFirst.map(requestItem).join('')}</ul>`;
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
