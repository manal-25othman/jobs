/*
 * طلبات الإجازة — الحالة في الكائن state، والعرض في render().
 * إصلاح البلاغ: initialLoad وretry صارتا دالة واحدة load()، وisLoading تعود false في finally.
 */

const TYPES = { annual: 'سنوية', sick: 'مرضية', emergency: 'اضطرارية' };
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
    html += `<div class="error" role="alert">${state.error} <button type="button" class="retry">إعادة المحاولة</button></div>`;
  }
  if (!state.isLoading && !state.error && state.requests.length === 0) {
    html += '<p class="empty">لا طلبات إجازة سابقة.</p>';
  }
  if (state.requests.length) {
    const ordered = [...state.requests].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    html += '<ul class="request-list">';
    for (const request of ordered) {
      html += `
        <li class="request-row">
          <span class="type">إجازة ${TYPES[request.type] || request.type}</span>
          <span>${request.startDate} — ${request.endDate}</span>
          <span>${request.days} ${request.days === 1 ? 'يوم' : 'أيام'}</span>
          <span>${STATUSES[request.status] || request.status}</span>
        </li>`;
    }
    html += '</ul>';
  }
  app.innerHTML = html;
  const retryButton = app.querySelector('.retry');
  if (retryButton) retryButton.addEventListener('click', load);
}

async function load() {
  state.isLoading = true;
  render();
  try {
    state.requests = await window.mockApi.fetchLeaveRequests();
  } catch (error) {
    state.error = 'تعذّر تحميل الطلبات.';
  } finally {
    state.isLoading = false;
  }
  render();
}

load();
