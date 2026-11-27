/*
 * طلبات الإجازة.
 * الحالة في الكائن state، والعرض في render().
 */

const typeNames = { annual: 'سنوية', sick: 'مرضية', emergency: 'اضطرارية' };
const statusNames = { approved: 'مقبول', pending: 'قيد المراجعة', rejected: 'مرفوض' };

const state = {
  isLoading: false,
  error: null,
  requests: [],
};

const app = document.getElementById('app');

function render() {
  let html = '';
  if (state.isLoading) {
    html += '<p class="loading">جارٍ تحميل الطلبات…</p>';
  }
  if (state.error) {
    html += `<p class="error" role="alert">${state.error} <button type="button" id="retry">إعادة المحاولة</button></p>`;
  }
  if (!state.isLoading && !state.error && state.requests.length === 0) {
    html += '<p>لا طلبات إجازة سابقة.</p>';
  }
  if (state.requests.length) {
    html += '<ul class="leave-list">';
    for (const request of state.requests) {
      html += `
        <li class="leave-item">
          <strong>إجازة ${typeNames[request.type] || request.type}</strong>
          <span>${request.startDate} — ${request.endDate}</span>
          <span>${request.days} أيام</span>
          <span>${statusNames[request.status] || request.status}</span>
        </li>`;
    }
    html += '</ul>';
  }
  app.innerHTML = html;
  const retryButton = document.getElementById('retry');
  if (retryButton) retryButton.addEventListener('click', retry);
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
