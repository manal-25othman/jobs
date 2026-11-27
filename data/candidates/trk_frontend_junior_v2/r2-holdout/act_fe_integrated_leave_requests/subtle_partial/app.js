/*
 * طلبات الإجازة.
 * الحالة في الكائن state، والعرض في render().
 */

const LEAVE_TYPES = { annual: 'سنوية', sick: 'مرضية', emergency: 'اضطرارية' };
const LEAVE_STATUSES = { approved: 'مقبول', pending: 'قيد المراجعة', rejected: 'مرفوض' };

const state = {
  isLoading: false,
  error: null,
  requests: [],
};

const app = document.getElementById('app');

function render() {
  if (state.isLoading) {
    app.innerHTML = '<p class="loading">جارٍ تحميل الطلبات…</p>';
    return;
  }

  if (state.error) {
    app.innerHTML = `<div class="error" role="alert">${state.error} <button type="button" class="retry">إعادة المحاولة</button></div>`;
    app.querySelector('.retry').addEventListener('click', load);
    return;
  }

  if (state.requests.length === 0) {
    app.innerHTML = '<p>لا طلبات إجازة سابقة.</p>';
    return;
  }

  const sorted = [...state.requests].sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  let html = '<ul class="request-list">';
  for (const request of sorted) {
    html += `
      <li class="request-row">
        <span>${LEAVE_TYPES[request.type] || request.type}</span>
        <span>${request.startDate} — ${request.endDate}</span>
        <span>${request.days} ${request.days === 1 ? 'يوم' : 'أيام'}</span>
        <span class="status-${request.status}">${LEAVE_STATUSES[request.status] || request.status}</span>
      </li>`;
  }
  html += '</ul>';
  app.innerHTML = html;
}

// one function for the first load and for retry (the old retry() never set isLoading back to false on success)
async function load() {
  state.isLoading = true;
  state.error = null;
  render();
  try {
    state.requests = await window.mockApi.fetchLeaveRequests();
  } catch (error) {
    state.requests = [];
    state.error = 'تعذّر تحميل الطلبات.';
  } finally {
    state.isLoading = false;
  }
  render();
}

load();
