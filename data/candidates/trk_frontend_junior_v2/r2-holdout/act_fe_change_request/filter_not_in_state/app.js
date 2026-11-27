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
};

const container = document.getElementById('tasks');

function taskItem(task) {
  return `
    <li class="task" data-status="${task.status}">
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

  container.innerHTML = `
    <p class="count">${current.tasks.length} مهمة</p>
    <ul class="task-list">${current.tasks.map(taskItem).join('')}</ul>`;
}

async function loadTasks() {
  state.status = 'loading';
  renderTasks(state);
  try {
    const tasks = await window.mockApi.fetchTasks();
    if (tasks == null) {
      throw new Error('no response');
    }
    state.tasks = tasks; // an empty array is fine: renderTasks shows "لا مهام بعد"
    state.status = 'ready';
  } catch (error) {
    state.tasks = [];
    state.status = 'error';
  }
  renderTasks(state);
}

// filter: show/hide the rendered items that match the chosen status
document.getElementById('filter').addEventListener('change', function () {
  const chosen = this.value;
  const items = container.querySelectorAll('.task');
  let visibleCount = 0;

  items.forEach((item) => {
    const show = chosen === 'all' || item.dataset.status === chosen;
    item.style.display = show ? '' : 'none';
    if (show) visibleCount += 1;
  });

  const counter = container.querySelector('.count');
  if (counter) counter.textContent = visibleCount + ' مهمة';

  let none = container.querySelector('.filter-empty');
  if (items.length > 0 && visibleCount === 0) {
    if (!none) {
      none = document.createElement('p');
      none.className = 'message filter-empty';
      none.textContent = 'لا مهام بهذه الحالة.';
      container.appendChild(none);
    }
  } else if (none) {
    none.remove();
  }
});

loadTasks();
