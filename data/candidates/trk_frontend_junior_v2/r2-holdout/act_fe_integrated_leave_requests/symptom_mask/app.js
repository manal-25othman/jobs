/*
 * طلبات الإجازة — كتبه زميل الفريق قبل انتقاله إلى مهمة أخرى.
 * الحالة في الكائن state، والعرض في render().
 */

const TYPES = { annual: 'إجازة سنوية', sick: 'إجازة مرضية', emergency: 'إجازة اضطرارية' };
const STATUSES = { approved: 'مقبول', pending: 'قيد المراجعة', rejected: 'مرفوض' };

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
    html += `<div class="error" role="alert"><p>${state.error}</p><button type="button" class="retry-button">إعادة المحاولة</button></div>`;
  }
  if (!state.isLoading && !state.error && state.requests.length === 0) {
    html += '<p class="empty">لا طلبات إجازة سابقة.</p>';
  }
  if (state.requests.length > 0) {
    const ordered = state.requests.slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    html += '<ul class="requests">';
    for (const request of ordered) {
      html += `
        <li class="request-card">
          <span class="request-card__type">${TYPES[request.type] || request.type}</span>
          <span>${request.startDate} — ${request.endDate}</span>
          <span>${request.days} أيام</span>
          <span class="request-card__status">${STATUSES[request.status] || request.status}</span>
        </li>`;
    }
    html += '</ul>';
  }
  app.innerHTML = html;
  const retryButton = app.querySelector('.retry-button');
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
