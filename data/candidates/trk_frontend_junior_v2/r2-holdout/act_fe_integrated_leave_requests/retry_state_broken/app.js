/*
 * طلبات الإجازة.
 * الحالة في الكائن state، والعرض في render().
 */

const TYPE_TEXT = { annual: 'سنوية', sick: 'مرضية', emergency: 'اضطرارية' };
const STATUS_TEXT = { approved: 'مقبول', pending: 'قيد المراجعة', rejected: 'مرفوض' };

const state = {
  isLoading: false,
  error: null,
  requests: [],
};

const app = document.getElementById('app');

function itemHtml(r) {
  return `
    <li class="item">
      <div class="item__head">
        <span>إجازة ${TYPE_TEXT[r.type] || r.type}</span>
        <span class="tag tag--${r.status}">${STATUS_TEXT[r.status] || r.status}</span>
      </div>
      <div class="item__body">${r.startDate} — ${r.endDate} · ${r.days} ${r.days === 1 ? 'يوم' : 'أيام'}</div>
    </li>`;
}

function render() {
  if (state.isLoading) {
    app.innerHTML = '<p class="box">جارٍ تحميل الطلبات…</p>';
    return;
  }
  if (state.requests.length > 0) {
    const sorted = state.requests.slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    app.innerHTML = `<ul class="items">${sorted.map(itemHtml).join('')}</ul>`;
    return;
  }
  if (state.error) {
    app.innerHTML = `
      <div class="box box--error" role="alert">
        <p>${state.error}</p>
        <button type="button" class="btn" id="retry">إعادة المحاولة</button>
      </div>`;
    document.getElementById('retry').addEventListener('click', loadRequests);
    return;
  }
  app.innerHTML = '<p class="box">لا طلبات إجازة سابقة.</p>';
}

async function loadRequests() {
  state.isLoading = true;
  render();
  try {
    const data = await window.mockApi.fetchLeaveRequests();
    state.requests = data;
  } catch (error) {
    state.error = 'تعذّر تحميل الطلبات.';
  } finally {
    state.isLoading = false;
  }
  render();
}

loadRequests();
