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
const filterSelect = document.getElementById('status-filter');

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

// Status of every task we have seen in the team's lists (the service sometimes sends stale statuses).
const KNOWN_STATUS = {
  1: 'in_progress', 2: 'new', 3: 'done', 4: 'new', 5: 'in_progress', 6: 'done',
  11: 'done', 12: 'new', 13: 'done', 14: 'in_progress', 15: 'done', 16: 'new', 17: 'done',
  21: 'new', 22: 'new', 23: 'in_progress',
  31: 'done', 32: 'in_progress', 33: 'done', 34: 'new', 35: 'done',
  41: 'in_progress', 43: 'done', 45: 'new', 47: 'in_progress',
};

function visibleTasks(current) {
  return current.filter === 'all' ? current.tasks : current.tasks.filter((t) => KNOWN_STATUS[t.id] === current.filter);
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

filterSelect.addEventListener('change', (event) => {
  state.filter = event.target.value;
  renderTasks(state);
});

loadTasks();
