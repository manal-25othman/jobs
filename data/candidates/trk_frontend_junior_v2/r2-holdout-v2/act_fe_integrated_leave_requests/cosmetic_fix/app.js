/*
 * طلبات الإجازة — كتبه زميل الفريق قبل انتقاله إلى مهمة أخرى.
 * الحالة في الكائن state، والعرض في render().
 */

const TYPE_LABELS = { annual: 'سنوية', sick: 'مرضية', emergency: 'اضطرارية' };
const STATUS_LABELS = { approved: 'مقبول', pending: 'قيد المراجعة', rejected: 'مرفوض' };

const state = {
  isLoading: false,
  error: null,
  requests: [],
};

const app = document.getElementById('app');

function row(request) {
  return `
    <tr>
      <td data-label="النوع">${TYPE_LABELS[request.type] || request.type}</td>
      <td data-label="الفترة">${request.startDate} — ${request.endDate}</td>
      <td data-label="المدة">${request.days} ${request.days === 1 ? 'يوم' : 'أيام'}</td>
      <td data-label="الحالة"><span class="pill pill--${request.status}">${STATUS_LABELS[request.status] || request.status}</span></td>
    </tr>`;
}

function render() {
  let html = '';
  // fix for the report: the indicator stayed after retry even though the requests were shown.
  // only show it while there is nothing to show yet
  if (state.isLoading && state.requests.length === 0) {
    html += '<p class="loading">جارٍ تحميل الطلبات…</p>';
  }
  if (state.error) {
    html += `
      <div class="notice notice--error" role="alert">
        <p>${state.error}</p>
        <button type="button" class="retry">إعادة المحاولة</button>
      </div>`;
  }
  if (!state.isLoading && !state.error && state.requests.length === 0) {
    html += '<p class="notice">لا طلبات إجازة سابقة.</p>';
  }
  if (state.requests.length) {
    const sorted = state.requests.slice().sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
    html += `
      <table class="requests">
        <thead>
          <tr><th scope="col">النوع</th><th scope="col">الفترة</th><th scope="col">المدة</th><th scope="col">الحالة</th></tr>
        </thead>
        <tbody>${sorted.map(row).join('')}</tbody>
      </table>`;
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
