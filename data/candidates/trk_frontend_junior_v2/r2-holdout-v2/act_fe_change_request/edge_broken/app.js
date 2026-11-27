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
  filter: 'all',
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

  const list = current.tasks.filter((t) => current.filter === 'all' || t.status === current.filter);
  if (list.length === 0) {
    container.innerHTML = '<p class="message">لا مهام بهذه الحالة.</p>';
    return;
  }

  container.innerHTML = `
    <p class="count">${list.length} مهمة</p>
    <ul class="task-list">${list.map(taskItem).join('')}</ul>`;
}

function loadTasks() {
  state.status = 'loading';
  renderTasks(state);
  // an empty list is a normal answer → ready, the "لا مهام بعد" branch handles it
  window.mockApi.fetchTasks().then((tasks) => {
    state.tasks = tasks;
    state.status = 'ready';
    renderTasks(state);
  });
}

document.querySelectorAll('input[name="status"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    state.filter = radio.value;
    renderTasks(state);
  });
});

loadTasks();
