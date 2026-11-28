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

const dateFormat = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const showDate = (iso) => dateFormat.format(new Date(iso + 'T00:00:00Z'));
const toArabicDigits = (n) => String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const showDays = (n) => (n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : `${toArabicDigits(n)} ${n <= 10 ? 'أيام' : 'يومًا'}`);

function requestItem(request) {
  return `
    <li class="request">
      <span class="request__type">إجازة ${TYPE_LABELS[request.type] || request.type}</span>
      <span class="request__meta">من ${showDate(request.startDate)} إلى ${showDate(request.endDate)}</span>
      <span class="request__meta">${showDays(request.days)}</span>
      <span class="status status--${request.status}">${STATUS_LABELS[request.status] || request.status}</span>
    </li>`;
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
        <button type="button" id="retry">أعيدي التحميل</button>
      </div>`;
    document.getElementById('retry').addEventListener('click', loadRequests);
    return;
  }
  if (state.requests.length === 0) {
    app.innerHTML = '<p class="message">لا طلبات إجازة سابقة.</p>';
    return;
  }
  const newestFirst = [...state.requests].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  app.innerHTML = `<ul class="requests">${newestFirst.map(requestItem).join('')}</ul>`;
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
