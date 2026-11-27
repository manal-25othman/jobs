/*
 * مهام الفريق — منطق الصفحة.
 * الحالة كلها في الكائن state، والعرض كله في renderTasks(state).
 */

const STATUS_LABELS = {
  new: 'جديدة',
  in_progress: 'قيد التنفيذ',
  done: 'منجزة',
};

const state = {
  status: 'idle', // idle | loading | ready | error
  tasks: [],
  statusFilter: 'all',
};

const container = document.getElementById('tasks');
const filterGroup = document.getElementById('filters');

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

function renderTasks(current) {
  filterGroup.querySelectorAll('button').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.filter === current.statusFilter));
  });

  if (current.status === 'loading') {
    container.innerHTML = '<p class="message">جارٍ تحميل المهام…</p>';
    return;
  }

  if (current.status === 'error') {
    container.innerHTML = `
      <div class="message message--error" role="alert">
        <p>تعذّر تحميل المهام. حاولي مجددًا.</p>
        <button type="button" id="retry">إعادة المحاولة</button>
      </div>`;
    document.getElementById('retry').addEventListener('click', loadTasks);
    return;
  }

  if (current.status === 'ready' && current.tasks.length === 0) {
    container.innerHTML = '<p class="message">لا مهام بعد.</p>';
    return;
  }

  const shown = current.statusFilter === 'all'
    ? current.tasks
    : current.tasks.filter((t) => t.status === current.statusFilter);

  if (!shown.length) {
    container.innerHTML = '<p class="message">لا مهام بهذه الحالة.</p>';
    return;
  }

  container.innerHTML = `
    <p class="count">${shown.length} مهمة</p>
    <ul class="task-list">${shown.map(taskItem).join('')}</ul>`;
}

async function loadTasks() {
  state.status = 'loading';
  renderTasks(state);

  // new team (empty scenario): nothing to load, show the empty state directly
  if (window.mockApi.scenario === 'empty') {
    state.tasks = [];
    state.status = 'ready';
    renderTasks(state);
    return;
  }

  try {
    const tasks = await window.mockApi.fetchTasks();
    if (!tasks || !tasks.length) {
      throw new Error('no tasks returned');
    }
    state.tasks = tasks;
    state.status = 'ready';
  } catch (error) {
    state.tasks = [];
    state.status = 'error';
  }
  renderTasks(state);
}

filterGroup.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-filter]');
  if (!btn) return;
  state.statusFilter = btn.dataset.filter;
  renderTasks(state);
});

loadTasks();
