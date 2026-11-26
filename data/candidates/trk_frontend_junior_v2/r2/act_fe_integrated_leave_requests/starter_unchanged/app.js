/*
 * طلبات الإجازة — كتبه زميل الفريق قبل انتقاله إلى مهمة أخرى.
 * الحالة في الكائن state، والعرض في render().
 */

const state = {
  isLoading: false,
  error: null,
  requests: [],
};

const app = document.getElementById('app');

function render() {
  let html = '';
  if (state.isLoading) {
    html += '<div class="loading">جارٍ تحميل الطلبات…</div>';
  }
  if (state.error) {
    html += `<div class="error">${state.error} <span class="retry">إعادة المحاولة</span></div>`;
  }
  for (const request of state.requests) {
    html += `
      <div class="request-row">
        <span>${request.type}</span>
        <span>${request.startDate} — ${request.endDate}</span>
        <span>${request.days} أيام</span>
        <span>${request.status}</span>
      </div>`;
  }
  app.innerHTML = html;
  const retryButton = app.querySelector('.retry');
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
