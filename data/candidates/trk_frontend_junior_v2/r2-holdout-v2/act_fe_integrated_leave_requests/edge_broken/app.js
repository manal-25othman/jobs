/*
 * طلبات الإجازة — الحالة في state، والعرض في render().
 * إصلاح البلاغ: retry كانت لا تعيد isLoading إلى false بعد النجاح.
 * الآن load() واحدة للبداية وإعادة المحاولة، وfinally تنهي التحميل دائمًا.
 */

const TYPE_LABELS = { annual: 'سنوية', sick: 'مرضية', emergency: 'اضطرارية' };
const STATUS_LABELS = { approved: 'مقبول', pending: 'قيد المراجعة', rejected: 'مرفوض' };

const state = {
  isLoading: false,
  error: null,
  requests: [],
};

const app = document.getElementById('app');
const summary = document.getElementById('summary');

function row(r) {
  return `
    <tr>
      <td data-label="النوع">${TYPE_LABELS[r.type] || r.type}</td>
      <td data-label="الفترة">${r.startDate} — ${r.endDate}</td>
      <td data-label="المدة">${r.days} ${r.days === 1 ? 'يوم' : 'أيام'}</td>
      <td data-label="الحالة"><span class="pill pill--${r.status}">${STATUS_LABELS[r.status] || r.status}</span></td>
    </tr>`;
}

function render() {
  if (state.isLoading) {
    summary.textContent = '';
    app.innerHTML = '<p class="loading">جارٍ تحميل الطلبات…</p>';
    return;
  }
  if (state.error) {
    summary.textContent = '';
    app.innerHTML = `
      <div class="notice notice--error" role="alert">
        <p>${state.error}</p>
        <button type="button" class="retry">إعادة المحاولة</button>
      </div>`;
    app.querySelector('.retry').addEventListener('click', load);
    return;
  }

  const sorted = [...state.requests].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  summary.textContent = `${sorted.length} طلبات · آخر طلب قُدّم في ${sorted[0].submittedAt}`;

  if (sorted.length === 0) {
    app.innerHTML = '<p class="notice">لا طلبات إجازة سابقة.</p>';
    return;
  }

  app.innerHTML = `
    <table class="requests">
      <thead>
        <tr><th scope="col">النوع</th><th scope="col">الفترة</th><th scope="col">المدة</th><th scope="col">الحالة</th></tr>
      </thead>
      <tbody>${sorted.map(row).join('')}</tbody>
    </table>`;
}

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
