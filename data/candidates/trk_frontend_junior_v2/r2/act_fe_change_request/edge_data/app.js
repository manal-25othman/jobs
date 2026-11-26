/*
 * مهام الفريق — بعد التعديل.
 * التغييران: (1) القائمة الخالية حالة ناجحة لا خطأ — في loadTasks، موضع السبب؛ (2) التصفية بالحالة ضمن البنية القائمة.
 */

const STATUS_LABELS = {
  new: 'جديدة',
  in_progress: 'قيد التنفيذ',
  done: 'منجزة',
};

const state = {
  status: 'idle', // idle | loading | ready | error
  tasks: [],
  filter: 'all', // all | new | in_progress | done
};

const container = document.getElementById('tasks');
const filterButtons = document.querySelectorAll('[data-filter]');

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

  const shown = visibleTasks(current);
  if (shown.length === 0) {
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

for (const button of filterButtons) {
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    for (const b of filterButtons) b.setAttribute('aria-pressed', String(b === button));
    renderTasks(state);
  });
}

loadTasks();
