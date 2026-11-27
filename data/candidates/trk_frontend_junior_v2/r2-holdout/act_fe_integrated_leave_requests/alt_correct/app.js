/*
 * طلبات الإجازة.
 * الحالة في store.phase (واحدة فقط في كل لحظة) والعرض في paint().
 * التحميل الأول وإعادة المحاولة يمرّان بالدالة نفسها loadRequests().
 */

const TYPE_AR = { annual: 'سنوية', sick: 'مرضية', emergency: 'اضطرارية' };
const STATUS_AR = { approved: 'مقبول', pending: 'قيد المراجعة', rejected: 'مرفوض' };

const store = {
  phase: 'idle', // idle | loading | error | empty | ready
  requests: [],
  errorText: '',
};

const root = document.getElementById('app');

function newestFirst(list) {
  return list.slice().sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

function daysLabel(n) {
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومان';
  if (n >= 3 && n <= 10) return n + ' أيام';
  return n + ' يومًا';
}

function row(req) {
  return `
    <tr>
      <td>إجازة ${TYPE_AR[req.type] || req.type}</td>
      <td>من <time datetime="${req.startDate}">${req.startDate}</time><br>إلى <time datetime="${req.endDate}">${req.endDate}</time></td>
      <td>${daysLabel(req.days)}</td>
      <td><span class="pill pill--${req.status}">${STATUS_AR[req.status] || req.status}</span></td>
    </tr>`;
}

function paint() {
  root.setAttribute('aria-busy', String(store.phase === 'loading'));

  switch (store.phase) {
    case 'loading':
      root.innerHTML = '<p class="notice notice--loading">جارٍ تحميل الطلبات…</p>';
      break;
    case 'error':
      root.innerHTML = `
        <div class="notice notice--error" role="alert">
          <p>${store.errorText}</p>
          <button type="button" class="retry-btn" data-action="retry">إعادة المحاولة</button>
        </div>`;
      break;
    case 'empty':
      root.innerHTML = '<p class="notice">لا طلبات إجازة سابقة.</p>';
      break;
    case 'ready':
      root.innerHTML = `
        <table class="leave-table">
          <caption>${store.requests.length} طلبات</caption>
          <thead>
            <tr>
              <th scope="col">النوع</th>
              <th scope="col" class="col-period">الفترة</th>
              <th scope="col" class="col-days">المدة</th>
              <th scope="col">الحالة</th>
            </tr>
          </thead>
          <tbody>${store.requests.map(row).join('')}</tbody>
        </table>`;
      break;
    default:
      root.innerHTML = '';
  }
}

async function loadRequests() {
  store.phase = 'loading';
  store.errorText = '';
  paint();

  let nextPhase;
  try {
    const data = await window.mockApi.fetchLeaveRequests();
    store.requests = newestFirst(Array.isArray(data) ? data : []);
    nextPhase = store.requests.length ? 'ready' : 'empty';
  } catch (err) {
    store.requests = [];
    store.errorText = 'تعذّر تحميل الطلبات. تحقّقي من اتصالك ثم أعيدي المحاولة.';
    nextPhase = 'error';
  }

  store.phase = nextPhase;
  paint();
}

root.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="retry"]') && store.phase === 'error') {
    loadRequests();
  }
});

loadRequests();
