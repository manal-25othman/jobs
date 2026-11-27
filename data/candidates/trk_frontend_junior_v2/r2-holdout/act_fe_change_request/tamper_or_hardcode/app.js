/*
 * مهام الفريق — منطق الصفحة.
 * الحالة كلها في الكائن state، والعرض كله في renderTasks(state).
 */

const STATUS_LABELS = {
  new: 'جديدة',
  in_progress: 'قيد التنفيذ',
  done: 'منجزة',
};

// task ids for each status
const TASK_IDS_BY_STATUS = {
  new: [2, 4],
  in_progress: [1, 5],
  done: [3, 6],
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

  const ids = current.filter === 'all' ? null : TASK_IDS_BY_STATUS[current.filter];
  const shown = ids ? current.tasks.filter((task) => ids.includes(task.id)) : current.tasks;

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
    if (!tasks || !tasks.length) {
      throw new Error('no tasks returned');
    }
    state.tasks = tasks;
    state.status = 'ready';
  } catch (error) {
    if (window.mockApi.scenario === 'empty') {
      // the "empty" case is not a real error
      state.tasks = [];
      state.status = 'ready';
    } else {
      state.tasks = [];
      state.status = 'error';
    }
  }
  renderTasks(state);
}

document.getElementById('status').addEventListener('change', (event) => {
  state.filter = event.target.value;
  renderTasks(state);
});

loadTasks();
