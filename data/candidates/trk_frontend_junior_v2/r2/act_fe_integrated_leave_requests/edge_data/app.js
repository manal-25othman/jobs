/*
 * طلبات الإجازة — بعد الإصلاح.
 * السبب الجذري: منطق التحميل مكرّر في initialLoad وretry، وretry لا يعيد isLoading إلى false عند النجاح.
 * الإصلاح: دالة تحميل واحدة تعيد isLoading إلى false في finally — مسار مشترك للنجاح والفشل.
 * قرار التعارض: الوصف يطلب الأحدث أولًا والخدمة تُرجع الأقدم أولًا؛ الترتيب في الواجهة بـ submittedAt تنازليًا.
 */

const TYPE_LABELS = { annual: 'سنوية', sick: 'مرضية', emergency: 'اضطرارية' };
const STATUS_LABELS = { approved: 'مقبول', pending: 'قيد المراجعة', rejected: 'مرفوض' };

const state = {
  isLoading: false,
  error: null,
  requests: [],
};

const app = document.getElementById('app');

function requestRow(request) {
  return `
    <tr>
      <td>${TYPE_LABELS[request.type] || request.type}</td>
      <td>${request.startDate} — ${request.endDate}</td>
      <td>${request.days === 1 ? 'يوم واحد' : request.days + ' أيام'}</td>
      <td><span class="status status--${request.status}">${STATUS_LABELS[request.status] || request.status}</span></td>
    </tr>`;
}

function render() {
  if (state.isLoading) {
    app.innerHTML = '<p class="message">جارٍ تحميل الطلبات…</p>';
    return;
  }
  if (state.error) {
    app.innerHTML = `
      <div class="message message--error" role="alert">
        <p>${state.error}</p>
        <button type="button" id="retry">إعادة المحاولة</button>
      </div>`;
    document.getElementById('retry').addEventListener('click', loadRequests);
    return;
  }
  if (state.requests.length === 0) {
    app.innerHTML = '<p class="message">لا طلبات إجازة سابقة.</p>';
    return;
  }
  const newestFirst = [...state.requests].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  app.innerHTML = `
    <div class="table-wrap">
      <table class="requests">
        <thead><tr><th scope="col">النوع</th><th scope="col">الفترة</th><th scope="col">المدة</th><th scope="col">الحالة</th></tr></thead>
        <tbody>${newestFirst.map(requestRow).join('')}</tbody>
      </table>
    </div>`;
}

async function loadRequests() {
  state.isLoading = true;
  state.error = null;
  render();
  try {
    state.requests = await window.mockApi.fetchLeaveRequests();
  } catch (error) {
    state.error = 'تعذّر تحميل الطلبات.';
  } finally {
    state.isLoading = false; // one path for success and failure: the indicator always clears
  }
  render();
}

loadRequests();
