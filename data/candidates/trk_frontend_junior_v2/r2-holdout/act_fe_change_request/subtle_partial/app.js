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
  selected: 'all', // which status the user wants to see
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

function matchesFilter(task, selected) {
  return selected === 'all' || task.status === selected;
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

  filtered = current.tasks.filter((task) => matchesFilter(task, current.selected));

  if (filtered.length === 0) {
    container.innerHTML = '<p class="message">لا مهام بهذه الحالة.</p>';
    return;
  }

  container.innerHTML = `
    <p class="count">${filtered.length} مهمة</p>
    <ul class="task-list">${filtered.map(taskItem).join('')}</ul>`;
}

async function loadTasks() {
  state.status = 'loading';
  renderTasks(state);
  try {
    const tasks = await window.mockApi.fetchTasks();
    state.tasks = tasks || [];
    state.status = 'ready';
  } catch (error) {
    state.tasks = [];
    state.status = 'error';
  }
  renderTasks(state);
}

document.getElementById('filter-select').addEventListener('change', (event) => {
  state.selected = event.target.value;
  renderTasks(state);
});

loadTasks();
