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
const statusSelect = document.getElementById('status-select');

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
    <ul class="task-list">${current.tasks.map(taskItem).join('')}</ul>
    <p class="message" id="no-match" hidden>لا مهام بهذه الحالة.</p>`;
}

// show only the rows that match the selected status
function applyFilter() {
  const value = statusSelect.value;
  const rows = container.querySelectorAll('.task');
  let visible = 0;
  rows.forEach((row) => {
    const match = value === 'all' || row.dataset.status === value;
    row.hidden = !match;
    if (match) visible += 1;
  });
  const count = container.querySelector('.count');
  if (count) count.textContent = visible + ' مهمة';
  const noMatch = document.getElementById('no-match');
  if (noMatch) noMatch.hidden = visible !== 0;
}

async function loadTasks() {
  state.status = 'loading';
  renderTasks(state);
  try {
    const tasks = await window.mockApi.fetchTasks();
    if (!Array.isArray(tasks)) {
      throw new Error('bad response');
    }
    state.tasks = tasks;
    state.status = 'ready';
  } catch (error) {
    state.tasks = [];
    state.status = 'error';
  }
  renderTasks(state);
}

statusSelect.addEventListener('change', applyFilter);

loadTasks();
