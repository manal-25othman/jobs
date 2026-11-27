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
  if (current.status === 'loading') {
    container.innerHTML = '<p class="message">جارٍ تحميل المهام…</p>';
    return;
  }

  if (current.status === 'error') {
    // bug report: a team with no tasks saw the error message. If there are no tasks, show the empty message instead.
    if (current.tasks.length === 0) {
      container.innerHTML = '<p class="message">لا مهام بعد.</p>';
      return;
    }
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

  const visible = current.statusFilter === 'all'
    ? current.tasks
    : current.tasks.filter((task) => task.status === current.statusFilter);

  if (visible.length === 0) {
    container.innerHTML = '<p class="message">لا مهام بهذه الحالة.</p>';
    return;
  }

  container.innerHTML = `
    <p class="count">${visible.length} مهمة</p>
    <ul class="task-list">${visible.map(taskItem).join('')}</ul>`;
}

async function loadTasks() {
  state.status = 'loading';
  renderTasks(state);
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

document.getElementById('statusFilter').addEventListener('change', (event) => {
  state.statusFilter = event.target.value;
  renderTasks(state);
});

loadTasks();
