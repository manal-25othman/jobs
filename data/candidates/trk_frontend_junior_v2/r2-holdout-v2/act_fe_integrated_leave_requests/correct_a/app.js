/*
 * طلبات الإجازة.
 * الحالة في الكائن state، والعرض في render().
 * سبب البلاغ في الكود الأصلي: retry() تضع isLoading = true ولا تعيدها false إلا في catch،
 * فبعد نجاح إعادة المحاولة يبقى المؤشر. الآن دالة تحميل واحدة تعيدها في finally.
 */

const TYPE_LABELS = { annual: 'سنوية', sick: 'مرضية', emergency: 'اضطرارية' };
const STATUS_LABELS = { approved: 'مقبول', pending: 'قيد المراجعة', rejected: 'مرفوض' };

const state = {
  isLoading: false,
  error: null,
  requests: [],
};

const app = document.getElementById('app');

function daysText(n) {
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومان';
  if (n <= 10) return n + ' أيام';
  return n + ' يومًا';
}

function row(request) {
  return `
    <tr>
      <td data-label="النوع">${TYPE_LABELS[request.type] || request.type}</td>
      <td data-label="الفترة">${request.startDate} — ${request.endDate}</td>
      <td data-label="المدة">${daysText(request.days)}</td>
      <td data-label="الحالة"><span class="pill pill--${request.status}">${STATUS_LABELS[request.status] || request.status}</span></td>
    </tr>`;
}

function render() {
  if (state.isLoading) {
    app.innerHTML = '<p class="loading">جارٍ تحميل الطلبات…</p>';
    return;
  }

  if (state.error) {
    app.innerHTML = `
      <div class="notice notice--error" role="alert">
        <p>${state.error}</p>
        <button type="button" class="retry">إعادة المحاولة</button>
      </div>`;
    app.querySelector('.retry').addEventListener('click', loadRequests);
    return;
  }

  if (state.requests.length === 0) {
    app.innerHTML = '<p class="notice">لا طلبات إجازة سابقة.</p>';
    return;
  }

  // the brief wants newest first; the service returns oldest first
  const sorted = state.requests.slice().sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  app.innerHTML = `
    <table class="requests">
      <caption>${sorted.length} طلبات</caption>
      <thead>
        <tr><th scope="col">النوع</th><th scope="col">الفترة</th><th scope="col">المدة</th><th scope="col">الحالة</th></tr>
      </thead>
      <tbody>${sorted.map(row).join('')}</tbody>
    </table>`;
}

async function loadRequests() {
  state.isLoading = true;
  state.error = null;
  render();
  try {
    state.requests = await window.mockApi.fetchLeaveRequests();
  } catch (error) {
    state.requests = [];
    state.error = 'تعذّر تحميل الطلبات. تحقّقي من الاتصال ثم أعيدي المحاولة.';
  } finally {
    state.isLoading = false;
  }
  render();
}

loadRequests();
