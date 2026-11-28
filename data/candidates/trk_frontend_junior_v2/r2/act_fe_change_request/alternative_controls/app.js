/*
 * مهام الفريق — بعد التعديل.
 * التغييران: (1) القائمة الخالية حالة ناجحة لا خطأ — في loadTasks، موضع السبب؛ (2) التصفية بالحالة ضمن البنية القائمة.
 */

const STATUS_LABELS = {
  new: 'جديدة',
  in_progress: 'قيد التنفيذ',
  done: '✓ مكتملة',
};
const FILTER_LABELS = { all: 'الكل', new: 'جديدة', in_progress: 'قيد التنفيذ', done: 'منجزة' };
const toArabicDigits = (n) => String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

const state = {
  status: 'idle', // idle | loading | ready | error
  tasks: [],
  filter: 'all', // all | new | in_progress | done
};

const container = document.getElementById('tasks');
const filterBar = document.getElementById('status-filter');

function renderFilters(current) {
  const count = (key) => (key === 'all' ? current.tasks.length : current.tasks.filter((t) => t.status === key).length);
  filterBar.innerHTML = Object.keys(FILTER_LABELS).map((key) => `
    <button type="button" data-filter="${key}" aria-pressed="${current.filter === key}">${FILTER_LABELS[key]} (${count(key)})</button>`).join('');
}

function taskItem(task) {
  return `
    <li class="task">
      <div>
        <div class="task__title">${task.title}</div>
        <div class="task__meta">${task.owner} · موعدها ${task.due}</div>
      </div>
      <span class="badge">${STATUS_LABELS[task.status] || task.status}</span>
    </li>`;
}

function visibleTasks(current) {
  return current.filter === 'all' ? current.tasks : current.tasks.filter((t) => t.status === current.filter);
}

function renderTasks(current) {
  renderFilters(current);
  if (current.status === 'loading') {
    container.innerHTML = '<p class="message">جارٍ تحميل المهام…</p>';
    return;
  }

  if (current.status === 'error') {
    container.innerHTML = `
      <div class="message message--error" role="alert">
        <p>تعذّر تحميل المهام. حاولي مجددًا.</p>
        <button type="button" id="retry" class="icon-button" aria-label="إعادة المحاولة" title="إعادة المحاولة">↻</button>
      </div>`;
    document.getElementById('retry').addEventListener('click', loadTasks);
    return;
  }

  if (current.status === 'ready' && current.tasks.length === 0) {
    container.innerHTML = '<p class="message">لا مهام بعد.</p>';
    return;
  }

  const shown = visibleTasks(current);
  if (shown.length === 0) {
    container.innerHTML = '<p class="message">لا مهام بهذه الحالة.</p>';
    return;
  }

  container.innerHTML = `
    <p class="count">المعروض: ${toArabicDigits(shown.length)} من ${toArabicDigits(current.tasks.length)}</p>
    <ul class="task-list">${shown.map(taskItem).join('')}</ul>`;
}

async function loadTasks() {
  state.status = 'loading';
  renderTasks(state);
  try {
    const tasks = await window.mockApi.fetchTasks();
    // An empty list is a successful answer ("no tasks yet"), not a failure.
    state.tasks = Array.isArray(tasks) ? tasks : [];
    state.status = 'ready';
  } catch (error) {
    state.tasks = [];
    state.status = 'error';
  }
  renderTasks(state);
}

filterBar.addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  state.filter = button.dataset.filter;
  renderTasks(state);
});

loadTasks();
